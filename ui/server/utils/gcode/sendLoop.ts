import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { preprocessGCode } from './preprocessor'
import { simulateToLine } from './simulator'
import { saveCheckpoint, loadCheckpoint, clearCheckpoint } from './checkpoint'
import { analyzeGCodeFile, loadCachedAnalysis } from './analyzer'
import { broadcastPatch, setJobState, pushConsole, type PatchOp } from '../appState'
import { machineConnection } from '../machine/connection'
import type { MachineStatus } from '../machine/types'
import type { GCodeLine, GCodeModalState, JobState } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')

// Keep this many motion commands in the FluidNC planner at all times
const PLANNER_TARGET = 3
// Consecutive Idle + empty-planner polls required before declaring job complete (400 ms at 200 ms poll)
const COMPLETION_CONFIRM_COUNT = 2
// Fallback if maxPlannerSlots not yet captured from idle state
const DEFAULT_MAX_PLANNER_SLOTS = 15
// Checkpoint every N lines or every M ms (whichever triggers first)
const CHECKPOINT_LINES = 50
const CHECKPOINT_MS = 5000
// Recovery backs up this many estimated ms from the checkpoint pointer
const RECOVERY_LOOKBACK_MS = 30_000
// Safe Z lift applied before XY move in the resume sequence (mm above last Z)
const RESUME_SAFE_Z_LIFT = 5

interface SentEntry {
  lineIdx: number
  isMotion: boolean
  acked: boolean
}

class JobEngine {
  private lines: GCodeLine[] = []
  private fileId: string | null = null
  private filename: string | null = null
  private sendPtr = 0
  private _execPtr = 0
  private lastCheckpointPtr = -1
  private lastCheckpointTime = 0
  private _status: JobState['status'] = 'idle'
  private pauseModalState: GCodeModalState | null = null
  private pendingGQuery = false
  private analyzeAbort: AbortController | null = null

  // Ack + Buf send-loop state
  private maxPlannerSlots = 0   // captured from first Idle Buf response after connect
  private inPlanner = 0         // effectiveMax − lastKnownPlannerFree
  private pendingAck = false    // one line dispatched, awaiting ok
  private sentQueue: SentEntry[] = []
  private completionConfirmCount = 0

  get status() { return this._status }

  async loadJob(fileId: string): Promise<void> {
    if (this._status === 'running' || this._status === 'pausing') {
      this._broadcastError('Cannot load a job while one is running. Pause or cancel first.')
      return
    }

    this.analyzeAbort?.abort()
    this.analyzeAbort = null

    const filename = fileId.replace(/^[0-9a-f-]+-/i, '')

    try {
      let analysis = await loadCachedAnalysis(fileId)

      if (!analysis) {
        const ctrl = new AbortController()
        this.analyzeAbort = ctrl

        broadcastPatch([setJobState({
          status: 'analyzing',
          fileId,
          filename,
          analyzeProgress: 0,
          toolSections: null,
          errorMessage: null,
        })])
        this._status = 'analyzing'

        analysis = await analyzeGCodeFile(
          fileId,
          filename,
          (pct) => {
            if (ctrl.signal.aborted) return
            broadcastPatch([setJobState({ analyzeProgress: pct })])
          },
          ctrl.signal,
        )
        this.analyzeAbort = null
      }

      const content = await readFile(join(UPLOADS_DIR, fileId), 'utf8')
      const { lines } = preprocessGCode(content)

      this.lines = lines
      this.fileId = fileId
      this.filename = filename
      this.sendPtr = 0
      this._execPtr = 0
      this.sentQueue = []
      this.pendingAck = false
      this.inPlanner = 0
      this.completionConfirmCount = 0
      this.pauseModalState = null

      this._setStatus('loaded', {
        fileId,
        filename,
        totalLines: analysis.totalLines,
        sendPtr: 0,
        execPtr: 0,
        inPlanner: 0,
        maxPlannerSlots: this.maxPlannerSlots,
        estimatedTotalMs: analysis.estimatedTotalMs,
        startWallClock: null,
        axisRanges: analysis.axisRanges,
        analyzeProgress: 100,
        toolSections: analysis.tools,
        recovery: null,
        errorMessage: null,
      })

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
      const msg = (err as Error).message
      if (msg === 'Aborted') {
        broadcastPatch([setJobState({
          status: 'idle',
          fileId: null,
          filename: null,
          analyzeProgress: 0,
          toolSections: null,
          errorMessage: null,
        })])
        this._status = 'idle'
      } else {
        this._broadcastError(`Failed to load job: ${msg}`)
      }
    }
  }

