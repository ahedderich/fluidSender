import { describe, it, expect } from 'vitest'
import {
  buildMagazineLegSequence,
  buildMagazineToolchangeSequence,
} from '../../../server/utils/gcode/toolchangeSequences'
import type { MagazineApproach, MagazineAutomation } from '../../../shared/toolchange'

// ── buildMagazineLegSequence ────────────────────────────────────────────────

describe('buildMagazineLegSequence', () => {
  it('front-loaded rack (axis X, +50mm seat) parks out, descends, seats, then retreats', () => {
    const slot = { x: 100, y: 20, z: -50 }
    const approach: MagazineApproach = { axis: 'x', direction: 1, distance: 50 }
    const lines = buildMagazineLegSequence(slot, approach, /* safeZ */ -10, /* seatFeed */ 200, 'M63')

    expect(lines).toEqual([
      'M5',
      'G49',
      'G90',
      'G53 G0 Z-10.0000',
      'G53 G0 X50.0000 Y20.0000', // parked 50mm out along -X from the slot
      'G53 G0 Z-50.0000', // descend to slot Z while still parked
      'G53 G1 F200.0000 X100.0000', // seat: travel +50mm to reach the slot's X
      'M63',
      'G53 G0 X50.0000', // retreat back out along -X
      'G53 G0 Z-10.0000',
    ])
  })

  it('top-loaded rack (axis Z) only varies the Z leg, XY stays over the slot throughout', () => {
    const slot = { x: 5, y: 5, z: -80 }
    const approach: MagazineApproach = { axis: 'z', direction: -1, distance: 20 }
    const lines = buildMagazineLegSequence(slot, approach, -10, 150, 'M62')

    expect(lines).toEqual([
      'M5',
      'G49',
      'G90',
      'G53 G0 Z-10.0000',
      'G53 G0 X5.0000 Y5.0000',
      'G53 G0 Z-60.0000', // parked 20mm above the slot (direction -1 => slot.z - (-1*20))
      'G53 G1 F150.0000 Z-80.0000',
      'M62',
      'G53 G0 Z-60.0000',
      'G53 G0 Z-10.0000',
    ])
  })

  it('omits the action command line when it is blank', () => {
    const slot = { x: 0, y: 0, z: 0 }
    const approach: MagazineApproach = { axis: 'x', direction: 1, distance: 10 }
    const lines = buildMagazineLegSequence(slot, approach, 0, 100, '   ')
    expect(lines.some((l) => l.trim() === '')).toBe(false)
    expect(lines).toHaveLength(9)
  })
})

// ── buildMagazineToolchangeSequence — fixed rack ────────────────────────────

describe('buildMagazineToolchangeSequence (fixed)', () => {
  const automation: Extract<MagazineAutomation, { type: 'fixed' }> = {
    type: 'fixed',
    gripCommand: 'M62',
    releaseCommand: 'M63',
    safeZ: -10,
    slots: [
      { x: 50, y: 0, z: -50 }, // slot 1
      { x: 100, y: 0, z: -50 }, // slot 2
    ],
    approach: { axis: 'x', direction: 1, distance: 20 },
    seatFeedMmPerMin: 200,
  }

  it('unloads the current tool then loads the next, ending with a T{n} M6 sync', () => {
    const lines = buildMagazineToolchangeSequence(automation, { fromSlot: 1, toSlot: 2, toToolNumber: 7 })

    // Unload leg (slot 1) fires the release command, load leg (slot 2) fires grip.
    expect(lines.filter((l) => l === 'M63')).toHaveLength(1)
    expect(lines.filter((l) => l === 'M62')).toHaveLength(1)
    expect(lines.indexOf('M63')).toBeLessThan(lines.indexOf('M62'))
    expect(lines.at(-1)).toBe('T7 M6')
  })

  it('skips the unload leg when nothing was loaded (fromSlot null)', () => {
    const lines = buildMagazineToolchangeSequence(automation, { fromSlot: null, toSlot: 1, toToolNumber: 3 })
    expect(lines).not.toContain('M63')
    expect(lines).toContain('M62')
    expect(lines.at(-1)).toBe('T3 M6')
  })
})

// ── buildMagazineToolchangeSequence — moving carousel ───────────────────────

describe('buildMagazineToolchangeSequence (moving)', () => {
  const automation: Extract<MagazineAutomation, { type: 'moving' }> = {
    type: 'moving',
    gripCommand: 'M62',
    releaseCommand: 'M63',
    loadPosition: { safeZ: -10, toolchangeX: 0, toolchangeY: 0, toolchangeZ: -40 },
    approach: { axis: 'y', direction: 1, distance: 30 },
    seatFeedMmPerMin: 150,
  }

  it('indexes the carousel via T{slot} M6 before each pick/place leg', () => {
    const lines = buildMagazineToolchangeSequence(automation, { fromSlot: 2, toSlot: 5, toToolNumber: 9 })

    expect(lines).toContain('T2 M6') // index to current tool's slot to unload
    expect(lines).toContain('T5 M6') // index to next tool's slot to load
    expect(lines.at(-1)).toBe('T9 M6') // final gc_state.tool sync uses the library number, not the slot
    expect(lines.indexOf('T2 M6')).toBeLessThan(lines.indexOf('T5 M6'))
  })

  it('skips indexing/unloading when nothing was loaded', () => {
    const lines = buildMagazineToolchangeSequence(automation, { fromSlot: null, toSlot: 1, toToolNumber: 4 })
    expect(lines).not.toContain('M63')
    expect(lines[0]).toBe('T1 M6')
  })
})
