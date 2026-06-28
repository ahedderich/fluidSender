import type { MachineMode } from './types'

let _broadcast: ((msg: unknown) => void) | null = null
let _mode: MachineMode = 'idle'

export function initMachineMode(broadcastFn: (msg: unknown) => void): void {
  _broadcast = broadcastFn
}

export function getMode(): MachineMode {
  return _mode
}

export function setMode(mode: MachineMode): void {
  if (_mode === mode) return
  _mode = mode
  _broadcast?.({ t: 'machine:mode', payload: mode })
}
