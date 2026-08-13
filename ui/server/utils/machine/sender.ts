import { machineConnection } from './connection'
import { getMode, setMode } from './machineMode'
import { hasBufferReporting } from './poller'
import { broadcastPatch, pushConsole, setConnection } from '../appState'
import { classifyLine, getActiveFirmwareVersion } from '../gcode/classifier'
import type { CommandCategory } from '../gcode/classifier'
import { getToolLengthOffset, resetToolLengthSession } from './toolLengthState'
import type { MachineStatus, SenderStatusEvent, SendHandle, SendableLine, SenderCompletedMode } from './types'

function isCommentOrEmpty(raw: string): boolean {
  const t = raw.trim()
  return t === '' || t.startsWith(';') || t.startsWith('(')
}

// Bytes a line will occupy on the wire once sendRaw() appends its newline.
function lineBytes(raw: string): number {
  return raw.length + (raw.endsWith('\n') ? 0 : 1)
}

const DEFAULT_MAX_PLANNER_SLOTS = 15
const COMPLETION_CONFIRM_COUNT = 2
const CHUNK_HISTORY_LIMIT = 100

// Character-counting dispatch budget (Category A/C only — see ActiveChunk.outstanding).
// FluidNC reports rxFree up to 256 (Channel.h); start conservative and self-calibrate
// upward from the first Idle status report, the same way _maxPlannerSlots does below.
// Dispatch is gated on bytes-in-flight alone — no separate Category-A/planner-slot cap.
// Real FluidNC's mc_line() blocks (withholding ok) until a planner slot is free, so
// firmware ack timing on its own already keeps "sent" from running far ahead of real
// execution; a client-side admission gate would just reintroduce a Bf:-derived dispatch
// throttle for no reason. Bf: is still used below (_plannerOccupied/_computeExecPtr),
// but purely to track executedPtr, never to gate what gets sent.
const DEFAULT_RX_BUDGET_BYTES = 200
const RX_BUDGET_MARGIN = 32

// Connection-level state — resets on disconnect
let _maxPlannerSlots = 0
let _rxBudgetBytes = DEFAULT_RX_BUDGET_BYTES
let _rxBudgetCalibrated = false
// Blocks currently occupied in the firmware planner, per the most recent Bf: report
// (effectiveMax - plannerFree). null until the first real report for the current
// chunk/connection arrives — distinct from a genuine reading of 0, so executedPtr
// inference (_advanceExecPtr) stays inert instead of assuming an empty planner before
// any measurement exists.
let _plannerOccupied: number | null = null
let _completionConfirmCount = 0
let _restoreProbing = false

/** Send the soft-reset byte (0x18) and invalidate any cached TLO — FluidNC's gc_init()
 *  zeroes the G43.1 tool length offset on every soft reset, so the cached value can no
 *  longer be trusted the instant this byte goes out. */
function sendSoftReset(): void {
  machineConnection.sendByte(0x18)
  resetToolLengthSession()
  const next = setConnection({ toolLengthOffset: getToolLengthOffset() })
  broadcastPatch([{ path: 'connection', set: { ...next } }])
}

type ChunkInternalState =
  | 'running'       // dispatching normally
  | 'suspending'    // feed hold sent, waiting for Hold:0, then 0x18 → suspended
  | 'suspended'     // halted; not _activeChunkId; dispatchPtr reset to executedPtr
  | 'soft_stopping' // draining remaining lines then finalizing as 'soft'
  | 'stopping'      // feed hold sent, waiting for Hold:0, then 0x18 → finalize 'stopped'

// One dispatched-but-not-yet-drained line. Comments are pushed pre-resolved (they never
// touch the wire and get no ok); real lines resolve when their ok/error arrives. The
// queue is always drained front-to-back (see _drain), so index 0 — if present — is
// always the oldest unresolved real line, i.e. the one the next ok belongs to.
interface OutstandingEntry {
  idx: number
  bytes: number
  category: CommandCategory
  resolved: boolean
}

interface ActiveChunk {
  chunkId: string
  lines: SendableLine[]
  dispatchPtr: number
  sentPtr: number      // count of acked/skipped lines
  executedPtr: number  // count of confirmed-executed lines
  lineOffset: number   // job-global offset; added to sentPtr/executedPtr in emitted events
  outstanding: OutstandingEntry[]  // sent-but-unresolved lines, FIFO, oldest first
  outstandingBytes: number         // sum of .bytes for unresolved entries — the char-count budget
  blockedOnB1B2: boolean           // true while an isolated B1/B2 line awaits its own ok
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
  _plannerOccupied = null
  _completionConfirmCount = 0
  const modeToRestore = _restoreProbing ? 'probing' : 'idle'
  _restoreProbing = false
  setMode(modeToRestore)
  chunk.onEvent?.(event)
  _storeHistory(event)
}

