export type GCodeLineType =
  | 'rapid'
  | 'feed'
  | 'arc'
  | 'dwell'
  | 'spindle'
  | 'coolant'
  | 'tool'
  | 'coord'
  | 'modal'
  | 'comment'
  | 'unsupported'

export interface GCodeLine {
  index: number
  raw: string
  type: GCodeLineType
  /** Estimated execution time in ms. 0 for non-motion lines. */
  estimatedDurationMs: number
  /** Cumulative estimated duration from line 0 through this line. */
  cumulativeDurationMs: number
}

export interface AxisRanges {
  x: { min: number; max: number }
  y: { min: number; max: number }
  z: { min: number; max: number }
}

export interface GCodeModalState {
  position: { x: number; y: number; z: number }
  positionMode: 'G90' | 'G91'
  workCoordinate: 'G54' | 'G55' | 'G56' | 'G57' | 'G58' | 'G59'
  feedRate: number
  spindleSpeed: number
  spindleMode: 'M3' | 'M4' | 'M5'
  coolant: 'M7' | 'M8' | 'M9' | 'off'
  units: 'G20' | 'G21'
  plane: 'G17' | 'G18' | 'G19'
  toolNumber: number
}

export type JobStatus =
  | 'idle'
  | 'loaded'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'recovering'
  | 'complete'
  | 'error'
  | 'cancelled'

export interface JobState {
  status: JobStatus
  fileId: string | null
  filename: string | null
  totalLines: number
  sendPtr: number
  estimatedTotalMs: number
  /** Wall-clock epoch ms when job started; adjusted on resume to exclude paused time. */
  startWallClock: number | null
  axisRanges: AxisRanges | null
  recovery: {
    available: boolean
    checkpointPtr: number
    resumePtr: number
    modalStateAtResume: GCodeModalState | null
  } | null
  errorMessage: string | null
}

export interface JobCheckpoint {
  version: 1
  fileId: string
  filename: string
  sendPtr: number
  savedAt: number
}
