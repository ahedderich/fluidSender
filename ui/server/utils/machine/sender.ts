import { machineConnection } from './connection'
import { getMode, setMode } from './machineMode'
import { broadcastPatch, pushConsole } from '../appState'
import type { MachineStatus, SenderStatusEvent, SendHandle, SendableLine, SenderCompletedMode } from './types'

const PLANNER_TARGET = 3
const DEFAULT_MAX_PLANNER_SLOTS = 15
const COMPLETION_CONFIRM_COUNT = 2
const CHUNK_HISTORY_LIMIT = 100

// Connection-level state — resets on disconnect
let _maxPlannerSlots = 0
let _inPlanner = 0
let _completionConfirmCount = 0


interface SentEntry {
  isMotion: boolean
  acked: boolean
}

interface ActiveChunk {
  chunkId: string
  lines: SendableLine[]
  dispatchPtr: number
  sent: number
  executed: number
  pendingAck: boolean
  sentQueue: SentEntry[]
  softStopping: boolean
  onEvent: ((e: SenderStatusEvent) => void) | undefined
}

let _activeChunk: ActiveChunk | null = null
const _chunkHistory = new Map<string, SenderStatusEvent>()

export function getMaxPlannerSlots(): number {
  return _maxPlannerSlots
}


function _makeEvent(chunk: ActiveChunk, overrides?: Partial<SenderStatusEvent>): SenderStatusEvent {
  return {
    chunkId: chunk.chunkId,
    sent: chunk.sent,
    executed: chunk.executed,
    completed: false,
    completedMode: null,
    errorReason: null,
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
    completed: true,
    completedMode,
    errorReason: errorReason ?? null,
  })
  _activeChunk = null
  _inPlanner = 0
  _completionConfirmCount = 0
  setMode('idle')
  // Fire callback and store history after clearing active state
  chunk.onEvent?.(event)
  _storeHistory(event)
}

function _drainNonMotion(chunk: ActiveChunk): boolean {
  let changed = false
  while (chunk.sentQueue.length > 0 && !chunk.sentQueue[0]!.isMotion && chunk.sentQueue[0]!.acked) {
    chunk.sentQueue.shift()
    chunk.executed++
    changed = true
  }
  return changed
}

function _tryDispatch(chunk: ActiveChunk): void {
  while (chunk.dispatchPtr < chunk.lines.length) {
    if (chunk.softStopping) break
    if (chunk.pendingAck) break

    const line = chunk.lines[chunk.dispatchPtr]!

    if (line.isMotion) {
      const motionInFlight = chunk.sentQueue.filter(e => e.isMotion).length
      if (motionInFlight >= PLANNER_TARGET) break
    }

    machineConnection.sendRaw(line.raw)
    const trimmed = line.raw.trim()
    if (trimmed) broadcastPatch([pushConsole({ type: 'sent', text: trimmed, ts: Date.now() })])

    chunk.sentQueue.push({ isMotion: line.isMotion, acked: false })
    chunk.pendingAck = true
    chunk.dispatchPtr++
    break  // one line per trigger; next dispatch fires on ack or BF event
  }
}

function _checkCompletion(
  chunk: ActiveChunk,
  plannerFree: number,
  effectiveMax: number,
  machineState: MachineStatus['state'],
): void {
  if (chunk.softStopping) return

  const allDispatched = chunk.dispatchPtr >= chunk.lines.length
  const allConfirmed = chunk.sentQueue.length === 0
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
  if (!_activeChunk) return
  const chunk = _activeChunk

  const entry = chunk.sentQueue.find(e => !e.acked)
  if (!entry) return  // stale ok (e.g. a console command sent before this chunk)

  entry.acked = true
  chunk.pendingAck = false
  chunk.sent++

  _drainNonMotion(chunk)
  _emit(chunk)

  if (chunk.softStopping && chunk.sentQueue.length === 0) {
    _finalize(chunk, 'soft')
    return
  }

  _tryDispatch(chunk)
}