// Category-A-aware backward walk: given `occupied` real planner slots currently in use
// (per the last Bf: report), returns the largest index E such that exactly `occupied`
// Category-A lines fall within [E, chunk.sentPtr) — i.e. "the last `occupied` motion
// lines sent are still in the planner; everything before that is done." Category-C
// lines never consumed a slot, so they're skipped for free either way. This is an
// absolute recomputation, not an incremental delta — safe to call on every sentPtr or
// occupied change, and immune to drift from a missed or noisy sample.
function _computeExecPtr(chunk: ActiveChunk, occupied: number): number {
  let remaining = occupied
  let ptr = chunk.sentPtr
  while (ptr > chunk.executedPtr && remaining > 0) {
    if (chunk.lines[ptr - 1]!.category === 'A') remaining--
    ptr--
  }
  return ptr
}

// Re-derive executedPtr from the last-known occupied count, independent of whether
// that count just changed — this is what lets executedPtr keep pace with sentPtr
// between Bf: reports (e.g. a steady state where occupied holds constant), instead of
// only advancing at the instant a fresh report arrives.
function _advanceExecPtr(chunk: ActiveChunk): void {
  if (_plannerOccupied === null) return
  const computed = _computeExecPtr(chunk, _plannerOccupied)
  if (computed > chunk.executedPtr) chunk.executedPtr = computed
}

// Pop resolved entries off the front of the outstanding queue, advancing sentPtr (and,
// for comments/B1/B2, executedPtr) in strict file order, then re-deriving executedPtr
// for Category A/C from the last-known occupied count.
function _drain(chunk: ActiveChunk): void {
  let advanced = false
  while (chunk.outstanding.length > 0 && chunk.outstanding[0]!.resolved) {
    const entry = chunk.outstanding.shift()!
    chunk.sentPtr++
    advanced = true
    if (entry.category !== 'comment') chunk.outstandingBytes -= entry.bytes
    if (entry.category === 'comment') {
      chunk.executedPtr++
    } else if (entry.category === 'B1' || entry.category === 'B2') {
      // Planner guaranteed drained before firmware sent this ok — all acked lines done.
      chunk.executedPtr = chunk.sentPtr
      chunk.blockedOnB1B2 = false
    }
  }
  if (advanced) {
    _advanceExecPtr(chunk)
    _emit(chunk)
  }
}

function _sendLine(chunk: ActiveChunk, line: SendableLine): void {
  machineConnection.sendRaw(line.raw)
  const trimmed = line.raw.trim()
  if (trimmed) broadcastPatch([pushConsole({ type: 'sent', text: trimmed, ts: Date.now() })])
}

