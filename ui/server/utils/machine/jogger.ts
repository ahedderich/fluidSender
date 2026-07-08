import { machineConnection } from './connection'
import { getMode, setMode } from './machineMode'
import type { MachineStatus } from './types'

// Jog sends bypass the ok-tracked job queue entirely, so without a bound here a
// continuous-jog interval faster than the connection's round-trip would build an
// unbounded backlog of already-written $J= lines ahead of a later jog-cancel byte
// in the stream — the firmware processes them in order before it ever sees the cancel.
const MAX_IN_FLIGHT = 2

let _inFlight = 0

/** Send a jog command. No-ops silently if a send is active (mutual exclusion) or too many
 *  jog commands are already unacknowledged (bounds backlog ahead of a jog-cancel). */
export function sendJog(command: string): void {
  const mode = getMode()
  if (mode === 'sending') return
  if (_inFlight >= MAX_IN_FLIGHT) return
  if (mode !== 'jogging') setMode('jogging')
  _inFlight++
  machineConnection.sendRaw(command)
}

/** Cancel in-flight jog moves. */
export function cancelJog(): void {
  _inFlight = 0
  machineConnection.sendByte(0x85)
}

/** Called on every firmware `ok`/`error:` ack while jogging (job-queue acks are handled separately). */
export function onJogOk(): void {
  if (_inFlight > 0) _inFlight--
}

/** Called on every status update. Resets jogging mode when machine leaves Jog state. */
export function onJogStatusUpdate(state: MachineStatus['state']): void {
  if (getMode() === 'jogging' && state !== 'Jog') {
    setMode('idle')
    _inFlight = 0
  }
}
