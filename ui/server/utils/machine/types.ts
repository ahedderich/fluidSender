import type { CommandCategory } from '../gcode/classifier'

export type MachineMode = 'idle' | 'sending' | 'jogging' | 'probing'

export type SenderEventStatus = 'progress' | 'suspended' | 'completed'

// 'stopped'  — feed-hold graceful stop requested by stopSend()
// 'soft'     — natural drain stop (senderSoftStop)
// 'hard'     — immediate 0x18 (emergencyStop / senderHardStop)
// 'success'  — chunk ran to natural completion
// 'error'    — machine alarm or disconnect
export type SenderCompletedMode = 'success' | 'soft' | 'hard' | 'stopped' | 'error'

export interface SenderStatusEvent {
  chunkId: string
  sent: number        // sentPtr + lineOffset — job-global ack count
  executed: number    // executedPtr + lineOffset — job-global execution count
  status: SenderEventStatus
  completedMode: SenderCompletedMode | null
  errorReason: string | null
  /** Non-null while machine is in Hold state after a machine-initiated hold (M0/door); 1 = decelerating, 0 = fully stopped.
   *  NOT emitted during user-initiated suspend/stop sequences (those go straight to 'suspended'/'completed'). */
  holdPhase: 0 | 1 | null
  /**
   * Reason for the hold when holdPhase becomes 0:
   *   'program' = firmware-initiated hold (M0 or door)
   *   null      = not in a machine-initiated hold
   */
  holdReason: 'feed_hold' | 'program' | null
}

export interface SendHandle {
  readonly chunkId: string
  cycleStart(): void  // send ~ — resume a machine-initiated Hold (M0)
  hardStop(): void    // send 0x18 — immediate reset (emergency stop)
}

export interface SendableLine {
  raw: string
  isMotion: boolean
  category: CommandCategory
}

export interface MachineStatus {
  state: 'Idle' | 'Run' | 'Hold' | 'Jog' | 'Alarm' | 'Door' | 'Check' | 'Home' | 'Sleep' | 'Disconnected'
  /** Sub-state when in Hold: 1 = decelerating, 0 = fully stopped. Null for all other states. */
  holdPhase: 0 | 1 | null
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
