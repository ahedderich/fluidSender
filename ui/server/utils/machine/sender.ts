import { machineConnection } from './connection'
import { getMode, setMode } from './machineMode'
import { broadcastPatch, pushConsole } from '../appState'
import { classifyLine, getActiveFirmwareVersion } from '../gcode/classifier'
import type { MachineStatus, SenderStatusEvent, SendHandle, SendableLine, SenderCompletedMode } from './types'

function isCommentOrEmpty(raw: string): boolean {
  const t = raw.trim()
  return t === '' || t.startsWith(';') || t.startsWith('(')
}

const PLANNER_SAFETY_MARGIN = 2
const PLANNER_TARGET_FALLBACK = 3
const DEFAULT_MAX_PLANNER_SLOTS = 15
const COMPLETION_CONFIRM_COUNT = 2
const CHUNK_HISTORY_LIMIT = 100

// Connection-level state — resets on disconnect
let _maxPlannerSlots = 0
let _inPlanner = 0
let _completionConfirmCount = 0
let _restoreProbing = false

function _getPlannerTarget(): number {
  return _maxPlannerSlots > 0
    ? Math.max(PLANNER_TARGET_FALLBACK, _maxPlannerSlots - PLANNER_SAFETY_MARGIN)
    : PLANNER_TARGET_FALLBACK
}

type ChunkInternalState =
  | 'running'       // dispatching normally
  | 'suspending'    // feed hold sent, waiting for Hold:0, then 0x18 → suspended
  | 'suspended'     // halted; not _activeChunkId; dispatchPtr reset to executedPtr
  | 'soft_stopping' // draining remaining lines then finalizing as 'soft'
  | 'stopping'      // feed hold sent, waiting for Hold:0, then 0x18 → finalize 'stopped'

interface ActiveChunk {
  chunkId: string
  lines: SendableLine[]
  dispatchPtr: number
  sentPtr: number      // count of acked/skipped lines
  executedPtr: number  // count of confirmed-executed lines
  lineOffset: number   // job-global offset; added to sentPtr/executedPtr in emitted events
  pendingAck: boolean  // true while one real line has been sent but ok not yet received
  internalState: ChunkInternalState
  onEvent: ((e: SenderStatusEvent) => void) | undefined
}

// All live chunks (running + suspended). Completed chunks are removed.
const _chunks = new Map<string, ActiveChunk>()
// Exclusive send lock; null when idle.
let _activeChunkId: string | null = null
// Completed chunks — last event only, for status queries.
const _chunkHistory = new Map<string, SenderStatusEvent>()

export function getMaxPlannerSlots(): number {
  return _maxPlannerSlots
}

export function isJobActive(): boolean {
  return _activeChunkId !== null
}

function _makeEvent(chunk: ActiveChunk, overrides?: Partial<SenderStatusEvent>): SenderStatusEvent {
  return {
    chunkId: chunk.chunkId,
    sent: chunk.sentPtr + chunk.lineOffset,
    executed: chunk.executedPtr + chunk.lineOffset,
    status: 'progress',
    completedMode: null,
    errorReason: null,
    holdPhase: null,
    holdReason: null,
    ...overrides,
  }
}

function _emit(chunk: ActiveChunk, overrides?: Partial<SenderStatusEvent>): void {
  chunk.onEvent?.(_makeEvent(chunk, overrides))
}

function _storeHistory(event: SenderStatusEvent): void {
  if (_chunkHistory.size >= CHUNK_HISTORY_LIMIT) {
    const oldest = _chunkHistory.keys().next().value
    if (oldest !== undefined) _chunkHistory.delete(oldest)
  }
  _chunkHistory.set(event.chunkId, event)
}

function _finalize(chunk: ActiveChunk, completedMode: SenderCompletedMode, errorReason?: string): void {
  const event = _makeEvent(chunk, {
    status: 'completed',
    completedMode,
    errorReason: errorReason ?? null,
  })
  _chunks.delete(chunk.chunkId)
  if (_activeChunkId === chunk.chunkId) _activeChunkId = null
  _inPlanner = 0
  _completionConfirmCount = 0
  const modeToRestore = _restoreProbing ? 'probing' : 'idle'
  _restoreProbing = false
  setMode(modeToRestore)
  chunk.onEvent?.(event)
  _storeHistory(event)
}