  abortAnalysis(): void {
    if (this._status !== 'analyzing') return
    this.analyzeAbort?.abort()
    this.analyzeAbort = null
  }

  start(): void {
    if (this._status !== 'loaded' && this._status !== 'paused' && this._status !== 'complete') return
    if (!this.lines.length) return

    if (this._status === 'complete') {
      this.sendPtr = 0
      this._execPtr = 0
      this.sentQueue = []
      this.pendingAck = false
      this.inPlanner = 0
      this.completionConfirmCount = 0
    }

    this._setStatus('running', { startWallClock: Date.now(), execPtr: this._execPtr })
    this._tryAdvanceSend()
  }

  pause(): void {
    if (this._status !== 'running') return
    this._setStatus('pausing')
    // _tryAdvanceSend() is a no-op while status !== 'running'
    // onBufUpdate() detects machine Idle and fires $G to capture modal state
  }

  /** Called by the WS handler when a $G response line arrives during pause. */
  onGQueryResponse(
    line: string,
    lastMachineStatus: {
      wpos: { x: number; y: number; z: number }
      spindleSpeed: number
      spindleOn: boolean
      coolantMist: boolean
      coolantFlood: boolean
    } | null,
  ): void {
    if (!this.pendingGQuery) return
    this.pendingGQuery = false

    // Import inline to avoid circular at module load time
    const { parseGQueryResponse } = require('../machine/statusParser') as typeof import('../machine/statusParser')
    const gModal = parseGQueryResponse(line)
    if (!gModal) return

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
    if (modal) {
      const seq = this._buildRecoverySequence(modal, modal.position.z + RESUME_SAFE_Z_LIFT)
      for (const cmd of seq) machineConnection.sendRaw(cmd)
      this.pauseModalState = null
    }

    this._setStatus('running', { startWallClock: Date.now() })
    this._tryAdvanceSend()
  }

  cancel(): void {
    this.sentQueue = []
    this.pendingAck = false
    this.inPlanner = 0
    this.completionConfirmCount = 0
    this._execPtr = 0
    this._setStatus('cancelled', {
      startWallClock: null,
      execPtr: 0,
      recovery: null,
    })
    clearCheckpoint().catch(() => {})
  }

  clear(): void {
    if (this._status === 'running') return
    this.analyzeAbort?.abort()
    this.analyzeAbort = null
    this.sentQueue = []
    this.pendingAck = false
    this.inPlanner = 0
    this.completionConfirmCount = 0
    this.lines = []
    this.sendPtr = 0
    this._execPtr = 0
    this.fileId = null
    broadcastPatch([setJobState({
      status: 'idle',
      fileId: null,
      filename: null,
      totalLines: 0,
      sendPtr: 0,
      execPtr: 0,
      inPlanner: 0,
      maxPlannerSlots: this.maxPlannerSlots,
      estimatedTotalMs: 0,
      startWallClock: null,
      axisRanges: null,
      analyzeProgress: 0,
      toolSections: null,
      recovery: null,
      errorMessage: null,
    })])
    this._status = 'idle'
  }

  /** Called by ws.ts on every `ok` response from the machine. */
  onAckReceived(): void {
    if (this._status !== 'running' && this._status !== 'pausing') return

    const entry = this.sentQueue.find(e => !e.acked)
    if (!entry) return  // no pending ack — stale ok from a manual console command

    entry.acked = true
    this.pendingAck = false

    // Drain consecutive acked non-motion entries from the front of the queue.
    // Non-motion commands execute immediately on ack (they never enter the planner).
    const ops: PatchOp[] = []
    while (this.sentQueue.length > 0 && !this.sentQueue[0]!.isMotion && this.sentQueue[0]!.acked) {
      this._execPtr = this.sentQueue.shift()!.lineIdx + 1
    }
    ops.push(setJobState({ execPtr: this._execPtr }))
    broadcastPatch(ops)

    this._tryAdvanceSend()
  }

