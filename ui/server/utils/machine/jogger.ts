import { machineConnection } from './connection'
import { getMode, setMode } from './machineMode'
import type { MachineStatus } from './types'

/** Send a jog command. No-ops silently if a send is active (mutual exclusion). */
export function sendJog(command: string): void {
  const mode = getMode()
  if (mode === 'sending') return
  if (mode !== 'jogging') setMode('jogging')
  machineConnection.sendRaw(command)
}

/** Cancel in-flight jog moves. */
export function cancelJog(): void {
  machineConnection.sendByte(0x85)
}

/** Called on every status update. Resets jogging mode when machine leaves Jog state. */
export function onJogStatusUpdate(state: MachineStatus['state']): void {
  if (getMode() === 'jogging' && state !== 'Jog') {
    setMode('idle')
  }
}