// Walk backward from dispatchPtr to find the last non-comment line (the one just acked).
function _findLastRealLine(chunk: ActiveChunk): number | null {
  for (let i = chunk.dispatchPtr - 1; i >= 0; i--) {
    if (!isCommentOrEmpty(chunk.lines[i]!.raw)) return i
  }
  return null
}

function _tryDispatch(chunk: ActiveChunk): void {
  if (chunk.internalState !== 'running' && chunk.internalState !== 'soft_stopping') return

  while (chunk.dispatchPtr < chunk.lines.length) {
    if (chunk.internalState === 'soft_stopping') break
    if (chunk.internalState !== 'running') break
    if (chunk.pendingAck) break

    const line = chunk.lines[chunk.dispatchPtr]!

    if (isCommentOrEmpty(line.raw)) {
      chunk.sentPtr++
      chunk.executedPtr++
      chunk.dispatchPtr++
      _emit(chunk)
      continue
    }

    if (line.isMotion) {
      const motionInFlight = chunk.lines
        .slice(chunk.executedPtr, chunk.sentPtr)
        .filter((l) => l.category === 'A')
        .length
      if (motionInFlight >= _getPlannerTarget()) break
    }

    machineConnection.sendRaw(line.raw)
    const trimmed = line.raw.trim()
    if (trimmed) broadcastPatch([pushConsole({ type: 'sent', text: trimmed, ts: Date.now() })])

    chunk.pendingAck = true
    chunk.dispatchPtr++
    break
  }
}

function _checkCompletion(
  chunk: ActiveChunk,
  plannerFree: number,
  effectiveMax: number,
  machineState: MachineStatus['state'],
): void {
  if (chunk.internalState !== 'running') return

  const allDispatched = chunk.dispatchPtr >= chunk.lines.length
  const allConfirmed = !chunk.pendingAck && chunk.sentPtr === chunk.executedPtr
  const plannerDrained = plannerFree >= effectiveMax
  const isIdle = machineState === 'Idle'

  if (allDispatched && allConfirmed && plannerDrained && isIdle) {
    _completionConfirmCount++
    if (_completionConfirmCount >= COMPLETION_CONFIRM_COUNT) {
      _finalize(chunk, 'success')
    }
  } else {
    _completionConfirmCount = 0
  }
}

/** Called by ws.ts on every `ok` from the machine. */
export function onOk(): void {
  if (!_activeChunkId) return
  const chunk = _chunks.get(_activeChunkId)
  if (!chunk) return
  if (!chunk.pendingAck) return  // stale ok (console command sent before chunk)

  chunk.pendingAck = false
  chunk.sentPtr++

  // Determine category of the acked line (walk back past any comments).
  const ackedIdx = _findLastRealLine(chunk)
  const category = ackedIdx !== null ? chunk.lines[ackedIdx]!.category : 'unknown'

  if (category === 'B1' || category === 'B2') {
    // Planner guaranteed drained before firmware sent this ok — all acked lines done.
    chunk.executedPtr = chunk.sentPtr
  } else if (category === 'C' || category === 'unknown') {
    // Immediate ack — preceding motions may still be executing; drain inference handles it.
  }
  // Category A (motion): drain inference handles execPtr advance.

  _emit(chunk)

  if (chunk.internalState === 'soft_stopping' && chunk.sentPtr === chunk.executedPtr) {
    _finalize(chunk, 'soft')
    return
  }

  _tryDispatch(chunk)
}

