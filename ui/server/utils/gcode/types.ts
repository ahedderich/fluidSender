export type GCodeLineType =
  | 'rapid'
  | 'feed'
  | 'arc'
  | 'probe'
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
  /** True for motion commands that queue into the FluidNC planner (rapid/feed/arc). */
  isMotion: boolean
  /** Estimated execution time in ms. 0 for non-motion lines. */
  estimatedDurationMs: number
  /** Cumulative estimated duration from line 0 through this line. */
  cumulativeDurationMs: number
}

/** A single tool section — all lines from startLine to endLine use toolNumber. */
export interface ToolSection {
  toolNumber: number
  /** Raw GCode command that triggered this tool change; null for the initial section. */
  toolChangeCmd: string | null
  startLine: number
  endLine: number
}

/**
 * Per-line geometry entry for the 3D viewport. Stored in vectors.json as Array<LineVector | null>
 * indexed by line number — null when a line has no geometry.
 * Arc entries carry raw parameters (I/J/CW); tessellation is performed client-side.
 * s: index into the job's toolSections array.
 */
export type LineVector =
  | { t: 'R' | 'F'; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; s: number }
  | { t: 'A'; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; i: number; j: number; cw: boolean; s: number }

/** Persisted analysis result stored alongside the GCode file. */
export interface JobAnalysis {
  version: 1
  fileId: string
  filename: string
  analyzedAt: number
  totalLines: number
  estimatedTotalMs: number
  axisRanges: AxisRanges
  tools: ToolSection[]
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
  | 'analyzing'
  | 'loaded'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'stopping'
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
  /** Line index confirmed executed based on planner drain tracking. Lags behind sendPtr. */
  execPtr: number
  /** Motion commands currently queued in the FluidNC planner (derived from Buf: field). */
  inPlanner: number
  /** Max planner slots, captured from machine idle state on connect. */
  maxPlannerSlots: number
  estimatedTotalMs: number
  /** Wall-clock epoch ms when job started; adjusted on resume. */
  startWallClock: number | null
  axisRanges: AxisRanges | null
  /** 0–100 while status === 'analyzing', otherwise irrelevant. */
  analyzeProgress: number
  /** Tool sections extracted during analysis; null before analysis completes. */
  toolSections: ToolSection[] | null
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
  execPtr: number
  savedAt: number
}
