import { machineConnection } from './connection'
import { getMode } from './machineMode'
import { parseStatusLine, resetWco } from './statusParser'
import { broadcastPatch, pushToast } from '../appState'
import type { MachineStatus } from './types'

const POLL_INTERVAL_IDLE_MS = 200
// While a job chunk is actively dispatching, executedPtr for Category-A (motion)
// lines only advances via this poll's Bf: drain inference (see sender.ts
// onBufUpdate) — a slower poll can stall dispatch for up to a full interval once
// the in-flight motion window is exhausted, which is visible as stutter on
// small/fast arc sequences (e.g. adaptive toolpaths). Poll faster during 'sending'
// to shrink that blind window.
const POLL_INTERVAL_RUNNING_MS = 100
const POSITION_TOLERANCE = 0.001

// FluidNC defaults `$10` (status_mask) to 1 — Position bit only. The Buffer bit
// (`$10=3`) must be explicitly enabled or the sender's completion detection
// (sender.ts _checkCompletion/onBufUpdate) can never confirm a chunk drained,
// permanently wedging machine mode at 'sending'. Nudge it on every connect, and
// retry a few times in case the first attempt races a busy/rejecting firmware.
const BUFFER_WATCHDOG_POLLS = 10 // ~2s at POLL_INTERVAL_IDLE_MS between retries
const BUFFER_WATCHDOG_MAX_RETRIES = 3

// Broadcast function — injected at startup to avoid circular imports with appState
let _broadcast: ((msg: unknown) => void) | null = null

export function initPoller(broadcastFn: (msg: unknown) => void) {
  _broadcast = broadcastFn
}

let pollTimer: ReturnType<typeof setTimeout> | null = null
let lastStatus: MachineStatus | null = null
let _bufferSeen = false
let _bufferWatchdogPolls = 0
let _bufferWatchdogRetries = 0

/** Returns the last known machine status for inclusion in WS snapshots. */
export function getLastMachineStatus(): MachineStatus | null {
  return lastStatus
}

/** Whether this connection's firmware has ever included `Bf:`/`Buf:` in a status report. */
export function hasBufferReporting(): boolean {
  return _bufferSeen
}

function _scheduleNextPoll(): void {
  const interval = getMode() === 'sending' ? POLL_INTERVAL_RUNNING_MS : POLL_INTERVAL_IDLE_MS
  pollTimer = setTimeout(() => {
    if (machineConnection.isConnected) {
      machineConnection.sendByte(0x3F)
      _checkBufferWatchdog()
    }
    _scheduleNextPoll()
  }, interval)
}

export function startPoller() {
  if (pollTimer) return
  _bufferSeen = false
  _bufferWatchdogPolls = 0
  _bufferWatchdogRetries = 0
  // $-commands aren't blocked by Alarm state, so this is safe to send immediately,
  // before homing. Idempotent — a no-op on firmware where it's already set.
  machineConnection.sendRaw('$10=3')
  _scheduleNextPoll()
}

export function stopPoller() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  lastStatus = null
  _bufferSeen = false
  resetWco()
}

function _checkBufferWatchdog(): void {
  if (_bufferSeen) return
  _bufferWatchdogPolls++
  if (_bufferWatchdogPolls < BUFFER_WATCHDOG_POLLS) return
  _bufferWatchdogPolls = 0
  if (_bufferWatchdogRetries >= BUFFER_WATCHDOG_MAX_RETRIES) return
  _bufferWatchdogRetries++
  machineConnection.sendRaw('$10=3')
  if (_bufferWatchdogRetries >= BUFFER_WATCHDOG_MAX_RETRIES) {
    broadcastPatch([pushToast({
      id: `buf-report-warn-${Date.now()}`,
      type: 'warning',
      message: 'Machine did not confirm buffer status reporting ($10=3) — job/probe completion may be delayed.',
      timeout: 8000,
    })])
  }
}

export function onStatusLine(line: string) {
  const status = parseStatusLine(line)
  if (!status) return
  if (status.bufferReported) _bufferSeen = true
  const changed = _changed(lastStatus, status)
  lastStatus = status  // always update so buffer.planner is current for Buf routing
  if (changed) {
    _broadcast?.({ t: 'machine:status', payload: status })
  }
}

function _changed(prev: MachineStatus | null, next: MachineStatus): boolean {
  if (!prev) return true
  if (prev.state !== next.state) return true
  if (prev.holdPhase !== next.holdPhase) return true
  if (prev.spindleOn !== next.spindleOn) return true
  if (prev.coolantMist !== next.coolantMist) return true
  if (prev.coolantFlood !== next.coolantFlood) return true
  if (Math.abs(prev.feed - next.feed) > 0.001) return true
  if (Math.abs(prev.spindleSpeed - next.spindleSpeed) > 0.001) return true
  if (_posChanged(prev.mpos, next.mpos)) return true
  if (_posChanged(prev.wpos, next.wpos)) return true
  if (_overridesChanged(prev.overrides, next.overrides)) return true
  if (_limitSwitchesChanged(prev.limitSwitches, next.limitSwitches)) return true
  // Intentionally exclude buffer counts — they change every poll and are too noisy
  return false
}

function _posChanged(
  a: { x: number; y: number; z: number; a?: number },
  b: { x: number; y: number; z: number; a?: number },
): boolean {
  return (
    Math.abs(a.x - b.x) > POSITION_TOLERANCE ||
    Math.abs(a.y - b.y) > POSITION_TOLERANCE ||
    Math.abs(a.z - b.z) > POSITION_TOLERANCE ||
    Math.abs((a.a ?? 0) - (b.a ?? 0)) > POSITION_TOLERANCE
  )
}

function _overridesChanged(
  a: MachineStatus['overrides'],
  b: MachineStatus['overrides'],
): boolean {
  return a.feed !== b.feed || a.rapid !== b.rapid || a.spindle !== b.spindle
}

function _limitSwitchesChanged(
  a: MachineStatus['limitSwitches'],
  b: MachineStatus['limitSwitches'],
): boolean {
  if (a.length !== b.length) return true
  return a.some((sw, i) => sw.name !== b[i]?.name || sw.triggered !== b[i]?.triggered)
}
