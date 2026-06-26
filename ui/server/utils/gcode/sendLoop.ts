import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { preprocessGCode } from './preprocessor'
import { simulateToLine } from './simulator'
import { saveCheckpoint, loadCheckpoint, clearCheckpoint } from './checkpoint'
import { broadcastPatch, setJobState } from '../appState'
import { machineConnection } from '../machine/connection'
import type { GCodeLine, GCodeModalState, JobState } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const JOBS_DIR = join(DATA_DIR, 'jobs')

// Buffer throttle: keep at most this many estimated milliseconds of work queued in FluidNC
const BUFFER_TARGET_MS = 2000
// How often the send loop ticks
const TICK_INTERVAL_MS = 50
// Checkpoint every N lines or every M ms (whichever triggers first)
const CHECKPOINT_LINES = 50
const CHECKPOINT_MS = 5000
// Recovery backs up this many estimated seconds from the checkpoint pointer
const RECOVERY_LOOKBACK_MS = 30_000
// Safe Z lift applied before any XY move in the resume sequence (mm above last Z)
const RESUME_SAFE_Z_LIFT = 5

class JobEngine {
  private lines: GCodeLine[] = []
  private fileId: string | null = null
  private filename: string | null = null
  private sendPtr = 0
  private jobStartTime = 0
  private pausedAt = 0
  private lastCheckpointPtr = -1
  private lastCheckpointTime = 0
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private _status: JobState['status'] = 'idle'
  private pauseModalState: GCodeModalState | null = null
  private pendingGQuery = false

  get status() { return this._status }

  async loadJob(fileId: string): Promise<void> {
    if (this._status === 'running' || this._status === 'pausing') {
      this._broadcastError('Cannot load a job while one is running. Pause or cancel first.')
      return
    }
    try {
      const filePath = join(JOBS_DIR, fileId)
      const content = await readFile(filePath, 'utf8')
      const filename = fileId.replace(/^[0-9a-f-]+-/i, '') // strip uuid prefix
      const { lines, axisRanges } = preprocessGCode(content)

      this.lines = lines
      this.fileId = fileId
      this.filename = filename
      this.sendPtr = 0
      this.pauseModalState = null

      const estimatedTotalMs = lines.at(-1)?.cumulativeDurationMs ?? 0
      this._setStatus('loaded', {
        fileId,
        filename,
        totalLines: lines.length,
        sendPtr: 0,
        estimatedTotalMs,
        startWallClock: null,
        axisRanges,
        recovery: null,
        errorMessage: null,
      })

      // Check for a recoverable checkpoint from a previous run of this file
      const checkpoint = await loadCheckpoint()
      if (checkpoint && checkpoint.fileId === fileId && checkpoint.sendPtr > 0) {
        const resumePtr = this._calcResumePtr(checkpoint.sendPtr)
        const modalStateAtResume = simulateToLine(this.lines, resumePtr)
        broadcastPatch([setJobState({
          recovery: {
            available: true,
            checkpointPtr: checkpoint.sendPtr,
            resumePtr,
            modalStateAtResume,
          },
        })])
      }
    } catch (err) {
      this._broadcastError(`Failed to load job: ${(err as Error).message}`)
    }
  }

  start(): void {
    if (this._status !== 'loaded' && this._status !== 'paused') return
    if (!this.lines.length) return

    this.jobStartTime = Date.now() - (this.lines[this.sendPtr]?.cumulativeDurationMs ?? 0)
    this._setStatus('running', { startWallClock: this.jobStartTime })
    this._startTick()
  }

  pause(): void {
    if (this._status !== 'running') return
    this._setStatus('pausing')
    this.pausedAt = Date.now()
    this._stopTick()
    // Resume sequence triggers when the machine reports Idle (via onMachineIdle)
    // and we receive the $G response (via onGQueryResponse)
  }

  /** Called by the poller when the machine transitions to Idle. */
  onMachineIdle(): void {
    if (this._status !== 'pausing') return
    // Query modal state from the machine itself
    this.pendingGQuery = true
    machineConnection.sendRaw('$G')
  }

