export interface ProbeConfig {
  wiggleEnabled: boolean
  fastFeedMmPerMin: number
  slowFeedMmPerMin: number
  cycles: number
  averageN: number
}

/**
 * Per-direction probe trigger deviations (mm).
 * Sign convention: deviation = distance between tool-centre position at trigger
 * and the actual stock surface. Positive = trigger fires before centre reaches
 * the surface (normal for all real probes; magnitude ≈ ball_radius − pre_travel).
 * Negative = trigger fires after centre has passed the surface (rare fault condition).
 * Effective correction: edgeMach = rawCentrePos + deviation (+ approach) or − deviation (− approach).
 * zMinus is also used as the Z drop height when laterally approaching stock edges.
 */
export interface ProbeCompensation {
  xPlus: number
  xMinus: number
  yPlus: number
  yMinus: number
  zMinus: number
}

export const DEFAULT_PROBE_COMPENSATION: ProbeCompensation = {
  xPlus: 0,
  xMinus: 0,
  yPlus: 0,
  yMinus: 0,
  zMinus: 0,
}

export const DEFAULT_PROBE_CONFIG: ProbeConfig = {
  wiggleEnabled: true,
  fastFeedMmPerMin: 500,
  slowFeedMmPerMin: 5,
  cycles: 3,
  averageN: 2,
}

export interface CuttingPreset {
  guid: string
  name: string
  material: { category: string; query: string }
  spindleRpm: number
  rampRpm: number
  feedRate: number
  feedPerTooth: number
  plungeFeed: number
  rampFeed: number
  rampAngle: number
  coolant: string
}

export interface ToolHolder {
  guid: string
  description: string
  gaugeLength: number
  segments: Array<{ height: number; lowerDiameter: number; upperDiameter: number }>
}

export interface ToolLibraryEntry {
  id: string
  number: number
  name: string
  type: string
  vendor?: string
  productId?: string
  productLink?: string
  comment?: string

  diameter: number
  shankDiameter?: number
  cornerRadius?: number
  fluteCount?: number
  fluteLength?: number
  shoulderLength?: number
  overallLength?: number
  coolantThrough?: boolean
  rightHanded?: boolean

  lengthOffset?: number
  diameterOffset?: number
  manualToolChange?: boolean
  breakControl?: boolean
  probeConfig?: ProbeConfig
  probeCompensation?: ProbeCompensation
  material?: string

  cuttingPresets?: CuttingPreset[]
  holder?: ToolHolder

  source: 'M' | 'A'
  totalRuntimeMinutes: number
  jobCount: number
  lastUsed?: number
}

export interface RuntimeSession {
  toolNumber: number
  scope: 'M' | 'A'
  machineId: string
  jobFile: string
  startMs: number
  endMs: number
}

export interface ToolLibraryFile {
  version: 1
  tools: ToolLibraryEntry[]
}