  /** Called by ws.ts on every status poll response (every 200 ms). */
  onBufUpdate(plannerFree: number, machineState: MachineStatus['state']): void {
    // Capture max planner slots from the first Idle status response after connect
    if (!this.maxPlannerSlots && machineState === 'Idle' && plannerFree > 0) {
      this.maxPlannerSlots = plannerFree
      console.log(`[jobEngine] maxPlannerSlots captured: ${this.maxPlannerSlots}`)
      if (this._status !== 'idle') {
        broadcastPatch([setJobState({ maxPlannerSlots: this.maxPlannerSlots })])
      }
    }

    // Machine alarm during a running job — stop sending and surface the error.
    if (machineState === 'Alarm' && (this._status === 'running' || this._status === 'pausing')) {
      this.sentQueue = []
      this.pendingAck = false
      this.inPlanner = 0
      this._broadcastError('Job stopped: machine alarm')
      return
    }

    const effectiveMax = this.maxPlannerSlots || DEFAULT_MAX_PLANNER_SLOTS
    const newInPlanner = Math.max(0, effectiveMax - plannerFree)
    const drained = this.inPlanner - newInPlanner
    this.inPlanner = newInPlanner

    const ops: PatchOp[] = []

    // Advance execPtr for motion commands confirmed to have left the planner (delta path).
    if (drained > 0) {
      let remaining = drained
      while (remaining > 0 && this.sentQueue.length > 0) {
        const head = this.sentQueue[0]!
        if (!head.isMotion) {
          // Non-motion entries are already drained by onAckReceived; skip defensively
          this.sentQueue.shift()
          continue
        }
        if (!head.acked) break
        this.sentQueue.shift()
        this._execPtr = head.lineIdx + 1
        remaining--
      }
    }

    // Fallback drain: when the planner is fully empty every acked entry in sentQueue
    // has executed. This handles commands that complete between poll intervals (the
    // delta above never becomes positive when inPlanner was never observed > 0).
    if (newInPlanner === 0) {
      while (this.sentQueue.length > 0 && this.sentQueue[0]!.acked) {
        this._execPtr = this.sentQueue.shift()!.lineIdx + 1
      }
    }

    ops.push(setJobState({ execPtr: this._execPtr, inPlanner: this.inPlanner }))
    broadcastPatch(ops)

    // Pausing: fire $G once the machine drains to Idle
    if (this._status === 'pausing' && machineState === 'Idle') {
      this.pendingGQuery = true
      machineConnection.sendRaw('$G')
      return
    }

    if (this._status !== 'running') return

    this._tryAdvanceSend()
    this._checkCompletion(plannerFree, effectiveMax, machineState)
  }

  /** Called by ws.ts on machine disconnect. Resets maxPlannerSlots for the next connection. */
  onMachineDisconnected(): void {
    this.maxPlannerSlots = 0
    if (this._status === 'running' || this._status === 'pausing') {
      this.sentQueue = []
      this.pendingAck = false
      this._setStatus('paused', { errorMessage: 'Machine disconnected during job' })
    }
  }