  /** Called by the WS handler when a $G response line arrives. */
  onGQueryResponse(line: string, lastMachineStatus: { wpos: { x: number; y: number; z: number }; spindleSpeed: number; spindleOn: boolean; coolantMist: boolean; coolantFlood: boolean } | null): void {
    if (!this.pendingGQuery) return
    this.pendingGQuery = false

    // Import inline to avoid circular at module load time
    const { parseGQueryResponse } = require('../machine/statusParser') as typeof import('../machine/statusParser')
    const gModal = parseGQueryResponse(line)
    if (!gModal) return

    // Build pauseModalState from $G response + live telemetry for values $G doesn't cover
    this.pauseModalState = {
      position: lastMachineStatus
        ? { x: lastMachineStatus.wpos.x, y: lastMachineStatus.wpos.y, z: lastMachineStatus.wpos.z }
        : { x: 0, y: 0, z: 0 },
      positionMode: gModal.positionMode ?? 'G90',
      workCoordinate: gModal.workCoordinate ?? 'G54',
      feedRate: gModal.feedRate ?? 0,
      spindleSpeed: lastMachineStatus?.spindleSpeed ?? gModal.spindleSpeed ?? 0,
      spindleMode: gModal.spindleMode ?? (lastMachineStatus?.spindleOn ? 'M3' : 'M5'),
      coolant: lastMachineStatus?.coolantFlood
        ? 'M8'
        : lastMachineStatus?.coolantMist
          ? 'M7'
          : (gModal.coolant ?? 'off'),
      units: gModal.units ?? 'G21',
      plane: gModal.plane ?? 'G17',
      toolNumber: gModal.toolNumber ?? 0,
    }

    this._setStatus('paused')
  }

  resume(): void {
    if (this._status !== 'paused') return

    const modal = this.pauseModalState
    if (!modal) {
      // No modal state captured — just resume sending
      this._resumeSend()
      return
    }

    // Send the recovery/resume sequence
    const seq = this._buildRecoverySequence(modal, modal.position.z + RESUME_SAFE_Z_LIFT)
    for (const cmd of seq) machineConnection.sendRaw(cmd)

    this.pauseModalState = null
    this._resumeSend()
  }

  cancel(): void {
    this._stopTick()
    this._setStatus('cancelled', {
      startWallClock: null,
      recovery: null,
    })
    clearCheckpoint().catch(() => {})
  }

  clear(): void {
    if (this._status === 'running') return
    this._stopTick()
    this.lines = []
    this.sendPtr = 0
    this.fileId = null
    broadcastPatch([setJobState({
      status: 'idle',
      fileId: null,
      filename: null,
      totalLines: 0,
      sendPtr: 0,
      estimatedTotalMs: 0,
      startWallClock: null,
      axisRanges: null,
      recovery: null,
      errorMessage: null,
    })])
  }

  /** On server startup — check for a checkpoint and prepare recovery info. */
  async checkForRecovery(): Promise<JobState['recovery']> {
    const checkpoint = await loadCheckpoint()
    if (!checkpoint || checkpoint.sendPtr <= 0) return null

    // Load the file to run the simulator
    try {
      const filePath = join(JOBS_DIR, checkpoint.fileId)
      const content = await readFile(filePath, 'utf8')
      const { lines } = preprocessGCode(content)
      const resumePtr = this._calcResumePtr(checkpoint.sendPtr)
      const modalStateAtResume = simulateToLine(lines, resumePtr)
      return {
        available: true,
        checkpointPtr: checkpoint.sendPtr,
        resumePtr,
        modalStateAtResume,
      }
    } catch {
      return null
    }
  }

