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
  /** Machine-Z position of the tool-setter's trigger point when the zero-reference
   *  tool is loaded — every probe's offset is measured relative to this. Persisted
   *  because G43.1 (and any session-only baseline) resets on every FluidNC reboot,
   *  but this constant only changes if the tool-setter itself moves. */
  tolBaseline: number
}

export interface MagazineConfig {
  enabled: boolean
  size: number
}

export type ToolchangeConfig =
  | { strategy: 'manual-basic' }
  | { strategy: 'manual-toolsetter'; position: ToolsetterConfig; confirmMissingOffset?: boolean }
  | {
      strategy: 'atc-passthrough'
      magazine: MagazineConfig
      magazineSlots: (number | null)[]
      confirmMissingOffset?: boolean
    }
  | {
      strategy: 'atc-managed'
      macro: string
      magazine: MagazineConfig
      magazineSlots: (number | null)[]
      confirmMissingOffset?: boolean
    }
  | {
      strategy: 'custom-macro'
      macro: string
      magazine: MagazineConfig
      magazineSlots: (number | null)[]
      confirmMissingOffset?: boolean
    }
