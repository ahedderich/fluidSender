import type { MagazineApproach, MagazineAutomation, SlotPosition, ToolchangeSpatialConfig, ToolsetterConfig } from '../../../shared/toolchange'

export function buildToolchangePositionSequence(pos: ToolchangeSpatialConfig): string[] {
  return [
    'M5',
    'G49',
    'G90',
    `G53 G0 Z${pos.safeZ.toFixed(4)}`,
    `G53 G0 X${pos.toolchangeX.toFixed(4)} Y${pos.toolchangeY.toFixed(4)}`,
    `G53 G0 Z${pos.toolchangeZ.toFixed(4)}`,
  ]
}

export function buildToolsetterApproachSequence(pos: ToolsetterConfig): string[] {
  return [
    `G53 G0 Z${pos.safeZ.toFixed(4)}`,
    `G53 G0 X${pos.toolsetterX.toFixed(4)} Y${pos.toolsetterY.toFixed(4)}`,
    `G53 G0 Z${pos.toolsetterApproachZ.toFixed(4)}`,
  ]
}

/** The parked/retracted position at the near end of the approach leg — offset from `slot`
 *  by `distance` opposite `direction` along `axis`. This is where the machine sits just
 *  before/after the seat move, and where it retreats back to once the grip/release
 *  command has fired. */
function magazineParkedPosition(slot: SlotPosition, approach: MagazineApproach): SlotPosition {
  const offset = approach.direction * approach.distance
  return {
    x: slot.x - (approach.axis === 'x' ? offset : 0),
    y: slot.y - (approach.axis === 'y' ? offset : 0),
    z: slot.z - (approach.axis === 'z' ? offset : 0),
  }
}

function axisValue(pos: SlotPosition, axis: MagazineApproach['axis']): number {
  return axis === 'x' ? pos.x : axis === 'y' ? pos.y : pos.z
}

/** One pick/place leg at a single magazine slot: retract to safe Z, travel to the slot's
 *  parked/approach point, seat into the slot at a controlled feed, fire `actionCommand`
 *  (grip to pick up a tool, release to put one down), then retreat back out to safe Z.
 *  Shared by both `fixed` (per-slot position) and `moving` (single load/unload position,
 *  reused for every slot once the carousel has indexed) automation. */
export function buildMagazineLegSequence(
  slot: SlotPosition,
  approach: MagazineApproach,
  safeZ: number,
  seatFeedMmPerMin: number,
  actionCommand: string,
): string[] {
  const parked = magazineParkedPosition(slot, approach)
  const axisLetter = approach.axis.toUpperCase()
  const lines = [
    'M5',
    'G49',
    'G90',
    `G53 G0 Z${safeZ.toFixed(4)}`,
    `G53 G0 X${parked.x.toFixed(4)} Y${parked.y.toFixed(4)}`,
    `G53 G0 Z${parked.z.toFixed(4)}`,
    `G53 G1 F${seatFeedMmPerMin.toFixed(4)} ${axisLetter}${axisValue(slot, approach.axis).toFixed(4)}`,
  ]
  if (actionCommand.trim()) lines.push(actionCommand.trim())
  lines.push(
    `G53 G0 ${axisLetter}${axisValue(parked, approach.axis).toFixed(4)}`,
    `G53 G0 Z${safeZ.toFixed(4)}`,
  )
  return lines
}

/** Full atc-managed toolchange sequence: unload the current tool back into its slot (skipped
 *  when `fromSlot` is null — nothing loaded yet), load the next tool from its slot, then sync
 *  FluidNC's own `gc_state.tool` with a final T{n} M6 (harmless bookkeeping — no macro is
 *  configured for atc-managed, so this never triggers hardware on its own). Slot numbers are
 *  always used for `moving`'s carousel-indexing M6 calls, independent of the strategy-level
 *  `translateToolNumberToSlot` setting (which only concerns atc-passthrough/atc-rapidchange's
 *  passthrough of the file's own M6 line). */
export function buildMagazineToolchangeSequence(
  automation: MagazineAutomation,
  opts: { fromSlot: number | null; toSlot: number; toToolNumber: number },
): string[] {
  const lines: string[] = []

  if (automation.type === 'fixed') {
    if (opts.fromSlot !== null) {
      const fromPos = automation.slots[opts.fromSlot - 1]
      if (fromPos) lines.push(...buildMagazineLegSequence(fromPos, automation.approach, automation.safeZ, automation.seatFeedMmPerMin, automation.releaseCommand))
    }
    const toPos = automation.slots[opts.toSlot - 1]
    if (toPos) lines.push(...buildMagazineLegSequence(toPos, automation.approach, automation.safeZ, automation.seatFeedMmPerMin, automation.gripCommand))
  } else {
    const exchangePos: SlotPosition = {
      x: automation.loadPosition.toolchangeX,
      y: automation.loadPosition.toolchangeY,
      z: automation.loadPosition.toolchangeZ,
    }
    if (opts.fromSlot !== null) {
      lines.push(`T${opts.fromSlot} M6`)
      lines.push(...buildMagazineLegSequence(exchangePos, automation.approach, automation.loadPosition.safeZ, automation.seatFeedMmPerMin, automation.releaseCommand))
    }
    lines.push(`T${opts.toSlot} M6`)
    lines.push(...buildMagazineLegSequence(exchangePos, automation.approach, automation.loadPosition.safeZ, automation.seatFeedMmPerMin, automation.gripCommand))
  }

  lines.push(`T${opts.toToolNumber} M6`)
  return lines
}
