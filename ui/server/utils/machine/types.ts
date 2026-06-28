export type MachineMode = 'idle' | 'sending' | 'jogging'

export type SenderCompletedMode = 'success' | 'soft' | 'hard' | 'error'

export interface SenderStatusEvent {
  chunkId: string
  sent: number        // lines dispatched and ok-acked
  executed: number    // lines confirmed executed via BF planner delta
  completed: boolean
  completedMode: SenderCompletedMode | null
  errorReason: string | null
}

export interface SendHandle {
  readonly chunkId: string
  softStop(): void
  hardStop(): void
}

export interface SendableLine {
  raw: string
  isMotion: boolean
}

export interface MachineStatus {
  state: 'Idle' | 'Run' | 'Hold' | 'Jog' | 'Alarm' | 'Door' | 'Check' | 'Home' | 'Sleep' | 'Disconnected'
  mpos: { x: number; y: number; z: number; a?: number }
  wpos: { x: number; y: number; z: number; a?: number }
  wco: { x: number; y: number; z: number; a?: number }
  feed: number
  spindleSpeed: number
  buffer: { planner: number; rx: number }
  overrides: { feed: number; rapid: number; spindle: number }
  limitSwitches: { name: string; triggered: boolean }[]
  probe: boolean
  toolsetter: boolean
  door: boolean
  spindleOn: boolean
  coolantMist: boolean
  coolantFlood: boolean
}