/** Called by ws.ts on every status poll response. */
export function onBufUpdate(plannerFree: number, machineState: MachineStatus['state']): void {
  if (!_maxPlannerSlots && machineState === 'Idle' && plannerFree > 0) {
    _maxPlannerSlots = plannerFree
  }

  if (!_activeChunk) return
  const chunk = _activeChunk

  if (machineState === 'Alarm') {
    _finalize(chunk, 'error', 'Machine alarm')
    return
  }

  const effectiveMax = _maxPlannerSlots || DEFAULT_MAX_PLANNER_SLOTS
  const newInPlanner = Math.max(0, effectiveMax - plannerFree)
  const drained = _inPlanner - newInPlanner
  _inPlanner = newInPlanner

  let executedChanged = false

  if (drained > 0) {
    let remaining = drained
    while (remaining > 0 && chunk.sentQueue.length > 0) {
      const head = chunk.sentQueue[0]!
      if (!head.isMotion) {
        // Non-motion entries are drained by onOk; skip defensively
        chunk.sentQueue.shift()
        continue
      }
      if (!head.acked) break
      chunk.sentQueue.shift()
      chunk.executed++
      executedChanged = true
      remaining--
    }
  }

  // Fallback: when planner fully empty, drain all acked entries
  if (newInPlanner === 0) {
    while (chunk.sentQueue.length > 0 && chunk.sentQueue[0]!.acked) {
      chunk.sentQueue.shift()
      chunk.executed++
      executedChanged = true
    }
  }

  if (executedChanged) _emit(chunk)

  if (chunk.softStopping && chunk.sentQueue.length === 0) {
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
  if (_activeChunk) {
    _finalize(_activeChunk, 'error', 'Machine disconnected')
  }
}

/** Start sending a block of lines. Throws if machine is not in idle mode. */
export function send(lines: SendableLine[], onEvent?: (e: SenderStatusEvent) => void): SendHandle {
  if (getMode() !== 'idle') {
    throw new Error(`Cannot start send: machine is in '${getMode()}' mode`)
  }

  const chunkId = crypto.randomUUID()
  const chunk: ActiveChunk = {
    chunkId,
    lines,
    dispatchPtr: 0,
    sent: 0,
    executed: 0,
    pendingAck: false,
    sentQueue: [],
    softStopping: false,
    onEvent,
  }

  _activeChunk = chunk
  _inPlanner = 0
  _completionConfirmCount = 0
  setMode('sending')

  _emit(chunk)  // initial state event

  if (lines.length === 0) {
    _finalize(chunk, 'success')
  } else {
    _tryDispatch(chunk)
  }

  return {
    chunkId,
    softStop: () => senderSoftStop(chunkId),
    hardStop: () => senderHardStop(chunkId),
  }
}

export function senderSoftStop(chunkId?: string): void {
  const targetId = chunkId ?? _activeChunk?.chunkId
  if (!targetId) return
  if (_chunkHistory.has(targetId)) return
  if (_activeChunk?.chunkId !== targetId) return

  _activeChunk.softStopping = true
  if (_activeChunk.sentQueue.length === 0) {
    _finalize(_activeChunk, 'soft')
  }
}

export function senderHardStop(chunkId?: string): void {
  const targetId = chunkId ?? _activeChunk?.chunkId
  if (!targetId) return
  if (_chunkHistory.has(targetId)) return
  if (_activeChunk?.chunkId !== targetId) return

  machineConnection.sendByte(0x18)
  _finalize(_activeChunk, 'hard')
}

export function getSenderStatus(chunkId?: string): SenderStatusEvent | null {
  const targetId = chunkId ?? _activeChunk?.chunkId
  if (!targetId) return null

  const historical = _chunkHistory.get(targetId)
  if (historical) return historical

  if (_activeChunk?.chunkId === targetId) {
    return _makeEvent(_activeChunk)
  }

  return null
}