/** Called by ws.ts on every status poll response. */
export function onBufUpdate(
  plannerFree: number,
  machineState: MachineStatus['state'],
  holdPhase: 0 | 1 | null,
): void {
  if (!_maxPlannerSlots && machineState === 'Idle' && plannerFree > 0) {
    _maxPlannerSlots = plannerFree
  }

  if (!_activeChunkId) return
  const chunk = _chunks.get(_activeChunkId)
  if (!chunk) return

  if (machineState === 'Alarm') {
    _finalize(chunk, 'error', 'Machine alarm')
    return
  }

  // ── Machine-initiated Hold (M0, door) ─────────────────────────────────────
  // Only emit holdPhase events when the chunk is running normally.
  if (machineState === 'Hold' && chunk.internalState === 'running') {
    const resolvedPhase = holdPhase ?? 0
    _emit(chunk, { holdPhase: resolvedPhase, holdReason: 'program' })
    return
  }

  // ── User-initiated suspend: waiting for Hold:0 then reset ─────────────────
  if (machineState === 'Hold' && chunk.internalState === 'suspending') {
    const resolvedPhase = holdPhase ?? 0
    if (resolvedPhase === 0) {
      machineConnection.sendByte(0x18)
      chunk.internalState = 'suspended'
      // 0x18 clears the planner — all queued-but-not-executing lines are gone.
      // executedPtr stays at its current value: it counts fully-completed commands.
      // dispatchPtr and sentPtr reset to executedPtr so the chunk resumes from the
      // interrupted command (index executedPtr), which the recovery sequence repositions
      // the machine to before replaying.
      chunk.dispatchPtr = chunk.executedPtr
      chunk.sentPtr = chunk.executedPtr
      chunk.pendingAck = false
      _activeChunkId = null
      _inPlanner = 0
      _completionConfirmCount = 0
      setMode('idle')
      _emit(chunk, { status: 'suspended' })
    }
    return
  }

  // ── User-initiated stop: waiting for Hold:0 then reset ────────────────────
  if (machineState === 'Hold' && chunk.internalState === 'stopping') {
    const resolvedPhase = holdPhase ?? 0
    if (resolvedPhase === 0) {
      machineConnection.sendByte(0x18)
      _finalize(chunk, 'stopped')
    }
    return
  }

  // ── Normal run path ───────────────────────────────────────────────────────
  const effectiveMax = _maxPlannerSlots || DEFAULT_MAX_PLANNER_SLOTS
  const newInPlanner = Math.max(0, effectiveMax - plannerFree)
  const drained = _inPlanner - newInPlanner
  _inPlanner = newInPlanner

  if (drained > 0) {
    let remaining = drained
    let ptr = chunk.executedPtr
    while (ptr < chunk.sentPtr) {
      const ln = chunk.lines[ptr]!
      if (ln.category === 'A') {
        if (remaining <= 0) break
        remaining--
        ptr++
      } else if (ln.category === 'C') {
        // Category C lines don't consume planner slots — advance for free.
        ptr++
      } else {
        // B1/B2: onOk sets execPtr=sentPtr when its ok arrives; stop and wait.
        break
      }
    }
    if (ptr > chunk.executedPtr) {
      chunk.executedPtr = ptr
      _emit(chunk)
    }
  }

  // Fallback: planner fully empty → align executedPtr to sentPtr
  if (newInPlanner === 0 && chunk.executedPtr < chunk.sentPtr) {
    chunk.executedPtr = chunk.sentPtr
    _emit(chunk)
  }

  if (chunk.internalState === 'soft_stopping' && chunk.sentPtr === chunk.executedPtr) {
    _finalize(chunk, 'soft')
    return
  }

  _tryDispatch(chunk)
  _checkCompletion(chunk, plannerFree, effectiveMax, machineState)
}

/** Called by ws.ts on machine disconnect. */
export function onMachineDisconnected(): void {
  _maxPlannerSlots = 0
  _inPlanner = 0
  _completionConfirmCount = 0
  if (_activeChunkId) {
    const chunk = _chunks.get(_activeChunkId)
    if (chunk) _finalize(chunk, 'error', 'Machine disconnected')
  }
  // Clear any suspended chunks too — they can't be resumed after disconnect.
  for (const [id, chunk] of _chunks) {
    if (id !== _activeChunkId) {
      const event = _makeEvent(chunk, { status: 'completed', completedMode: 'error', errorReason: 'Machine disconnected' })
      chunk.onEvent?.(event)
      _storeHistory(event)
    }
  }
  _chunks.clear()
  _activeChunkId = null
}

/** Start sending a block of lines. Throws if machine is not in idle or probing mode.
 *  @param lineOffset — job lines preceding this chunk; added to sent/executed in events so callers see job-global counts. */
export function startSend(lines: SendableLine[], onEvent?: (e: SenderStatusEvent) => void, lineOffset = 0): SendHandle {
  const currentMode = getMode()
  if (currentMode !== 'idle' && currentMode !== 'probing') {
    throw new Error(`Cannot start send: machine is in '${currentMode}' mode`)
  }
  _restoreProbing = currentMode === 'probing'

  const chunkId = crypto.randomUUID()
  const chunk: ActiveChunk = {
    chunkId,
    lines,
    dispatchPtr: 0,
    sentPtr: 0,
    executedPtr: 0,
    lineOffset,
    pendingAck: false,
    internalState: 'running',
    onEvent,
  }

  _chunks.set(chunkId, chunk)
  _activeChunkId = chunkId
  _inPlanner = 0
  _completionConfirmCount = 0
  setMode('sending')

  _emit(chunk)

  if (lines.length === 0) {
    _finalize(chunk, 'success')
  } else {
    _tryDispatch(chunk)
  }

  return {
    chunkId,
    cycleStart: () => senderCycleStart(chunkId),
    hardStop: () => senderHardStop(chunkId),
  }
}