  /** On server startup — check for a checkpoint and prepare recovery info. */
  async checkForRecovery(): Promise<JobState['recovery']> {
    const checkpoint = await loadCheckpoint()
    if (!checkpoint || checkpoint.sendPtr <= 0) return null

    try {
      const filePath = join(UPLOADS_DIR, checkpoint.fileId)
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
      const content = await readFile(join(UPLOADS_DIR, checkpoint.fileId), 'utf8')
      const filename = checkpoint.filename
      const { lines, axisRanges } = preprocessGCode(content)
      this.lines = lines
      this.fileId = checkpoint.fileId
      this.filename = filename
      this.sendPtr = resumePtr
      this._execPtr = resumePtr
      this.sentQueue = []
      this.pendingAck = false
      this.inPlanner = 0
      this.completionConfirmCount = 0

      const modal = simulateToLine(lines, resumePtr)
      this.pauseModalState = modal

      const estimatedTotalMs = lines.at(-1)?.cumulativeDurationMs ?? 0
      this._setStatus('recovering', {
        fileId: checkpoint.fileId,
        filename,
        totalLines: lines.length,
        sendPtr: resumePtr,
        execPtr: resumePtr,
        inPlanner: 0,
        maxPlannerSlots: this.maxPlannerSlots,
        estimatedTotalMs,
        axisRanges,
        recovery: null,
        errorMessage: null,
      })

      const seq = this._buildRecoverySequence(modal, modal.position.z + RESUME_SAFE_Z_LIFT)
      for (const cmd of seq) machineConnection.sendRaw(cmd)
      this.pauseModalState = null

      this._setStatus('running', { startWallClock: Date.now() })
      this._tryAdvanceSend()
    } catch (err) {
      this._broadcastError(`Recovery failed: ${(err as Error).message}`)
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  /**
   * Attempt to send the next line. Called after every ack and every Buf update.
   * Sends at most one line per call; the next call is triggered by the resulting ack
   * or the next Buf poll. Comment lines are skipped silently (no send, no ack needed).
   */
  private _tryAdvanceSend(): void {
    if (this._status !== 'running') return
    if (!machineConnection.isConnected) return

    const prevSendPtr = this.sendPtr
    const prevExecPtr = this._execPtr
    const ops: PatchOp[] = []

    while (this.sendPtr < this.lines.length) {
      const line = this.lines[this.sendPtr]!

      // Skip blank/comment lines without sending (they have no planner effect)
      if (line.type === 'comment') {
        this.sendPtr++
        continue
      }

      if (this.pendingAck) break  // always wait for the previous ack

      if (line.isMotion) {
        const motionInFlight = this.sentQueue.filter(e => e.isMotion).length
        if (motionInFlight >= PLANNER_TARGET) break
      }

      machineConnection.sendRaw(line.raw)
      const trimmed = line.raw.trim()
      if (trimmed) ops.push(pushConsole({ type: 'sent', text: trimmed, ts: Date.now() }))
      this.sentQueue.push({ lineIdx: this.sendPtr, isMotion: line.isMotion, acked: false })
      this.pendingAck = true
      this.sendPtr++
      this._checkpointIfDue()
      break  // one line per trigger; next send fires on ack or Buf event
    }

    if (this.sendPtr !== prevSendPtr || this._execPtr !== prevExecPtr) {
      ops.push(setJobState({ sendPtr: this.sendPtr, execPtr: this._execPtr }))
    }
    if (ops.length > 0) broadcastPatch(ops)
  }

  private _checkCompletion(plannerFree: number, effectiveMax: number, machineState: MachineStatus['state']): void {
    const allDispatched = this.sendPtr >= this.lines.length
    const allConfirmed = this.sentQueue.length === 0
    const plannerDrained = plannerFree >= effectiveMax
    const isIdle = machineState === 'Idle'

    if (allDispatched && allConfirmed && plannerDrained && isIdle) {
      this.completionConfirmCount++
      if (this.completionConfirmCount >= COMPLETION_CONFIRM_COUNT) {
        this._completeJob()
      }
    } else {
      this.completionConfirmCount = 0
    }
  }

  private _completeJob(): void {
    this.completionConfirmCount = 0
    this._execPtr = this.lines.length
    this._setStatus('complete', { startWallClock: null, execPtr: this.lines.length })
    clearCheckpoint().catch(() => {})
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
    const targetCumul = (this.lines[checkpointSendPtr]?.cumulativeDurationMs ?? 0) - RECOVERY_LOOKBACK_MS
    let ptr = checkpointSendPtr
    while (ptr > 0 && (this.lines[ptr]?.cumulativeDurationMs ?? 0) > targetCumul) ptr--
    return Math.max(0, ptr)
  }

  private _buildRecoverySequence(modal: GCodeModalState, safeZ: number): string[] {
    const cmds: string[] = []
    if (modal.toolNumber > 0) cmds.push(`G43 H${modal.toolNumber}`)
    cmds.push(modal.workCoordinate)
    if (modal.coolant !== 'off') cmds.push(modal.coolant)
    else cmds.push('M9')
    cmds.push(`G0 Z${safeZ.toFixed(4)}`)
    cmds.push(`G0 X${modal.position.x.toFixed(4)} Y${modal.position.y.toFixed(4)}`)
    if (modal.spindleMode !== 'M5') {
      cmds.push(`${modal.spindleMode} S${modal.spindleSpeed}`)
    } else {
      cmds.push('M5')
    }
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
