export interface ProbeConfig {
  wiggleEnabled: boolean
  fastFeedMmPerMin: number
  slowFeedMmPerMin: number
  cycles: number
  averageN: number
}

export interface ToolchangeSpatialConfig {
  safeZ: number
  toolchangeX: number
  toolchangeY: number
  toolchangeZ: number
}

export interface ToolsetterConfig extends ToolchangeSpatialConfig {
  toolsetterX: number
  toolsetterY: number
  toolsetterApproachZ: number
  probeDistance: number
  probeConfig: ProbeConfig
  zOffset: number
  confirmAfterProbe: boolean
}

export interface MagazineConfig {
  enabled: boolean
  size: number
}

export type ToolchangeConfig =
  | { strategy: 'manual-basic' }
  | { strategy: 'manual-toolsetter'; position: ToolsetterConfig }
  | {
      strategy: 'atc-passthrough'
      magazine: MagazineConfig
      magazineSlots: (number | null)[]
    }
  | {
      strategy: 'atc-managed'
      macro: string
      magazine: MagazineConfig
      magazineSlots: (number | null)[]
    }
  | {
      strategy: 'custom-macro'
      macro: string
      magazine: MagazineConfig
      magazineSlots: (number | null)[]
    }
