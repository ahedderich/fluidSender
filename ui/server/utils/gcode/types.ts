import type { CommandCategory } from './classifier'
import type { GcodeGeneratorId, GeneratorExtraInfo } from './generator'

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
  | 'program_pause'

export interface GCodeLine {
  index: number
  raw: string
  type: GCodeLineType
  /** True for motion commands that queue into the FluidNC planner (rapid/feed/arc). */
  isMotion: boolean
  category: CommandCategory
  /** Estimated execution time in ms. 0 for non-motion lines. */
  estimatedDurationMs: number
  /** Cumulative estimated duration from line 0 through this line. */
  cumulativeDurationMs: number
  /** Comment text following an M0 on the next line; only set when type === 'program_pause'. */
  pauseComment?: string | null
}

/** A single tool section — all lines from startLine to endLine use toolNumber. */
export interface ToolSection {
  toolNumber: number
  /**
   * The raw GCode command that created this section boundary.
   * null for section 0 (preamble absorbed; no preceding change command).
   */
  toolChangeCmd: string | null
  /**
   * How the boundary was created:
   *   'M6' = T{n} M6 command
   *   'T'  = standalone T{n} command (no M6)
   *   null = first section (preamble absorbed; no preceding change)
   */
  toolChangeType: 'M6' | 'T' | null
  startLine: number
  endLine: number
  lineCount: number
}

/**
 * Per-line geometry entry for the 3D viewport. Stored in vectors.json as Array<LineVector | null>
 * indexed by line number — null when a line has no geometry.
 * Arc entries carry raw parameters (I/J/K/CW/plane); tessellation is performed client-side.
 * s: index into the job's toolSections array.
 */
export type LineVector =
  | { t: 'R' | 'F'; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; s: number }
  | { t: 'A'; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; i: number; j: number; k: number; cw: boolean; plane: 'G17' | 'G18' | 'G19'; s: number }

/** Persisted analysis result stored alongside the GCode file.
 *  version 5: lines.json switched to the compact CompactGCodeLine wire format
 *  (see lineCodec.ts) and lines-text.json was dropped — the version bump makes
 *  loadCachedAnalysis()'s existing gate auto-invalidate any pre-existing v4
 *  artefacts instead of misreading them under the new schema. */
export interface JobAnalysis {
  version: 5
  fileId: string
  filename: string
  analyzedAt: number
  totalLines: number
  estimatedTotalMs: number
  axisRanges: AxisRanges
  tools: ToolSection[]
  noToolDefinitions: boolean
  generator: GcodeGeneratorId
  generatorInfo: GeneratorExtraInfo
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
  motionMode: 'G0' | 'G1' | 'G2' | 'G3'
  toolNumber: number
}

/**
 * A modal-state snapshot after a given source line executed. analyzeGCode() emits
 * one of these every `modalCheckpointInterval` lines (default 1 = every line, dense)
 * rather than a plain positional array, so a sparse checkpoint file (interval > 1)
 * and a dense one share the same shape — lookups always resolve via lineIndex,
 * never by array position.
 */
export interface ModalStateCheckpoint {
  lineIndex: number
  state: GCodeModalState
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
  /** Stopped at a T{n}/M6 boundary; jogging and macros are enabled. */
  | 'tool_change'
  /** Machine is in Hold:0 due to M0; jogging and macros are disabled. */
  | 'program_pause'

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
  /** Wall-clock epoch ms when the current running segment started; null whenever status !== 'running'. */
  startWallClock: number | null
  /** Active runtime accumulated across the job so far, excluding paused/tool-change/program-pause
   *  time. Live elapsed = accumulatedRunMs + (status === 'running' ? now - startWallClock : 0). */
  accumulatedRunMs: number
  axisRanges: AxisRanges | null
  /** 0–100 while status === 'analyzing', otherwise irrelevant. */
  analyzeProgress: number
  /** Tool sections extracted during analysis; null before analysis completes. */
  toolSections: ToolSection[] | null
  /** Detected CAM generator for the loaded file; null before analysis completes. */
  generator: GcodeGeneratorId | null
  /** Generator-specific extra tool data extracted during analysis; null before analysis completes. */
  generatorInfo: GeneratorExtraInfo | null
  recovery: {
    available: boolean
    checkpointPtr: number
    resumePtr: number
    modalStateAtResume: GCodeModalState | null
  } | null
  errorMessage: string | null

  toolChangeRequest: {
    sectionIndex: number
    toolNumber: number
    toolChangeType: 'M6' | 'T'
    macroRunning: boolean
    macroError: string | null
  } | null

  programPause: {
    comment: string | null
  } | null

  /** Per-job tool library preference when a tool number exists in both scopes. */
  toolPreferences: Record<number, 'M' | 'A'>
  ambiguousTools: number[]
  transformMode: TransformMode
}

export interface JobCheckpoint {
  version: 2
  fileId: string
  filename: string
  execPtr: number
  savedAt: number
  transformMode: TransformMode
  /** Active runtime accumulated up to this checkpoint. Optional for backward compatibility
   *  with checkpoints written before this field existed — treat missing as 0. */
  accumulatedRunMs?: number
}

export type TransformMode = 'none' | 'rotated' | 'height_adjusted' | 'rotated_height_adjusted'

export function modeFromFlags(rotation: boolean, heightmap: boolean): TransformMode {
  if (rotation && heightmap) return 'rotated_height_adjusted'
  if (rotation) return 'rotated'
  if (heightmap) return 'height_adjusted'
  return 'none'
}

export function subdirForMode(mode: TransformMode): string | null {
  return mode === 'none' ? null : mode
}
