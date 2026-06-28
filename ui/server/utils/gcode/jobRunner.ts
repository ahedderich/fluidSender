import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { analyzeGCode } from './analysis'
import { getModalStateAtLine } from './simulator'
import { saveCheckpoint, loadCheckpoint, clearCheckpoint, clearAllJobData } from './checkpoint'
import { analyzeGCodeFile, loadCachedAnalysis, loadRawAnalysis } from './analyzer'
import { broadcastPatch, setJobState, pushConsole, type PatchOp } from '../appState'
import { machineConnection } from '../machine/connection'
import { getLastMachineStatus } from '../machine/poller'
import { send, getMaxPlannerSlots } from '../machine/sender'
import type { SendHandle, SenderStatusEvent } from '../machine/types'
import type { GCodeLine, GCodeModalState, JobState } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')

const CHECKPOINT_LINES = 50
const CHECKPOINT_MS = 1000
const RESUME_SAFE_Z_LIFT = 5

interface FilteredLine {
  raw: string
  isMotion: boolean
  jobLineIdx: number  // index in this.lines[] — maps chunk-index back to job-line-index
}

class JobRunner {
  private lines: GCodeLine[] = []
  private fileId: string | null = null
  private filename: string | null = null
  private sendPtr = 0
  private _execPtr = 0
  private lastCheckpointPtr = -1
  private lastCheckpointTime = 0
  private _status: JobState['status'] = 'idle'
  private analyzeAbort: AbortController | null = null

  // Active send session
  private _sendHandle: SendHandle | null = null
  private _filteredLines: FilteredLine[] | null = null

  get status() { return this._status }

