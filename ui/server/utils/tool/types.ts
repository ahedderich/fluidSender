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