function _tryDispatch(chunk: ActiveChunk): void {
  if (chunk.internalState !== 'running' && chunk.internalState !== 'soft_stopping') return

  while (chunk.dispatchPtr < chunk.lines.length) {
    if (chunk.internalState === 'soft_stopping') break
    if (chunk.internalState !== 'running') break
    if (chunk.blockedOnB1B2) break

    const line = chunk.lines[chunk.dispatchPtr]!

    if (isCommentOrEmpty(line.raw)) {
      chunk.outstanding.push({ idx: chunk.dispatchPtr, bytes: 0, category: line.category, resolved: true })
      chunk.dispatchPtr++
      _drain(chunk)
      continue
    }

    if (line.category === 'B1' || line.category === 'B2') {
      // Isolate: let everything already in flight resolve before sending this one alone,
      // then block all further dispatch until its own ok confirms the drain firmware
      // guarantees for these categories.
      if (chunk.outstanding.length > 0) break

      _sendLine(chunk, line)
      chunk.outstanding.push({ idx: chunk.dispatchPtr, bytes: 0, category: line.category, resolved: false })
      chunk.blockedOnB1B2 = true
      chunk.dispatchPtr++
      break
    }

    // Category A/C/unknown — character-counted: keep multiple lines outstanding at
    // once, gated on bytes-in-flight rather than a per-line ok round trip. Always let
    // at least one line through even if it alone exceeds the budget, so an oversized
    // single line can't deadlock the queue.
    const bytes = lineBytes(line.raw)
    if (chunk.outstanding.length > 0 && chunk.outstandingBytes + bytes > _rxBudgetBytes) break

    _sendLine(chunk, line)
    chunk.outstanding.push({ idx: chunk.dispatchPtr, bytes, category: line.category, resolved: false })
    chunk.outstandingBytes += bytes
    chunk.dispatchPtr++
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
  const allConfirmed = chunk.outstanding.length === 0 && chunk.sentPtr === chunk.executedPtr
  // Without Bf: reporting, plannerFree is always 0 and can never confirm drain —
  // don't block completion on data this firmware will never send.
  const plannerDrained = !hasBufferReporting() || plannerFree >= effectiveMax
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

/** Called by ws.ts on every `ok` (or rejected `error:N`, which frees the same wire slot) from the machine. */
export function onOk(): void {
  if (!_activeChunkId) return
  const chunk = _chunks.get(_activeChunkId)
  if (!chunk) return
  if (chunk.outstanding.length === 0) return  // stale ok (console command sent before chunk)

  // Oldest unresolved entry — guaranteed to be the one this ok belongs to, since acks
  // arrive strictly in send order and _drain() always leaves an unresolved entry at
  // the front (or an empty queue) after every mutation.
  chunk.outstanding[0]!.resolved = true
  _drain(chunk)

  if (chunk.internalState === 'soft_stopping' && chunk.sentPtr === chunk.executedPtr) {
    _finalize(chunk, 'soft')
    return
  }

  _tryDispatch(chunk)
}

/** Called by ws.ts on every status poll response. */
export function onBufUpdate(
  plannerFree: number,
  rxFree: number,
  machineState: MachineStatus['state'],
  holdPhase: 0 | 1 | null,
): void {
  if (!_maxPlannerSlots && machineState === 'Idle' && plannerFree > 0) {
    _maxPlannerSlots = plannerFree
  }
  if (!_rxBudgetCalibrated && machineState === 'Idle' && rxFree > 0) {
    _rxBudgetBytes = Math.max(DEFAULT_RX_BUDGET_BYTES, rxFree - RX_BUDGET_MARGIN)
    _rxBudgetCalibrated = true
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
      // Capture before sendSoftReset() invalidates it — the resume recovery sequence
      // needs this to restore G43.1 once the chunk continues.
      const pausedToolLengthOffset = getToolLengthOffset()
      sendSoftReset()
      chunk.internalState = 'suspended'
      // 0x18 clears the planner — all queued-but-not-executing lines are gone.
      // executedPtr stays at its current value: it counts fully-completed commands.
      // dispatchPtr and sentPtr reset to executedPtr so the chunk resumes from the
      // interrupted command (index executedPtr), which the recovery sequence repositions
      // the machine to before replaying.
      chunk.dispatchPtr = chunk.executedPtr
      chunk.sentPtr = chunk.executedPtr
      chunk.outstanding = []
      chunk.outstandingBytes = 0
      chunk.blockedOnB1B2 = false
      _activeChunkId = null
      _plannerOccupied = null
      _completionConfirmCount = 0
      setMode('idle')
      _emit(chunk, { status: 'suspended', pausedToolLengthOffset })
    }
    return
  }

  // ── User-initiated stop: waiting for Hold:0 then reset ────────────────────
  if (machineState === 'Hold' && chunk.internalState === 'stopping') {
    const resolvedPhase = holdPhase ?? 0
    if (resolvedPhase === 0) {
      sendSoftReset()
      _finalize(chunk, 'stopped')
    }
    return
  }

  // ── Normal run path ───────────────────────────────────────────────────────
  const effectiveMax = _maxPlannerSlots || DEFAULT_MAX_PLANNER_SLOTS
  // Only trust a report as a real occupancy measurement when this firmware actually
  // sends Bf: — otherwise plannerFree is always 0 and would look like "planner full."
  if (hasBufferReporting()) {
    _plannerOccupied = Math.max(0, effectiveMax - plannerFree)
  }
  const beforeExecPtr = chunk.executedPtr
  _advanceExecPtr(chunk)
  if (chunk.executedPtr !== beforeExecPtr) _emit(chunk)

  // Without Bf: reporting, _plannerOccupied is never set, so _advanceExecPtr above is
  // always a no-op. Once everything has been dispatched and acked and the firmware
  // reports Idle, that IS completion — trust it directly rather than waiting on
  // planner data this firmware will never send.
  if (!hasBufferReporting() && machineState === 'Idle' && chunk.outstanding.length === 0 &&
    chunk.dispatchPtr >= chunk.lines.length && chunk.executedPtr < chunk.sentPtr) {
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
  _rxBudgetBytes = DEFAULT_RX_BUDGET_BYTES
  _rxBudgetCalibrated = false
  _plannerOccupied = null
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
    outstanding: [],
    outstandingBytes: 0,
    blockedOnB1B2: false,
    internalState: 'running',
    onEvent,
  }

  _chunks.set(chunkId, chunk)
  _activeChunkId = chunkId
  _plannerOccupied = null
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
  _plannerOccupied = null
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
    sendSoftReset()
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