  async loadJob(fileId: string): Promise<void> {
    if (this._status === 'running' || this._status === 'pausing' || this._status === 'stopping') {
      this._broadcastError('Cannot load a job while one is running. Pause or cancel first.')
      return
    }

    this.analyzeAbort?.abort()
    this.analyzeAbort = null

    const filename = fileId.replace(/^[0-9a-f-]+-/i, '')

    try {
      let analysis = await loadCachedAnalysis(fileId)
      let lines

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

        const result = await analyzeGCodeFile(
          fileId,
          filename,
          (pct) => {
            if (ctrl.signal.aborted) return
            broadcastPatch([setJobState({ analyzeProgress: pct })])
          },
          ctrl.signal,
        )
        analysis = result.analysis
        lines = result.lines
        this.analyzeAbort = null
      } else {
        const content = await readFile(join(UPLOADS_DIR, fileId), 'utf8')
        lines = analyzeGCode(content).lines
      }

      this.lines = lines
      this.fileId = fileId
      this.filename = filename
      this.sendPtr = 0
      this._execPtr = 0
      this._sendHandle = null
      this._filteredLines = null

      this._setStatus('loaded', {
        fileId,
        filename,
        totalLines: analysis.totalLines,
        sendPtr: 0,
        execPtr: 0,
        inPlanner: 0,
        maxPlannerSlots: getMaxPlannerSlots(),
        estimatedTotalMs: analysis.estimatedTotalMs,
        startWallClock: null,
        axisRanges: analysis.axisRanges,
        analyzeProgress: 100,
        toolSections: analysis.tools,
        recovery: null,
        errorMessage: null,
      })

      const checkpoint = await loadCheckpoint()
      if (checkpoint && checkpoint.fileId === fileId && checkpoint.execPtr > 0) {
        const resumePtr = checkpoint.execPtr
        const modalStateAtResume = await getModalStateAtLine(resumePtr)
        broadcastPatch([setJobState({
          recovery: {
            available: true,
            checkpointPtr: resumePtr,
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
    if (this._status !== 'loaded' && this._status !== 'complete') return
    if (!this.lines.length) return

    if (this._status === 'complete') {
      this.sendPtr = 0
      this._execPtr = 0
    }

    this._setStatus('running', { startWallClock: Date.now(), execPtr: this._execPtr })
    this._startMainSend()
  }

  /** Feed hold pause — machine decelerates and enters Hold state. Resume with resume(). */
  pause(): void {
    if (this._status !== 'running') return
    this._setStatus('pausing')
    this._sendHandle?.feedHold()
  }

  /** Resume from pause — rebuilds modal state and returns to pause position before continuing. */
  async resume(): Promise<void> {
    if (this._status !== 'paused') return
    const resumePtr = this._execPtr
    this.sendPtr = resumePtr

    try {
      const modal = await getModalStateAtLine(resumePtr)

      this._setStatus('recovering', {
        startWallClock: null,
        sendPtr: resumePtr,
        execPtr: resumePtr,
        inPlanner: 0,
        recovery: null,
      })

      if (modal) {
        const lastStatus = getLastMachineStatus()
        const currentZ = lastStatus?.wpos.z ?? modal.position.z
        const safeZ = Math.max(currentZ, modal.position.z + RESUME_SAFE_Z_LIFT)
        const recoveryCommands = this._buildRecoverySequence(modal, safeZ)
        this._sendHandle = send(
          recoveryCommands.map(cmd => ({ raw: cmd, isMotion: false })),
          (event) => this._handleRecoveryEvent(event),
        )
      } else {
        this._setStatus('running', { startWallClock: Date.now() })
        this._startMainSend()
      }
    } catch (err) {
      this._broadcastError(`Resume failed: ${(err as Error).message}`)
    }
  }

  /** Feed hold stop — decelerates the machine then resets to Idle. Returns to loaded state.
   *  Machine does NOT enter alarm. Job is preserved and can be restarted. */
  stop(): void {
    if (this._status === 'paused') {
      // Machine already in Hold; go straight to hard reset (Hold→0x18 = Idle, no alarm)
      this._doHardStopAndReturnToLoaded()
      return
    }
    if (this._status !== 'running') return
    this._setStatus('stopping')
    this._sendHandle?.feedHold()
    // _handleSenderEvent reacts to Hold:0 and calls _doHardStopAndReturnToLoaded
  }

  /** Immediate hard reset — no deceleration, potential mid-move position loss.
   *  Machine may enter alarm state; the alarm is NOT cleared automatically. */
  emergencyStop(): void {
    const handle = this._sendHandle
    this._sendHandle = null
    this._filteredLines = null
    this._execPtr = 0
    this.sendPtr = 0
    this._setStatus('loaded', {
      startWallClock: null,
      sendPtr: 0,
      execPtr: 0,
      inPlanner: 0,
      recovery: null,
    })
    clearCheckpoint().catch(() => {})
    handle?.hardStop()
  }

  clear(): void {
    if (this._status === 'running') return
    this.analyzeAbort?.abort()
    this.analyzeAbort = null
    this._sendHandle = null
    this._filteredLines = null
    this.lines = []
    this.sendPtr = 0
    this._execPtr = 0
    this.fileId = null
    this.filename = null
    broadcastPatch([setJobState({
      status: 'idle',
      fileId: null,
      filename: null,
      totalLines: 0,
      sendPtr: 0,
      execPtr: 0,
      inPlanner: 0,
      maxPlannerSlots: getMaxPlannerSlots(),
      estimatedTotalMs: 0,
      startWallClock: null,
      axisRanges: null,
      analyzeProgress: 0,
      toolSections: null,
      recovery: null,
      errorMessage: null,
    })])
    this._status = 'idle'
    clearAllJobData().catch(() => {})
  }

  /** Called once on server startup to restore persisted job state. */
  async bootRestore(): Promise<'empty' | 'loaded' | 'crash'> {
    const analysis = await loadRawAnalysis()
    if (!analysis) return 'empty'

    try {
      const filePath = join(UPLOADS_DIR, analysis.fileId)
      const content = await readFile(filePath, 'utf8')
      this.lines = analyzeGCode(content).lines
      this.fileId = analysis.fileId
      this.filename = analysis.filename

      const checkpoint = await loadCheckpoint()
      const hasCrash = !!checkpoint && checkpoint.fileId === analysis.fileId && checkpoint.execPtr > 0

      const baseState: Partial<JobState> = {
        fileId: analysis.fileId,
        filename: analysis.filename,
        totalLines: analysis.totalLines,
        sendPtr: 0,
        execPtr: 0,
        inPlanner: 0,
        maxPlannerSlots: getMaxPlannerSlots(),
        estimatedTotalMs: analysis.estimatedTotalMs,
        startWallClock: null,
        axisRanges: analysis.axisRanges,
        analyzeProgress: 100,
        toolSections: analysis.tools,
        errorMessage: null,
      }

      if (hasCrash) {
        const resumePtr = checkpoint!.execPtr
        const modalStateAtResume = await getModalStateAtLine(resumePtr)
        this._setStatus('loaded', {
          ...baseState,
          recovery: {
            available: true,
            checkpointPtr: resumePtr,
            resumePtr,
            modalStateAtResume,
          },
        })
        return 'crash'
      } else {
        this._setStatus('loaded', { ...baseState, recovery: null })
        return 'loaded'
      }
    } catch (err) {
      console.error('[jobRunner] bootRestore failed:', err)
      return 'empty'
    }
  }

  /** Clear the crash checkpoint then reload the job from line 0. */
  async loadJobFresh(): Promise<void> {
    if (!this.fileId) return
    const fileId = this.fileId
    await clearCheckpoint()
    await this.loadJob(fileId)
  }

  /** User confirmed recovery from checkpoint — load from resumePtr and send recovery moves. */
  async confirmRecovery(resumePtr: number): Promise<void> {
    const checkpoint = await loadCheckpoint()
    if (!checkpoint) return

    try {
      const filename = checkpoint.filename

      // Re-parse lines from disk if not already in memory (e.g. server restart mid-recovery)
      if (!this.lines.length || this.fileId !== checkpoint.fileId) {
        const content = await readFile(join(UPLOADS_DIR, checkpoint.fileId), 'utf8')
        this.lines = analyzeGCode(content).lines
      }
      this.fileId = checkpoint.fileId
      this.filename = filename
      this.sendPtr = resumePtr
      this._execPtr = resumePtr
      this._filteredLines = null

      const modal = await getModalStateAtLine(resumePtr)
      const savedAnalysis = await loadRawAnalysis()

      this._setStatus('recovering', {
        fileId: checkpoint.fileId,
        filename,
        totalLines: this.lines.length,
        sendPtr: resumePtr,
        execPtr: resumePtr,
        inPlanner: 0,
        maxPlannerSlots: getMaxPlannerSlots(),
        estimatedTotalMs: savedAnalysis?.estimatedTotalMs ?? 0,
        axisRanges: savedAnalysis?.axisRanges ?? null,
        recovery: null,
        errorMessage: null,
      })

      if (modal) {
        const lastStatus = getLastMachineStatus()
        const currentZ = lastStatus?.wpos.z ?? modal.position.z
        const safeZ = Math.max(currentZ, modal.position.z + RESUME_SAFE_Z_LIFT)
        const recoveryCommands = this._buildRecoverySequence(modal, safeZ)
        this._sendHandle = send(
          recoveryCommands.map(cmd => ({ raw: cmd, isMotion: false })),
          (event) => this._handleRecoveryEvent(event),
        )
      } else {
        // No modal state available — resume from position without pre-flight moves
        this._setStatus('running', { startWallClock: Date.now() })
        this._startMainSend()
      }
    } catch (err) {
      this._broadcastError(`Recovery failed: ${(err as Error).message}`)
    }
  }

  /** Called by ws.ts on machine disconnect. */
  onMachineDisconnected(): void {
    // Clear send state before sender fires its error event so _handleSenderEvent no-ops
    this._sendHandle = null
    this._filteredLines = null

    if (this._status === 'stopping') {
      // Stop was in progress — treat disconnect as completing the stop
      this._execPtr = 0
      this.sendPtr = 0
      this._setStatus('loaded', { startWallClock: null, sendPtr: 0, execPtr: 0, inPlanner: 0, recovery: null })
      clearCheckpoint().catch(() => {})
    } else if (this._status === 'running' || this._status === 'pausing' || this._status === 'recovering') {
      this._setStatus('paused', { errorMessage: 'Machine disconnected during job' })
    }
  }

  /** On server startup — check for a checkpoint and prepare recovery info. */
  async checkForRecovery(): Promise<JobState['recovery']> {
    const checkpoint = await loadCheckpoint()
    if (!checkpoint || checkpoint.execPtr <= 0) return null

    try {
      const resumePtr = checkpoint.execPtr
      const modalStateAtResume = await getModalStateAtLine(resumePtr)
      return {
        available: true,
        checkpointPtr: resumePtr,
        resumePtr,
        modalStateAtResume,
      }
    } catch {
      return null
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private _buildFilteredLines(startPtr: number): FilteredLine[] {
    const result: FilteredLine[] = []
    for (let i = startPtr; i < this.lines.length; i++) {
      const line = this.lines[i]!
      if (line.type !== 'comment') {
        result.push({ raw: line.raw, isMotion: line.isMotion, jobLineIdx: i })
      }
    }
    return result
  }

  private _startMainSend(): void {
    const startPtr = this.sendPtr
    const filteredLines = this._buildFilteredLines(startPtr)
    this._filteredLines = filteredLines

    this._sendHandle = send(
      filteredLines.map(l => ({ raw: l.raw, isMotion: l.isMotion })),
      (event) => this._handleSenderEvent(event, startPtr, filteredLines),
    )
  }

  private _handleSenderEvent(
    event: SenderStatusEvent,
    startPtr: number,
    filteredLines: FilteredLine[],
  ): void {
    // If send handle was cleared (e.g. emergencyStop or disconnect), ignore stale events
    if (!this._sendHandle) return

    const ops: PatchOp[] = []

    const newSendPtr = event.sent > 0
      ? filteredLines[event.sent - 1]!.jobLineIdx + 1
      : startPtr
    const newExecPtr = event.executed > 0
      ? filteredLines[event.executed - 1]!.jobLineIdx + 1
      : startPtr
    const inPlanner = Math.max(0, event.sent - event.executed)

    if (newSendPtr !== this.sendPtr || newExecPtr !== this._execPtr) {
      this.sendPtr = newSendPtr
      this._execPtr = newExecPtr
      ops.push(setJobState({
        sendPtr: newSendPtr,
        execPtr: newExecPtr,
        inPlanner,
        maxPlannerSlots: getMaxPlannerSlots(),
      }))
      if (ops.length > 0) broadcastPatch(ops)
      this._checkpointIfDue()
    }

    // Handle feed hold progress events (non-completed, but holdPhase is set)
    if (event.holdPhase !== null) {
      if (event.holdPhase === 0) {
        if (this._status === 'pausing') {
          // Reset sendPtr to execPtr: queued-but-not-executed lines are cleared by 0x18.
          this.sendPtr = this._execPtr
          this._setStatus('paused', { sendPtr: this._execPtr })
          // Unlock machine: soft reset from Hold → Idle so operator can jog freely.
          const handle = this._sendHandle
          this._sendHandle = null
          this._filteredLines = null
          handle?.hardStop()
        } else if (this._status === 'stopping') {
          this._doHardStopAndReturnToLoaded()
        }
      }
      return
    }

    if (!event.completed) return

    this._sendHandle = null
    this._filteredLines = null

    switch (event.completedMode) {
      case 'success':
        this._completeJob()
        break
      case 'soft':
        // Only reachable via direct sender:softStop WS intent; no job-level action needed
        break
      case 'error':
        if (this._status !== 'paused' && this._status !== 'cancelled' && this._status !== 'error') {
          this._broadcastError(event.errorReason ?? 'Send error')
        }
        break
      case 'hard':
        // emergencyStop() sets status before calling hardStop — nothing to do here
        break
    }
  }

  private _handleRecoveryEvent(event: SenderStatusEvent): void {
    if (!this._sendHandle) return

    if (!event.completed) return

    this._sendHandle = null

    switch (event.completedMode) {
      case 'success':
        this._setStatus('running', { startWallClock: Date.now() })
        this._startMainSend()
        break
      case 'error':
        this._broadcastError(event.errorReason ?? 'Recovery failed')
        break
      case 'hard':
        // emergencyStop() handles status
        break
    }
  }

  /** Feed hold confirmed stopped (Hold:0) then hard reset. From Hold, 0x18 goes to Idle (no alarm). */
  private _doHardStopAndReturnToLoaded(): void {
    const handle = this._sendHandle
    this._sendHandle = null
    this._filteredLines = null
    this._execPtr = 0
    this.sendPtr = 0
    this._setStatus('loaded', {
      startWallClock: null,
      sendPtr: 0,
      execPtr: 0,
      inPlanner: 0,
      recovery: null,
    })
    clearCheckpoint().catch(() => {})
    handle?.hardStop()
  }

  private _completeJob(): void {
    this._execPtr = this.lines.length
    this.sendPtr = this.lines.length
    this._setStatus('complete', {
      startWallClock: null,
      sendPtr: this.lines.length,
      execPtr: this.lines.length,
      inPlanner: 0,
    })
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
        execPtr: this._execPtr,
        savedAt: now,
      }).catch(() => {})
    }
  }

  private _buildRecoverySequence(modal: GCodeModalState, safeZ: number): string[] {
    const cmds: string[] = []
    if (modal.toolNumber > 0) cmds.push(`G43 H${modal.toolNumber}`)
    cmds.push(modal.workCoordinate)
    cmds.push(modal.units)
    cmds.push('G90')
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
    if (modal.positionMode !== 'G90') cmds.push(modal.positionMode)
    return cmds
  }

  private _setStatus(status: JobState['status'], extra?: Partial<JobState>): void {
    this._status = status
    broadcastPatch([setJobState({ status, ...extra })])
  }

  private _broadcastError(msg: string): void {
    this._status = 'error'
    broadcastPatch([setJobState({ status: 'error', errorMessage: msg })])
  }
}

export const jobRunner = new JobRunner()