/** Pause: send feed hold, wait for Hold:0, send 0x18. Fires 'suspended' event when complete. */
export function suspendSend(chunkId: string): void {
  if (_activeChunkId !== chunkId) return
  const chunk = _chunks.get(chunkId)
  if (!chunk || chunk.internalState !== 'running') return

  chunk.internalState = 'suspending'
  machineConnection.sendByte(0x21)  // '!'
  // Completion fires in onBufUpdate when state === 'Hold' && holdPhase === 0
}

/** Resume a suspended chunk. Throws if another chunk is active. Returns a SendHandle for the resumed chunk. */
export function resumeChunk(chunkId: string): SendHandle {
  if (_activeChunkId !== null) {
    throw new Error('Cannot resume chunk: another chunk is active')
  }
  const chunk = _chunks.get(chunkId)
  if (!chunk || chunk.internalState !== 'suspended') {
    throw new Error(`Chunk ${chunkId} is not in suspended state`)
  }

  chunk.internalState = 'running'
  _activeChunkId = chunkId
  _inPlanner = 0
  _completionConfirmCount = 0
  setMode('sending')
  _emit(chunk)
  _tryDispatch(chunk)

  return {
    chunkId,
    cycleStart: () => senderCycleStart(chunkId),
    hardStop: () => senderHardStop(chunkId),
  }
}

/** Stop: send feed hold, wait for Hold:0, send 0x18. Fires 'completed' 'stopped' event when done. */
export function stopSend(chunkId: string): void {
  if (_activeChunkId !== chunkId) return
  const chunk = _chunks.get(chunkId)
  if (!chunk || chunk.internalState !== 'running') return

  chunk.internalState = 'stopping'
  machineConnection.sendByte(0x21)  // '!'
  // Completion fires in onBufUpdate when state === 'Hold' && holdPhase === 0
}

export function senderSoftStop(chunkId?: string): void {
  const targetId = chunkId ?? _activeChunkId
  if (!targetId) return
  if (_chunkHistory.has(targetId)) return
  if (_activeChunkId !== targetId) return
  const chunk = _chunks.get(targetId)
  if (!chunk) return

  chunk.internalState = 'soft_stopping'
  if (chunk.sentPtr === chunk.executedPtr) {
    _finalize(chunk, 'soft')
  }
}

/** Send cycle start (`~`). Resumes machine from a machine-initiated Hold (M0/door). */
export function senderCycleStart(chunkId?: string): void {
  const targetId = chunkId ?? _activeChunkId
  if (!targetId) return
  if (_chunkHistory.has(targetId)) return
  if (_activeChunkId !== targetId) return
  const chunk = _chunks.get(targetId)
  if (!chunk) return

  machineConnection.sendByte(0x7E)
  _tryDispatch(chunk)
}

export function senderHardStop(chunkId?: string): void {
  const targetId = chunkId ?? _activeChunkId
  if (!targetId) return
  if (_chunkHistory.has(targetId)) return
  const chunk = _chunks.get(targetId)
  if (!chunk) return

  // Only send 0x18 if this is the active chunk (machine is still running).
  // Suspended chunks have already received 0x18 during the suspend sequence.
  if (_activeChunkId === targetId) {
    machineConnection.sendByte(0x18)
  }
  _finalize(chunk, 'hard')
}

export function getSenderStatus(chunkId?: string): SenderStatusEvent | null {
  const targetId = chunkId ?? _activeChunkId
  if (!targetId) return null

  const historical = _chunkHistory.get(targetId)
  if (historical) return historical

  const chunk = _chunks.get(targetId)
  if (chunk) return _makeEvent(chunk)

  return null
}

/**
 * Send raw GCode strings. Each line is classified using the active firmware version.
 * Use this for wizard/macro/recovery commands that skip the full job analyzer.
 */
export function sendGCode(
  lines: string[],
  onEvent?: (e: SenderStatusEvent) => void,
  lineOffset = 0,
): SendHandle {
  const sendable: SendableLine[] = lines.map(raw => {
    const classified = classifyLine(raw, getActiveFirmwareVersion())
    return { raw, isMotion: classified.isMotion, category: classified.category }
  })
  return startSend(sendable, onEvent, lineOffset)
}
