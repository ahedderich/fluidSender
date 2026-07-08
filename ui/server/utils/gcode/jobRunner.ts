import { readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { appendExecution } from '../fileMetadata'
import { analyzeGCode } from './analysis'
import { getModalStateAtLine } from './simulator'
import { saveCheckpoint, loadCheckpoint, clearCheckpoint, clearAllJobData } from './checkpoint'
import { analyzeGCodeFile, loadCachedAnalysis, loadRawAnalysis, clearAllTransformArtefacts } from './analyzer'
import {
  broadcastPatch,
  setJobState,
  getConfig,
  setToolChangeModeActive,
  openProgramPauseModal,
  registerProgramPauseHandler,
  settleProgramPauseModal,
  openToolchangeModal,
  updateToolchangeModal,
  resolveModal,
  registerToolchangeResolveHandler,
  unregisterToolchangeResolveHandler,
  setLoadedTool,
  getLoadedToolForMachine,
  getConnection,
  pushToast,
  type PatchOp,
  type ToolchangeModalProps,
  type ProbingRotationResult,
  type HeightmapResult,
} from '../appState'
import { getLastMachineStatus } from '../machine/poller'
import { startSend, sendGCode, suspendSend, resumeChunk, stopSend, senderHardStop } from '../machine/sender'
import { setMode } from '../machine/machineMode'
import { toolStore } from '../tool/toolStore'
import { appendRuntimeSession } from '../tool/runtimeLog'
import { buildToolchangePositionSequence, buildToolsetterApproachSequence } from './toolchangeSequences'
import { runToolsetterProbe } from '../machine/toolsetterProbe'
import { applyTransforms } from './transform'
import type { SendHandle, SenderStatusEvent } from '../machine/types'
import type { GCodeLine, GCodeModalState, JobState, ToolSection, TransformMode } from './types'
import type { ToolchangeConfig } from '../../../shared/toolchange'
import type { TcVars } from '../macro/macroRunner'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')

function jLog(msg: string): void {
  console.log(`[JOB ${new Date().toISOString().slice(11, 23)}] ${msg}`)
}

const CHECKPOINT_LINES = 50
const CHECKPOINT_MS = 1000
const RESUME_SAFE_Z_LIFT = 5


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
  // ChunkId of the suspended main job chunk while status is 'paused'
  private _mainJobChunkId: string | null = null

  // Chunk-send (multi-section) state
  private _toolSections: ToolSection[] = []
  private _currentSectionIndex = 0
  private _toolPreferences: Record<number, 'M' | 'A'> = {}
  private _ambiguousTools: number[] = []

  // Runtime session
  private _runtimeSession: { toolNumber: number; scope: 'M' | 'A'; startMs: number } | null = null

  // Execution history tracking
  private _execStartedAt: number | null = null

  // Transform state
  private _transformMode: TransformMode = 'none'
  private _activeRotation: ProbingRotationResult | null = null
  private _activeHeightmap: HeightmapResult | null = null

  // Active program-pause modal id (null when no M0 pause is in progress)
  private _programPauseModalId: string | null = null

  // Toolchange modal id (null when no toolchange dialog is open)
  private _toolchangeModalId: string | null = null
  // Pending standalone (non-job) toolchange state for manual-basic strategy
  private _pendingStandaloneActive: boolean = false
  private _pendingStandaloneToolNumber: number | null = null

  // Last T-word seen — used for atc-passthrough to update loadedToolNumber on M6 ack
  private _lastSeenToolNumber: number | null = null

  get status() { return this._status }

  async loadJob(fileId: string): Promise<void> {
    if (this._status === 'running' || this._status === 'pausing' || this._status === 'stopping') {
      this._broadcastError('Cannot load a job while one is running. Pause or cancel first.')
      return
    }

    this.analyzeAbort?.abort()
    this.analyzeAbort = null

    const filename = basename(fileId).replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')

    try {
      const rawContent = await readFile(join(UPLOADS_DIR, fileId), 'utf8')
      const content = applyTransforms(rawContent, this._transformMode, this._activeRotation, this._activeHeightmap)

      let analysis = await loadCachedAnalysis(fileId, this._transformMode)
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
          toolChangeRequest: null,
          programPause: null,
          toolPreferences: {},
          ambiguousTools: [],
          transformMode: this._transformMode,
        })])
        this._status = 'analyzing'

        const result = await analyzeGCodeFile(
          fileId,
          filename,
          content,
          (pct) => {
            if (ctrl.signal.aborted) return
            broadcastPatch([setJobState({ analyzeProgress: pct })])
          },
          ctrl.signal,
          this._transformMode,
        )
        analysis = result.analysis
        lines = result.lines
        this.analyzeAbort = null
      } else {
        lines = analyzeGCode(content).lines
      }

      this.lines = lines
      this.fileId = fileId
      this.filename = filename
      this.sendPtr = 0
      this._execPtr = 0
      this._sendHandle = null
      this._toolSections = analysis.tools ?? []
      this._currentSectionIndex = 0

      // Detect ambiguous tools (same number in both scopes)
      const activeMachineId = await this._getActiveMachineId()
      this._ambiguousTools = []
      this._toolPreferences = {}
      if (this._toolSections.length > 1 && activeMachineId) {
        const { machine, app } = toolStore.getAll(activeMachineId)
        const machineNums = new Set(machine.map((t) => t.number))
        const appNums = new Set(app.map((t) => t.number))
        for (const section of this._toolSections) {
          const n = section.toolNumber
          if (n > 0 && machineNums.has(n) && appNums.has(n) && !this._ambiguousTools.includes(n)) {
            this._ambiguousTools.push(n)
            this._toolPreferences[n] = 'M'
          }
        }
      }

      this._setStatus('loaded', {
        fileId,
        filename,
        totalLines: analysis.totalLines,
        sendPtr: 0,
        execPtr: 0,
        inPlanner: 0,
        estimatedTotalMs: analysis.estimatedTotalMs,
        startWallClock: null,
        axisRanges: analysis.axisRanges,
        analyzeProgress: 100,
        toolSections: analysis.tools,
        recovery: null,
        errorMessage: null,
        toolChangeRequest: null,
        programPause: null,
        toolPreferences: this._toolPreferences,
        ambiguousTools: this._ambiguousTools,
        transformMode: this._transformMode,
      })

      const checkpoint = await loadCheckpoint()
      if (checkpoint && checkpoint.fileId === fileId && checkpoint.execPtr > 0) {
        const resumePtr = checkpoint.execPtr
        const modalStateAtResume = await getModalStateAtLine(resumePtr, this._transformMode)
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
          toolChangeRequest: null,
          programPause: null,
          toolPreferences: {},
          ambiguousTools: [],
          transformMode: 'none',
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

    jLog(`start() status=${this._status} totalLines=${this.lines.length} sections=${this._toolSections.length}`)
    this._currentSectionIndex = 0
    this._execStartedAt = Date.now()
    this._setStatus('running', { startWallClock: Date.now(), execPtr: this._execPtr })
    this._startRuntimeSession(this._toolSections[0] ?? null)
    this._startMainSend().catch(console.error)
  }

  /** Pause — sends feed hold, waits for Hold:0, resets machine. Fires 'suspended' event when done. */
  pause(): void {
    jLog(`pause() called status=${this._status} sendHandle=${this._sendHandle?.chunkId.slice(0, 8) ?? 'null'} execPtr=${this._execPtr}`)
    if (this._status !== 'running') {
      jLog(`pause() SKIP — not running`)
      return
    }
    this._setStatus('pausing')
    if (this._sendHandle) {
      jLog(`pause() → calling suspendSend(${this._sendHandle.chunkId.slice(0, 8)})`)
      suspendSend(this._sendHandle.chunkId)
    } else {
      jLog(`pause() WARNING — no sendHandle to suspend`)
    }
  }

  /** Resume from pause — rebuilds modal state and returns to pause position before continuing. */
  async resume(): Promise<void> {
    jLog(`resume() called status=${this._status} execPtr=${this._execPtr} mainJobChunkId=${this._mainJobChunkId?.slice(0, 8) ?? 'null'}`)
    if (this._status !== 'paused') {
      jLog(`resume() SKIP — not paused`)
      return
    }
    const resumePtr = this._execPtr
    const suspendedChunkId = this._mainJobChunkId

    try {
      // resumePtr is the count of confirmed-executed lines; states[resumePtr-1] is the
      // endpoint of the last completed move (= start of the in-flight move we interrupted).
      jLog(`resume() fetching modal state at line ${resumePtr - 1}`)
      const modal = await getModalStateAtLine(resumePtr - 1, this._transformMode)
      jLog(`resume() modal=${modal ? `pos(${modal.position.x.toFixed(2)},${modal.position.y.toFixed(2)},${modal.position.z.toFixed(2)}) wcs=${modal.workCoordinate}` : 'null'}`)

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
        jLog(`resume() with modal recovery: safeZ=${safeZ.toFixed(3)} recoveryCommands=${recoveryCommands.length} suspendedChunkId=${suspendedChunkId?.slice(0, 8) ?? 'null'}`)
        this._sendHandle = sendGCode(recoveryCommands, (event) => {
          jLog(`recovery event: status=${event.status} completedMode=${event.completedMode} sent=${event.sent} exec=${event.executed}`)
          this._handleRecoveryEvent(event, suspendedChunkId)
        })
      } else if (suspendedChunkId) {
        // No modal recovery needed — resume the suspended chunk directly.
        jLog(`resume() direct resumeChunk (no modal) suspendedChunkId=${suspendedChunkId.slice(0, 8)}`)
        this._mainJobChunkId = null
        this._sendHandle = resumeChunk(suspendedChunkId)
        this._setStatus('running', { startWallClock: Date.now() })
      } else {
        // Fallback: start a new send from execPtr.
        jLog(`resume() fallback: no modal, no suspendedChunk → fresh send from execPtr=${resumePtr}`)
        this.sendPtr = resumePtr
        this._setStatus('running', { startWallClock: Date.now() })
        this._startMainSend().catch(console.error)
      }
    } catch (err) {
      jLog(`resume() ERROR: ${(err as Error).message}`)
      this._broadcastError(`Resume failed: ${(err as Error).message}`)
    }
  }

  /** Resume after a tool change — continue from the next section. */
  resumeAfterToolChange(): void {
    if (this._status !== 'tool_change') return
    setToolChangeModeActive(false)
    this._startRuntimeSession(this._toolSections[this._currentSectionIndex] ?? null)
    this._sendSection(this._currentSectionIndex)
    this._setStatus('running', { toolChangeRequest: null })
    setMode('sending')
  }

  /** Resume from an M0 program pause — send cycle-start to FluidNC. */
  resumeFromProgramPause(): void {
    if (this._status !== 'program_pause') return
    this._setStatus('running', { programPause: null })
    this._sendHandle?.cycleStart()
  }

  /** Update tool scope preference for an ambiguous tool number. */
  setToolPreference(toolNumber: number, scope: 'M' | 'A'): void {
    this._toolPreferences[toolNumber] = scope
    broadcastPatch([setJobState({ toolPreferences: { ...this._toolPreferences } })])
  }

  /** Stop — graceful feed-hold then reset. Returns to loaded state when complete. */
  stop(): void {
    jLog(`stop() called status=${this._status} sendHandle=${this._sendHandle?.chunkId.slice(0, 8) ?? 'null'} mainJobChunkId=${this._mainJobChunkId?.slice(0, 8) ?? 'null'}`)
    if (this._status === 'paused') {
      // Main chunk is already suspended (machine is Idle). Hard-stop cleans it up.
      if (this._mainJobChunkId) {
        senderHardStop(this._mainJobChunkId)
        this._mainJobChunkId = null
      }
      this._execPtr = 0
      this.sendPtr = 0
      this._recordExecution('aborted')
      this._setStatus('loaded', {
        startWallClock: null,
        sendPtr: 0,
        execPtr: 0,
        inPlanner: 0,
        recovery: null,
        toolChangeRequest: null,
        programPause: null,
      })
      clearCheckpoint().catch(() => {})
      return
    }
    if (this._status === 'tool_change') {
      setToolChangeModeActive(false)
      this._finalizeRuntimeSession().catch(() => {})
      this._mainJobChunkId = null
      this._recordExecution('aborted')
      this._setStatus('loaded', { toolChangeRequest: null, startWallClock: null, sendPtr: 0, execPtr: 0, inPlanner: 0, recovery: null })
      return
    }
    if (this._status === 'program_pause') {
      // Machine is in M0 Hold — hard-stop resets it immediately
      const handle = this._sendHandle
      this._sendHandle = null
      this._execPtr = 0
      this.sendPtr = 0
      this._recordExecution('aborted')
      this._setStatus('loaded', {
        startWallClock: null,
        sendPtr: 0,
        execPtr: 0,
        inPlanner: 0,
        recovery: null,
        toolChangeRequest: null,
        programPause: null,
      })
      clearCheckpoint().catch(() => {})
      handle?.hardStop()
      return
    }
    if (this._status !== 'running') return
    this._setStatus('stopping')
    if (this._sendHandle) {
      stopSend(this._sendHandle.chunkId)
      // Don't null _sendHandle here — the 'stopped' completion event handler clears it.
    }
  }

  /** Immediate hard reset — no deceleration, potential mid-move position loss. */
  emergencyStop(): void {
    setToolChangeModeActive(false)
    this._finalizeRuntimeSession().catch(() => {})
    const handle = this._sendHandle
    this._sendHandle = null
    this._execPtr = 0
    this.sendPtr = 0
    this._recordExecution('aborted')
    this._setStatus('loaded', {
      startWallClock: null,
      sendPtr: 0,
      execPtr: 0,
      inPlanner: 0,
      recovery: null,
      toolChangeRequest: null,
      programPause: null,
    })
    clearCheckpoint().catch(() => {})
    handle?.hardStop()
  }

  clear(): void {
    if (this._status === 'running') return
    this.analyzeAbort?.abort()
    this.analyzeAbort = null
    this._sendHandle = null
    this.lines = []
    this.sendPtr = 0
    this._execPtr = 0
    this.fileId = null
    this.filename = null
    this._toolSections = []
    this._currentSectionIndex = 0
    this._toolPreferences = {}
    this._ambiguousTools = []
    this._transformMode = 'none'
    this._activeRotation = null
    this._activeHeightmap = null
    broadcastPatch([setJobState({
      status: 'idle',
      fileId: null,
      filename: null,
      totalLines: 0,
      sendPtr: 0,
      execPtr: 0,
      inPlanner: 0,
      estimatedTotalMs: 0,
      startWallClock: null,
      axisRanges: null,
      analyzeProgress: 0,
      toolSections: null,
      recovery: null,
      errorMessage: null,
      toolChangeRequest: null,
      programPause: null,
      toolPreferences: {},
      ambiguousTools: [],
      transformMode: 'none',
    })])
    this._status = 'idle'
    clearAllJobData().catch(() => {})
  }

  /** Called once on server startup to restore persisted job state. */
  async bootRestore(): Promise<'empty' | 'loaded' | 'crash'> {
    const checkpoint = await loadCheckpoint()
    const mode: TransformMode = checkpoint?.transformMode ?? 'none'
    this._transformMode = mode

    const analysis = await loadRawAnalysis(mode)
    if (!analysis) return 'empty'

    try {
      const filePath = join(UPLOADS_DIR, analysis.fileId)
      const rawContent = await readFile(filePath, 'utf8')
      const content = applyTransforms(rawContent, mode, this._activeRotation, this._activeHeightmap)
      this.lines = analyzeGCode(content).lines
      this.fileId = analysis.fileId
      this.filename = analysis.filename
      this._toolSections = analysis.tools ?? []

      const hasCrash = !!checkpoint && checkpoint.fileId === analysis.fileId && checkpoint.execPtr > 0

      const baseState: Partial<JobState> = {
        fileId: analysis.fileId,
        filename: analysis.filename,
        totalLines: analysis.totalLines,
        sendPtr: 0,
        execPtr: 0,
        inPlanner: 0,
        estimatedTotalMs: analysis.estimatedTotalMs,
        startWallClock: null,
        axisRanges: analysis.axisRanges,
        analyzeProgress: 100,
        toolSections: analysis.tools,
        errorMessage: null,
        toolChangeRequest: null,
        programPause: null,
        toolPreferences: {},
        ambiguousTools: [],
        transformMode: mode,
      }

      if (hasCrash) {
        const resumePtr = checkpoint!.execPtr
        const modalStateAtResume = await getModalStateAtLine(resumePtr, mode)
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

      if (!this.lines.length || this.fileId !== checkpoint.fileId) {
        const rawContent = await readFile(join(UPLOADS_DIR, checkpoint.fileId), 'utf8')
        const content = applyTransforms(rawContent, this._transformMode, this._activeRotation, this._activeHeightmap)
        this.lines = analyzeGCode(content).lines
      }
      this.fileId = checkpoint.fileId
      this.filename = filename
      this.sendPtr = resumePtr
      this._execPtr = resumePtr

      const modal = await getModalStateAtLine(resumePtr, this._transformMode)
      const savedAnalysis = await loadRawAnalysis(this._transformMode)

      this._setStatus('recovering', {
        fileId: checkpoint.fileId,
        filename,
        totalLines: this.lines.length,
        sendPtr: resumePtr,
        execPtr: resumePtr,
        inPlanner: 0,
        estimatedTotalMs: savedAnalysis?.estimatedTotalMs ?? 0,
        axisRanges: savedAnalysis?.axisRanges ?? null,
        recovery: null,
        errorMessage: null,
        toolChangeRequest: null,
        programPause: null,
      })

      if (modal) {
        const lastStatus = getLastMachineStatus()
        const currentZ = lastStatus?.wpos.z ?? modal.position.z
        const safeZ = Math.max(currentZ, modal.position.z + RESUME_SAFE_Z_LIFT)
        const recoveryCommands = this._buildRecoverySequence(modal, safeZ)
        this._sendHandle = sendGCode(recoveryCommands, (event) => this._handleRecoveryEvent(event, null))
      } else {
        this._setStatus('running', { startWallClock: Date.now() })
        this._startMainSend()
      }
    } catch (err) {
      this._broadcastError(`Recovery failed: ${(err as Error).message}`)
    }
  }

  /** Called by ws.ts on machine disconnect. */
  onMachineDisconnected(): void {
    setToolChangeModeActive(false)
    this._finalizeRuntimeSession().catch(() => {})
    this._sendHandle = null
    this._mainJobChunkId = null  // suspended chunk was finalized by senderDisconnected()

    if (this._status === 'stopping') {
      // stopSend was in progress; treat as loaded since we didn't complete cleanly.
      this._execPtr = 0
      this.sendPtr = 0
      this._setStatus('loaded', { startWallClock: null, sendPtr: 0, execPtr: 0, inPlanner: 0, recovery: null, toolChangeRequest: null, programPause: null })
      clearCheckpoint().catch(() => {})
    } else if (this._status === 'running' || this._status === 'pausing' || this._status === 'recovering') {
      this._setStatus('paused', { errorMessage: 'Machine disconnected during job' })
    }
    // 'paused' status: suspended chunk already finalized by onMachineDisconnected in sender.
  }

  /** On server startup — check for a checkpoint and prepare recovery info. */
  async checkForRecovery(): Promise<JobState['recovery']> {
    const checkpoint = await loadCheckpoint()
    if (!checkpoint || checkpoint.execPtr <= 0) return null

    try {
      const resumePtr = checkpoint.execPtr
      const modalStateAtResume = await getModalStateAtLine(resumePtr, this._transformMode)
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

  async setTransformMode(
    mode: TransformMode,
    rotation: ProbingRotationResult | null,
    heightmap: HeightmapResult | null,
  ): Promise<void> {
    if (!this.fileId) {
      this._transformMode = mode
      this._activeRotation = rotation
      this._activeHeightmap = heightmap
      broadcastPatch([setJobState({ transformMode: mode })])
      return
    }
    const busy: JobState['status'][] = ['running', 'pausing', 'stopping']
    if (busy.includes(this._status)) {
      broadcastPatch([pushToast({ id: `tf-busy-${Date.now()}`, type: 'error', message: 'Cannot change transform while job is running', timeout: 4000 })])
      return
    }
    this._transformMode = mode
    this._activeRotation = rotation
    this._activeHeightmap = heightmap
    await this.loadJob(this.fileId)
  }

  async invalidateTransformCache(): Promise<void> {
    await clearAllTransformArtefacts()
    if (this._transformMode !== 'none') {
      this._transformMode = 'none'
      this._activeRotation = null
      this._activeHeightmap = null
      broadcastPatch([setJobState({ transformMode: 'none' })])
      broadcastPatch([pushToast({ id: `tf-invalidated-${Date.now()}`, type: 'info', message: 'Transform cleared — new measurements available', timeout: 5000 })])
      if (this.fileId) await this.loadJob(this.fileId)
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  /** Start sending from current sendPtr as a flat chunk (single section or recovery). */
  private async _startMainSend(): Promise<void> {
    const tc = await this._getToolchangeConfig()
    if (tc.strategy === 'atc-passthrough') {
      this._startFlatSend()
      return
    }
    if (this._toolSections.length <= 1) {
      this._startFlatSend()
      return
    }
    this._sendSection(this._currentSectionIndex)
  }

  private _startFlatSend(): void {
    const startPtr = this.sendPtr
    this._sendHandle = startSend(
      this.lines.slice(startPtr).map((l) => ({ raw: l.raw, isMotion: l.isMotion, category: l.category })),
      (event) => this._handleSenderEvent(event),
      startPtr,
    )
  }

  /** Send a specific tool section's lines as a chunk. */
  private _sendSection(idx: number): void {
    const section = this._toolSections[idx]
    if (!section) {
      this._completeJob()
      return
    }

    const nextSection = this._toolSections[idx + 1]
    const endLine = nextSection ? nextSection.startLine - 1 : this.lines.length - 1
    const startLine = Math.max(section.startLine, this.sendPtr)

    const chunk = this.lines.slice(startLine, endLine + 1)
    this._sendHandle = startSend(
      chunk.map((l) => ({ raw: l.raw, isMotion: l.isMotion, category: l.category })),
      (event) => this._handleSenderEvent(event),
      startLine,
    )
  }

  private _handleSenderEvent(event: SenderStatusEvent): void {
    if (!this._sendHandle) return

    const ops: PatchOp[] = []

    const inPlanner = Math.max(0, event.sent - event.executed)
    if (event.sent !== this.sendPtr || event.executed !== this._execPtr) {
      jLog(`progress: sent=${event.sent} exec=${event.executed} inPlanner=${inPlanner} status=${event.status} holdPhase=${event.holdPhase}`)
      this.sendPtr = event.sent
      this._execPtr = event.executed

      // Track T-word and M6 for atc-passthrough: update loadedToolNumber when M6 acks
      if (event.executed > 0) {
        const sentLine = this.lines[event.executed - 1]?.raw?.trim() ?? ''
        if (/^T(\d+)\s*$/i.test(sentLine)) {
          const m = sentLine.match(/^T(\d+)/i)
          if (m) this._lastSeenToolNumber = parseInt(m[1]!, 10)
        } else if (/^M6\b/i.test(sentLine) && this._lastSeenToolNumber !== null) {
          const toolNum = this._lastSeenToolNumber
          this._getActiveMachineId().then((machineId) => {
            if (machineId) {
              setLoadedTool(machineId, toolNum).then((op) => broadcastPatch([op])).catch(() => {})
            }
          }).catch(() => {})
        }
      }

      ops.push(setJobState({
        sendPtr: this.sendPtr,
        execPtr: this._execPtr,
        inPlanner,
      }))
      if (ops.length > 0) broadcastPatch(ops)
      this._checkpointIfDue()
    }

    // M0 program pause — machine entered Hold without user requesting it
    if (event.holdPhase === 0 && event.holdReason === 'program'
      && (this._status === 'running' || this._status === 'recovering')) {
      const pauseComment = this._findPauseComment(event.executed)
      this._enterProgramPause(pauseComment)
      return
    }

    // Skip other holdPhase progress events (Hold:1 deceleration during machine-initiated holds)
    if (event.holdPhase !== null) return

    // Chunk was suspended by suspendSend() — store chunkId for resume
    if (event.status === 'suspended') {
      jLog(`sender SUSPENDED event: chunkId=${event.chunkId.slice(0, 8)} sent=${event.sent} exec=${event.executed} → storing as mainJobChunkId, status→paused`)
      this._mainJobChunkId = event.chunkId
      this._sendHandle = null
      this.sendPtr = this._execPtr
      this._setStatus('paused', { sendPtr: this._execPtr })
      return
    }

    if (event.status !== 'completed') return

    jLog(`sender COMPLETED (main): chunkId=${event.chunkId.slice(0, 8)} mode=${event.completedMode} sent=${event.sent} exec=${event.executed} jobStatus=${this._status}`)
    this._sendHandle = null

    switch (event.completedMode) {
      case 'success':
        if (this._toolSections.length > 1) {
          this._finalizeRuntimeSession().then(() => {
            const nextIdx = this._currentSectionIndex + 1
            if (nextIdx < this._toolSections.length) {
              this._currentSectionIndex = nextIdx
              this._enterToolChangeMode(nextIdx)
            } else {
              this._completeJob()
            }
          }).catch((err) => {
            console.error('[jobRunner] runtime finalize error:', err)
            const nextIdx = this._currentSectionIndex + 1
            if (nextIdx < this._toolSections.length) {
              this._currentSectionIndex = nextIdx
              this._enterToolChangeMode(nextIdx)
            } else {
              this._completeJob()
            }
          })
        } else {
          this._finalizeRuntimeSession().catch(() => {})
          this._completeJob()
        }
        break
      case 'stopped':
        // stopSend() completed: machine is Idle. Return to loaded state.
        this._mainJobChunkId = null
        this._execPtr = 0
        this.sendPtr = 0
        this._recordExecution('aborted')
        this._setStatus('loaded', {
          startWallClock: null,
          sendPtr: 0,
          execPtr: 0,
          inPlanner: 0,
          recovery: null,
          toolChangeRequest: null,
          programPause: null,
        })
        clearCheckpoint().catch(() => {})
        break
      case 'soft':
        break
      case 'error':
        if (this._status !== 'paused' && this._status !== 'cancelled' && this._status !== 'error') {
          this._broadcastError(event.errorReason ?? 'Send error')
        }
        break
      case 'hard':
        break
    }
  }

  private _handleRecoveryEvent(event: SenderStatusEvent, suspendedChunkId: string | null): void {
    if (!this._sendHandle) return
    if (event.status !== 'completed') return

    this._sendHandle = null

    switch (event.completedMode) {
      case 'success':
        if (suspendedChunkId) {
          // Resume the suspended main job chunk now that repositioning is done.
          this._mainJobChunkId = null
          this._sendHandle = resumeChunk(suspendedChunkId)
          this._setStatus('running', { startWallClock: Date.now() })
          // The resumed chunk fires its own events via its existing onEvent callback.
        } else {
          this._setStatus('running', { startWallClock: Date.now() })
          this._startMainSend().catch(console.error)
        }
        break
      case 'error':
        this._broadcastError(event.errorReason ?? 'Recovery failed')
        break
      case 'hard':
        break
    }
  }

  private async _enterToolChangeMode(sectionIndex: number): Promise<void> {
    const section = this._toolSections[sectionIndex]!
    const tc = await this._getToolchangeConfig()

    const toolChangeRequest: JobState['toolChangeRequest'] = {
      sectionIndex,
      toolNumber: section.toolNumber,
      toolChangeType: section.toolChangeType ?? 'T',
      macroRunning: false,
      macroError: null,
    }

    this._status = 'tool_change'
    setToolChangeModeActive(true)
    setMode('idle')
    broadcastPatch([setJobState({ status: 'tool_change', toolChangeRequest })])

    switch (tc.strategy) {
      case 'manual-basic':
        this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: section.toolNumber, isJobContext: true })
        break

      case 'manual-toolsetter':
        await this._runToolsetterSequence(tc.position, section.toolNumber, true)
        break

      case 'atc-passthrough':
        // Should not be reached — _startMainSend() sends flat for passthrough
        this.resumeAfterToolChange()
        break

      case 'atc-managed': {
        const tcVars = await this._buildTcVars(section.toolNumber, tc)
        this._runToolchangeMacro(tc.macro, toolChangeRequest, tcVars)
        break
      }

      case 'custom-macro': {
        const tcVars = await this._buildTcVars(section.toolNumber, tc)
        this._runToolchangeMacro(tc.macro, toolChangeRequest, tcVars)
        break
      }
    }
  }

  private _runToolchangeMacro(
    macro: string,
    toolChangeRequest: NonNullable<JobState['toolChangeRequest']>,
    tcVars: TcVars,
  ): void {
    if (!macro?.trim()) {
      // No macro — open dialog for user to confirm
      this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: toolChangeRequest.toolNumber, isJobContext: true })
      return
    }
    const macroLines = macro.split('\n').map((l) => this._substituteToolVars(l, tcVars)).filter(Boolean)
    broadcastPatch([setJobState({ toolChangeRequest: { ...toolChangeRequest, macroRunning: true } })])
    this._sendHandle = sendGCode(macroLines, (event) => {
      if (event.status !== 'completed') return
      this._sendHandle = null
      if (event.completedMode === 'success') {
        broadcastPatch([setJobState({ toolChangeRequest: { ...toolChangeRequest, macroRunning: false, macroError: null } })])
        const nextToolNumber = toolChangeRequest.toolNumber
        this._getActiveMachineId().then((machineId) => {
          if (machineId) setLoadedTool(machineId, nextToolNumber).then((op) => broadcastPatch([op])).catch(() => {})
        }).catch(() => {})
        this.resumeAfterToolChange()
      } else {
        const errMsg = event.errorReason ?? 'Macro failed'
        broadcastPatch([setJobState({ toolChangeRequest: { ...toolChangeRequest, macroRunning: false, macroError: errMsg } })])
      }
    })
  }

  private _substituteToolVars(line: string, vars: TcVars): string {
    return line
      .replace(/\{current_tool\}/g, String(vars.currentTool))
      .replace(/\{next_tool\}/g, String(vars.targetTool))
      .replace(/\{current_slot\}/g, String(vars.currentSlot))
      .replace(/\{next_slot\}/g, String(vars.targetSlot))
  }

  private _openToolchangeDialog(props: ToolchangeModalProps): void {
    if (this._toolchangeModalId) return
    const { id, op } = openToolchangeModal(props)
    this._toolchangeModalId = id
    registerToolchangeResolveHandler(id, () => {
      // Fires when the client resolves (closes) the modal — clears server-side stale state.
      if (this._toolchangeModalId === id) {
        this._toolchangeModalId = null
        this._pendingStandaloneActive = false
        this._pendingStandaloneToolNumber = null
      }
    })
    broadcastPatch([op])
  }

  private _updateToolchangeDialog(props: Partial<ToolchangeModalProps>): void {
    if (!this._toolchangeModalId) return
    const ops = updateToolchangeModal(this._toolchangeModalId, props)
    broadcastPatch(ops)
  }

  private _closeToolchangeDialog(): void {
    if (!this._toolchangeModalId) return
    const id = this._toolchangeModalId
    this._toolchangeModalId = null
    unregisterToolchangeResolveHandler(id)
    const op = resolveModal(id, 'resolved')
    if (op) broadcastPatch([op])
  }

  private _broadcastToolchangeError(message: string, isJobContext: boolean): void {
    this._updateToolchangeDialog({ phase: 'error', errorMessage: message })
    if (!isJobContext) return
    // Don't auto-abort job — let user use the dialog Abort button
  }

  private _enterProgramPause(comment: string | null): void {
    this._status = 'program_pause'
    const { id, op: modalOp } = openProgramPauseModal(comment)
    this._programPauseModalId = id
    registerProgramPauseHandler(id, (action: 'continue' | 'cancel' | 'closed') => {
      this._programPauseModalId = null
      if (action === 'continue') {
        if (this._status !== 'program_pause') return
        this._setStatus('running', { programPause: null })
        this._sendHandle?.cycleStart()
      } else if (action === 'cancel') {
        this.stop()
      }
      // 'closed' — state already handled by the alarm/disconnect path that called _closeModal
    })
    broadcastPatch([setJobState({ status: 'program_pause', programPause: { comment } }), modalOp])
  }

  private _findPauseComment(execPtr: number): string | null {
    for (const offset of [0, -1, 1]) {
      const line = this.lines[execPtr + offset]
      if (line?.type === 'program_pause') return line.pauseComment ?? null
    }
    return null
  }

  private _startRuntimeSession(section: ToolSection | null): void {
    if (!section || section.toolNumber === 0) {
      this._runtimeSession = null
      return
    }
    const scope = this._toolPreferences[section.toolNumber] ?? 'M'
    this._runtimeSession = { toolNumber: section.toolNumber, scope, startMs: Date.now() }
  }

  private async _finalizeRuntimeSession(): Promise<void> {
    if (!this._runtimeSession) return
    const s = this._runtimeSession
    this._runtimeSession = null
    const endMs = Date.now()
    const durationMin = (endMs - s.startMs) / 60_000
    const machineId = await this._getActiveMachineId()

    const session = {
      ...s,
      machineId: machineId ?? 'unknown',
      jobFile: this.filename ?? '',
      endMs,
    }
    await appendRuntimeSession(session)
    if (machineId) {
      await toolStore.incrementRuntime(s.toolNumber, s.scope, machineId, durationMin)
    }
  }

  private async _getActiveMachineId(): Promise<string | null> {
    return getConnection().machineId
  }

  private async _getToolchangeConfig(): Promise<ToolchangeConfig> {
    try {
      const config = await getConfig() as { machines?: Array<{ id?: string; toolchange?: ToolchangeConfig }> }
      const machineId = await this._getActiveMachineId()
      const machine = machineId
        ? (config.machines?.find((m) => m.id === machineId) ?? config.machines?.[0])
        : config.machines?.[0]
      return machine?.toolchange ?? { strategy: 'manual-basic' }
    } catch {
      return { strategy: 'manual-basic' }
    }
  }

  private async _buildTcVars(
    nextToolNumber: number,
    tc: Extract<ToolchangeConfig, { magazineSlots: (number | null)[] }>,
  ): Promise<TcVars> {
    const machineId = await this._getActiveMachineId() ?? ''
    const currentTool = await getLoadedToolForMachine(machineId) ?? 0
    const slots = tc.magazineSlots

    const currentSlot = slots.findIndex((n: number | null) => n === currentTool) + 1
    const nextSlot = slots.findIndex((n: number | null) => n === nextToolNumber) + 1

    return {
      currentTool,
      targetTool: nextToolNumber,
      currentSlot,
      targetSlot: nextSlot,
      slots: slots.map(() => ({ x: 0, y: 0, z: 0 })),
    }
  }

  private async _runToolsetterSequence(
    pos: import('../../../shared/toolchange').ToolsetterConfig,
    nextToolNumber: number,
    isJobContext: boolean,
  ): Promise<void> {
    const parkSeq = buildToolchangePositionSequence(pos)
    this._sendHandle = sendGCode(parkSeq, (ev) => {
      if (ev.status !== 'completed') return
      this._sendHandle = null
      if (ev.completedMode !== 'success') {
        this._broadcastToolchangeError('Failed to reach toolchange position', isJobContext)
        return
      }
      this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber, isJobContext })
    })
  }

  async resumeToolsetterProbe(isJobContext: boolean): Promise<void> {
    const tc = await this._getToolchangeConfig()

    if (tc.strategy === 'manual-basic') {
      if (this._pendingStandaloneActive) {
        const toolNum = this._pendingStandaloneToolNumber
        this._pendingStandaloneActive = false
        this._pendingStandaloneToolNumber = null
        this._closeToolchangeDialog()
        const machineId = await this._getActiveMachineId() ?? ''
        if (machineId) setLoadedTool(machineId, toolNum).then((op) => broadcastPatch([op])).catch(() => {})
      } else if (isJobContext) {
        this._closeToolchangeDialog()
        this.resumeAfterToolChange()
      }
      return
    }

    if (tc.strategy !== 'manual-toolsetter') return
    const pos = tc.position
    const approachSeq = buildToolsetterApproachSequence(pos)
    this._updateToolchangeDialog({ phase: 'probing' })
    this._sendHandle = sendGCode(approachSeq, async (ev) => {
      if (ev.status !== 'completed') return
      this._sendHandle = null
      if (ev.completedMode !== 'success') {
        this._updateToolchangeDialog({ phase: 'error', errorMessage: 'Failed to reach toolsetter position' })
        return
      }
      try {
        const probeResult = await runToolsetterProbe(pos)
        const toolHeight = probeResult + pos.zOffset
        await new Promise<void>((resolve, reject) => {
          sendGCode(
            [`G43.1 Z${toolHeight.toFixed(4)}`, `G53 G0 Z${pos.safeZ.toFixed(4)}`],
            (ev2) => {
              if (ev2.status !== 'completed') return
              if (ev2.completedMode === 'success') resolve()
              else reject(new Error('Failed to apply tool length offset'))
            },
          )
        })

        if (pos.confirmAfterProbe) {
          this._updateToolchangeDialog({ phase: 'probe_result', probedOffset: toolHeight })
        } else {
          this._closeToolchangeDialog()
          if (isJobContext) this.resumeAfterToolChange()
        }
      } catch (err) {
        this._updateToolchangeDialog({ phase: 'error', errorMessage: (err as Error).message })
      }
    })
  }

  async finishToolchangeAndResume(): Promise<void> {
    this._closeToolchangeDialog()
    if (this._status === 'tool_change') {
      this.resumeAfterToolChange()
    }
  }

  async runReprobe(): Promise<void> {
    const tc = await this._getToolchangeConfig()
    if (tc.strategy !== 'manual-toolsetter') return
    const isJobContext = this._status === 'tool_change'
    await this.resumeToolsetterProbe(isJobContext)
  }

  async runStandaloneToolchange(targetToolNumber: number | null, operation: 'load' | 'unload'): Promise<void> {
    const busyStatuses: JobState['status'][] = ['running', 'pausing', 'stopping', 'recovering']
    if (busyStatuses.includes(this._status)) {
      broadcastPatch([pushToast({ id: `tc-busy-${Date.now()}`, type: 'error', message: 'Cannot change tool while job is running', timeout: 4000 })])
      return
    }

    const tc = await this._getToolchangeConfig()

    switch (tc.strategy) {
      case 'manual-basic':
        this._pendingStandaloneToolNumber = targetToolNumber
        this._pendingStandaloneActive = true
        this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: targetToolNumber, isJobContext: false, operation })
        break

      case 'manual-toolsetter':
        if (operation === 'load' && targetToolNumber !== null) {
          await this._runToolsetterSequence(tc.position, targetToolNumber, false)
        } else if (operation === 'unload') {
          const parkSeq = buildToolchangePositionSequence(tc.position)
          this._sendHandle = sendGCode(parkSeq, (ev) => {
            if (ev.status !== 'completed' || ev.completedMode !== 'success') return
            this._sendHandle = null
            this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: null, isJobContext: false, operation: 'unload' })
          })
        }
        break

      case 'atc-passthrough':
        if (operation === 'load' && targetToolNumber !== null) {
          sendGCode([`T${targetToolNumber}`, 'M6'], async () => {
            const machineId = await this._getActiveMachineId() ?? ''
            if (machineId) setLoadedTool(machineId, targetToolNumber).then((op) => broadcastPatch([op])).catch(() => {})
          })
        } else if (operation === 'unload') {
          const machineId = await this._getActiveMachineId() ?? ''
          if (machineId) setLoadedTool(machineId, null).then((op) => broadcastPatch([op])).catch(() => {})
        }
        break

      case 'atc-managed':
      case 'custom-macro': {
        const tn = targetToolNumber ?? 0
        const tcVars = await this._buildTcVars(tn, tc)
        this._runStandaloneMacro(tc.macro, tcVars, targetToolNumber, operation)
        break
      }
    }
  }

  private _runStandaloneMacro(
    macro: string,
    tcVars: TcVars,
    targetToolNumber: number | null,
    operation: 'load' | 'unload',
  ): void {
    if (!macro?.trim()) return
    const macroLines = macro.split('\n').map((l) => this._substituteToolVars(l, tcVars)).filter(Boolean)
    this._sendHandle = sendGCode(macroLines, async (event) => {
      if (event.status !== 'completed') return
      this._sendHandle = null
      if (event.completedMode === 'success' && operation === 'load') {
        const machineId = await this._getActiveMachineId() ?? ''
        if (machineId) setLoadedTool(machineId, targetToolNumber).then((op) => broadcastPatch([op])).catch(() => {})
      } else if (event.completedMode === 'success' && operation === 'unload') {
        const machineId = await this._getActiveMachineId() ?? ''
        if (machineId) setLoadedTool(machineId, null).then((op) => broadcastPatch([op])).catch(() => {})
      }
    })
  }

  private _completeJob(): void {
    this._execPtr = this.lines.length
    this.sendPtr = this.lines.length
    this._recordExecution('success')
    this._setStatus('complete', {
      startWallClock: null,
      sendPtr: this.lines.length,
      execPtr: this.lines.length,
      inPlanner: 0,
      toolChangeRequest: null,
      programPause: null,
    })
    clearCheckpoint().catch(() => {})
  }

  private _recordExecution(status: 'success' | 'error' | 'aborted', errorMessage?: string): void {
    const startedAt = this._execStartedAt
    const fileId = this.fileId
    this._execStartedAt = null
    if (!startedAt || !fileId) return
    const completedAt = Date.now()
    this._getActiveMachineId()
      .then((machineId) => appendExecution(fileId, { startedAt, completedAt, status, machineId: machineId ?? 'unknown', errorMessage }))
      .catch(() => {})
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
        version: 2,
        fileId: this.fileId!,
        filename: this.filename!,
        execPtr: this._execPtr,
        savedAt: now,
        transformMode: this._transformMode,
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

  private _closeModal(): PatchOp | null {
    if (!this._programPauseModalId) return null
    const op = settleProgramPauseModal(this._programPauseModalId, 'closed')
    this._programPauseModalId = null
    return op
  }

  private _setStatus(status: JobState['status'], extra?: Partial<JobState>): void {
    jLog(`status: ${this._status} → ${status}`)
    if (this._status === 'program_pause' && status !== 'program_pause') {
      const closeOp = this._closeModal()
      if (closeOp) broadcastPatch([closeOp])
    }
    this._status = status
    broadcastPatch([setJobState({ status, ...extra })])
  }

  private _broadcastError(msg: string): void {
    const closeOp = this._closeModal()
    if (closeOp) broadcastPatch([closeOp])
    this._recordExecution('error', msg)
    this._status = 'error'
    broadcastPatch([setJobState({ status: 'error', errorMessage: msg })])
  }
}

export const jobRunner = new JobRunner()
