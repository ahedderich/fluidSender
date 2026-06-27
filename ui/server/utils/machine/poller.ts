import { machineConnection } from './connection'
import { parseStatusLine, resetWco } from './statusParser'
import type { MachineStatus } from './types'

const POLL_INTERVAL_MS = 200
const POSITION_TOLERANCE = 0.001

// Broadcast function — injected at startup to avoid circular imports with appState
let _broadcast: ((msg: unknown) => void) | null = null

export function initPoller(broadcastFn: (msg: unknown) => void) {
  _broadcast = broadcastFn
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let lastStatus: MachineStatus | null = null

/** Returns the last known machine status for inclusion in WS snapshots. */
export function getLastMachineStatus(): MachineStatus | null {
  return lastStatus
}

export function startPoller() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (machineConnection.isConnected) {
      machineConnection.sendRaw('?')
    }
  }, POLL_INTERVAL_MS)
}

export function stopPoller() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  lastStatus = null
  resetWco()
}

export function onStatusLine(line: string) {
  const status = parseStatusLine(line)
  if (!status) return
  const changed = _changed(lastStatus, status)
  lastStatus = status  // always update so buffer.planner is current for Buf routing
  if (changed) {
    _broadcast?.({ t: 'machine:status', payload: status })
  }
}

function _changed(prev: MachineStatus | null, next: MachineStatus): boolean {
  if (!prev) return true
  if (prev.state !== next.state) return true
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