  /** User confirmed recovery — load the job from checkpoint.sendPtr and start. */
  async confirmRecovery(resumePtr: number): Promise<void> {
    const checkpoint = await loadCheckpoint()
    if (!checkpoint) return

    try {
      const content = await readFile(join(JOBS_DIR, checkpoint.fileId), 'utf8')
      const filename = checkpoint.filename
      const { lines, axisRanges } = preprocessGCode(content)
      this.lines = lines
      this.fileId = checkpoint.fileId
      this.filename = filename
      this.sendPtr = resumePtr

      const modal = simulateToLine(lines, resumePtr)
      this.pauseModalState = modal

      const estimatedTotalMs = lines.at(-1)?.cumulativeDurationMs ?? 0
      this._setStatus('recovering', {
        fileId: checkpoint.fileId,
        filename,
        totalLines: lines.length,
        sendPtr: resumePtr,
        estimatedTotalMs,
        axisRanges,
        recovery: null,
        errorMessage: null,
      })

      // Send recovery sequence, then start sending
      const seq = this._buildRecoverySequence(modal, modal.position.z + RESUME_SAFE_Z_LIFT)
      for (const cmd of seq) machineConnection.sendRaw(cmd)
      this.pauseModalState = null
      this._resumeSend()
    } catch (err) {
      this._broadcastError(`Recovery failed: ${(err as Error).message}`)
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private _resumeSend(): void {
    // Shift jobStartTime so the buffer estimate stays accurate from sendPtr
    const cumulativeAtSendPtr = this.lines[this.sendPtr]?.cumulativeDurationMs ?? 0
    this.jobStartTime = Date.now() - cumulativeAtSendPtr
    this._setStatus('running', { startWallClock: this.jobStartTime })
    this._startTick()
  }

  private _startTick(): void {
    if (this.tickTimer) return
    this.tickTimer = setInterval(() => this._tick(), TICK_INTERVAL_MS)
  }

  private _stopTick(): void {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
  }

  private _tick(): void {
    if (this._status !== 'running') { this._stopTick(); return }
    if (!machineConnection.isConnected) {
      this._stopTick()
      this._setStatus('paused', { errorMessage: 'Machine disconnected during job' })
      return
    }
    while (this._canSend()) {
      const line = this.lines[this.sendPtr]!
      machineConnection.sendRaw(line.raw)
      this.sendPtr++
      broadcastPatch([setJobState({ sendPtr: this.sendPtr })])
      this._checkpointIfDue()
    }
    if (this.sendPtr >= this.lines.length && this._inBufferMs() <= 0) {
      this._stopTick()
      this._setStatus('complete', { startWallClock: null })
      clearCheckpoint().catch(() => {})
    }
  }

  private _canSend(): boolean {
    if (this.sendPtr >= this.lines.length) return false
    return this._inBufferMs() < BUFFER_TARGET_MS
  }

  private _inBufferMs(): number {
    const cumulAtSendPtr = this.lines[this.sendPtr]?.cumulativeDurationMs ?? 0
    return cumulAtSendPtr - (Date.now() - this.jobStartTime)
  }

  private _checkpointIfDue(): void {
    const now = Date.now()
    if (
      this.sendPtr - this.lastCheckpointPtr >= CHECKPOINT_LINES ||
      now - this.lastCheckpointTime >= CHECKPOINT_MS
    ) {
      this.lastCheckpointPtr = this.sendPtr
      this.lastCheckpointTime = now
      saveCheckpoint({
        version: 1,
        fileId: this.fileId!,
        filename: this.filename!,
        sendPtr: this.sendPtr,
        savedAt: now,
      }).catch(() => {})
    }
  }

  private _calcResumePtr(checkpointSendPtr: number): number {
    // Back up enough lines to cover RECOVERY_LOOKBACK_MS of estimated execution
    const targetCumul = (this.lines[checkpointSendPtr]?.cumulativeDurationMs ?? 0) - RECOVERY_LOOKBACK_MS
    let ptr = checkpointSendPtr
    while (ptr > 0 && (this.lines[ptr]?.cumulativeDurationMs ?? 0) > targetCumul) ptr--
    return Math.max(0, ptr)
  }

  private _buildRecoverySequence(modal: GCodeModalState, safeZ: number): string[] {
    const cmds: string[] = []
    // 1. Reapply tool length offset (guards against tool change during pause)
    if (modal.toolNumber > 0) cmds.push(`G43 H${modal.toolNumber}`)
    // 2. Work coordinate system
    cmds.push(modal.workCoordinate)
    // 3. Coolant
    if (modal.coolant !== 'off') cmds.push(modal.coolant)
    else cmds.push('M9')
    // 4. Safe Z lift
    cmds.push(`G0 Z${safeZ.toFixed(4)}`)
    // 5. XY move to resume position
    cmds.push(`G0 X${modal.position.x.toFixed(4)} Y${modal.position.y.toFixed(4)}`)
    // 6. Spindle
    if (modal.spindleMode !== 'M5') {
      cmds.push(`${modal.spindleMode} S${modal.spindleSpeed}`)
    } else {
      cmds.push('M5')
    }
    // 7. Lower Z to resume position at controlled feed rate
    cmds.push(`G1 Z${modal.position.z.toFixed(4)} F${modal.feedRate}`)
    return cmds
  }

  private _setStatus(status: JobState['status'], extra?: Partial<JobState>): void {
    this._status = status
    broadcastPatch([setJobState({ status, ...extra })])
  }

  private _broadcastError(msg: string): void {
    broadcastPatch([setJobState({ status: 'error', errorMessage: msg })])
  }
}

export const jobEngine = new JobEngine()
