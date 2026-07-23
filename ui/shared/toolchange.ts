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

export interface SlotPosition {
  x: number
  y: number
  z: number
}

export interface MagazineApproach {
  /** Pick/place leg axis. X/Y describe a lateral approach (e.g. a front- or side-loaded
   *  rack), on top of the standard safe-travel descent to slot height. Z describes a
   *  purely vertical approach (e.g. a top-loaded rack) — extra travel along Z, beyond
   *  the slot's own height, to seat/unseat the tool. */
  axis: 'x' | 'y' | 'z'
  /** Direction of travel along `axis` to seat a tool into its slot. */
  direction: 1 | -1
  /** mm of travel for the pick/place leg. */
  distance: number
}

/** Physical ATC automation description for `atc-managed`. This is meant to fully define
 *  the toolchange sequence — `atc-managed` has no macro escape hatch (use `custom-macro`
 *  for that). Not yet consumed by any runtime GCode generation — pending that engine,
 *  `atc-managed` currently just falls back to the manual swap-confirm dialog. */
export type MagazineAutomation =
  | {
      type: 'fixed'
      gripCommand: string
      releaseCommand: string
      /** Safe travel height for XY moves between the work area and a slot's approach point —
       *  `fixed` has no other position field to derive this from (unlike `moving`, which reuses
       *  `loadPosition.safeZ`). */
      safeZ: number
      slots: SlotPosition[]
      approach: MagazineApproach
      /** Feed rate for the seat/unseat leg (the `G1` move that engages or disengages the slot
       *  clamp) — this move must be controlled, not rapid. */
      seatFeedMmPerMin: number
    }
  | {
      type: 'moving'
      gripCommand: string
      releaseCommand: string
      loadPosition: ToolchangeSpatialConfig
      /** Same pick/place approach leg as `fixed`, applied at the single load/unload position. */
      approach: MagazineApproach
      /** Same meaning as `fixed`'s field of the same name. */
      seatFeedMmPerMin: number
    }

export interface MagazineConfig {
  enabled: boolean
  size: number
  /** Absent = not configured. Only meaningful today for `atc-managed`. */
  automation?: MagazineAutomation
}

export type ToolchangeStrategy =
  | { strategy: 'manual-basic' }
  | { strategy: 'manual-toolsetter'; position: ToolsetterConfig; confirmMissingOffset?: boolean }
  | {
      strategy: 'atc-passthrough'
      confirmMissingOffset?: boolean
      toolsetter?: ToolsetterConfig
      /** When true, the tool library number in M6 Tn is translated to the tool's assigned
       *  magazine slot number before the command reaches the machine (e.g. M6 T28 becomes
       *  M6 T4 if T28 is loaded in slot 4). When false, Tn is forwarded unchanged. */
      translateToolNumberToSlot: boolean
    }
  | {
      strategy: 'atc-managed'
      confirmMissingOffset?: boolean
      toolsetter?: ToolsetterConfig
      /** Same translation as `atc-passthrough`'s field of the same name. */
      translateToolNumberToSlot: boolean
    }
  | {
      strategy: 'atc-rapidchange'
      confirmMissingOffset?: boolean
      toolsetter?: ToolsetterConfig
      /** Same translation as `atc-passthrough`'s field of the same name. */
      translateToolNumberToSlot: boolean
    }
  | { strategy: 'custom-macro'; macro: string; confirmMissingOffset?: boolean }

export type ToolchangeConfig = ToolchangeStrategy & {
  magazine: MagazineConfig
  magazineSlots: (number | null)[]
}

export const DEFAULT_TOOLCHANGE_CONFIG: ToolchangeConfig = {
  strategy: 'manual-basic',
  magazine: { enabled: false, size: 4 },
  magazineSlots: [],
}
