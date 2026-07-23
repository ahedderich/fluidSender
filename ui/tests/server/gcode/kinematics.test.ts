import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MACHINE_KINEMATICS,
  computeKinematicDurations,
  limitRateByAxisMaximum,
  limitAccelByAxisMaximum,
  resolveMachineKinematics,
  fingerprintKinematics,
} from '../../../server/utils/gcode/kinematics'
import type { KinematicSegment, MachineKinematics } from '../../../server/utils/gcode/kinematics'

type Vec3 = readonly [number, number, number]

describe('limitRateByAxisMaximum / limitAccelByAxisMaximum', () => {
  // 3-4-5 direction so the components are exact: (0.6, 0.8, 0)
  const dir: Vec3 = [0.6, 0.8, 0]
  const k: MachineKinematics = {
    x: { maxRateMmPerMin: 6000, accelerationMmPerSec2: 100 },
    y: { maxRateMmPerMin: 4000, accelerationMmPerSec2: 50 },
    z: { maxRateMmPerMin: 6000, accelerationMmPerSec2: 100 },
    junctionDeviationMm: 0.01,
  }

  it('projects rate onto the axis that would hit its own limit first', () => {
    // x allows 6000/0.6=10000mm/min in this direction, y allows 4000/0.8=5000mm/min — y binds.
    expect(limitRateByAxisMaximum(dir, k)).toBeCloseTo(5000, 6)
  })

  it('projects acceleration onto the axis that would hit its own limit first', () => {
    // x allows 100/0.6=166.67mm/s^2, y allows 50/0.8=62.5mm/s^2 — y binds. Result is mm/min^2.
    expect(limitAccelByAxisMaximum(dir, k)).toBeCloseTo(62.5 * 3600, 3)
  })

  it('reduces to the pure-axis value along a single axis', () => {
    expect(limitRateByAxisMaximum([1, 0, 0], k)).toBeCloseTo(k.x.maxRateMmPerMin, 6)
    expect(limitAccelByAxisMaximum([1, 0, 0], k)).toBeCloseTo(k.x.accelerationMmPerSec2 * 3600, 6)
  })
})

describe('resolveMachineKinematics', () => {
  it('falls back to DEFAULT_MACHINE_KINEMATICS entirely when no config is given', () => {
    expect(resolveMachineKinematics(undefined)).toEqual(DEFAULT_MACHINE_KINEMATICS)
    expect(resolveMachineKinematics(null)).toEqual(DEFAULT_MACHINE_KINEMATICS)
  })

  it('reads real firmware field names and falls back per-field, not all-or-nothing', () => {
    const k = resolveMachineKinematics({
      axes: {
        x: { max_rate_mm_per_min: 5000, acceleration_mm_per_sec2: 200 },
        y: { max_rate_mm_per_min: 5000 }, // acceleration missing -> default
      },
      junction_deviation_mm: 0.02,
    })
    expect(k.x).toEqual({ maxRateMmPerMin: 5000, accelerationMmPerSec2: 200 })
    expect(k.y).toEqual({ maxRateMmPerMin: 5000, accelerationMmPerSec2: DEFAULT_MACHINE_KINEMATICS.y.accelerationMmPerSec2 })
    expect(k.z).toEqual(DEFAULT_MACHINE_KINEMATICS.z)
    expect(k.junctionDeviationMm).toBe(0.02)
  })
})

describe('fingerprintKinematics', () => {
  it('differs when any field differs, and matches for identical values', () => {
    const a = resolveMachineKinematics({ junction_deviation_mm: 0.01 })
    const b = resolveMachineKinematics({ junction_deviation_mm: 0.02 })
    expect(fingerprintKinematics(a)).not.toBe(fingerprintKinematics(b))
    expect(fingerprintKinematics(DEFAULT_MACHINE_KINEMATICS)).toBe(fingerprintKinematics(resolveMachineKinematics(undefined)))
  })
})

describe('computeKinematicDurations', () => {
  // Round numbers chosen so the trapezoid/triangle formulas resolve exactly by hand:
  // accel = 100mm/s^2 = 360000mm/min^2, nominal = 6000mm/min.
  const ACCEL_MM_PER_MIN2 = 360_000
  const NOMINAL = 6000

  function seg(lengthMm: number, opts: Partial<KinematicSegment> = {}): KinematicSegment {
    const dir: Vec3 = opts.dirIn ?? [1, 0, 0]
    return {
      lengthMm,
      nominalSpeedMmPerMin: NOMINAL,
      accelMmPerMin2: ACCEL_MM_PER_MIN2,
      dirIn: dir,
      dirOut: opts.dirOut ?? dir,
      hardStopBefore: opts.hardStopBefore ?? false,
    }
  }

  it('a short segment produces a triangle profile that never reaches nominal speed', () => {
    // peak^2 = accel*L = 360000*25 = 9,000,000 -> peak = 3000mm/min (< nominal 6000, confirms triangle).
    // t = 2 * peak/accel = 2 * 3000/360000 min = 1/60 min = 1000ms.
    const [ms] = computeKinematicDurations([seg(25)], DEFAULT_MACHINE_KINEMATICS)
    expect(ms).toBeCloseTo(1000, 3)
  })

  it('a longer segment reaches nominal speed (trapezoid, zero-cruise boundary case)', () => {
    // Distance to accelerate 0->6000 and decelerate 6000->0 is 50mm each = 100mm = L exactly,
    // so cruise distance is 0. t = 2 * nominal/accel = 2 * 6000/360000 min = 2000ms.
    const [ms] = computeKinematicDurations([seg(100)], DEFAULT_MACHINE_KINEMATICS)
    expect(ms).toBeCloseTo(2000, 3)
  })

  it('collinear segments flow through the junction with no cornering loss', () => {
    // Same physics as one 250mm segment: accel/decel = 50mm each, cruise = 150mm.
    // t = 2*(6000/360000) + 150/6000 min = (1/60 + 1/60 + 0.025) min = 3500ms.
    const durations = computeKinematicDurations([seg(100), seg(150)], DEFAULT_MACHINE_KINEMATICS)
    expect(durations[0]! + durations[1]!).toBeCloseTo(3500, 3)
  })

  it('a hard stop forces each side to start/end from rest independently', () => {
    // Same two lengths as above, but now two independent single-segment profiles:
    // 100mm -> 2000ms (boundary case above), 150mm -> accel/decel 50+50=100mm, cruise 50mm,
    // t = 2*(6000/360000) + 50/6000 = (1/60+1/60+0.008333) min = 2500ms. Total 4500ms —
    // 1000ms more than the seamless collinear case, i.e. the hard stop has a real cost.
    const durations = computeKinematicDurations([seg(100), seg(150, { hardStopBefore: true })], DEFAULT_MACHINE_KINEMATICS)
    expect(durations[0]).toBeCloseTo(2000, 3)
    expect(durations[1]).toBeCloseTo(2500, 3)
  })

  it('a sharp corner is slower than the equivalent collinear path', () => {
    const collinear = computeKinematicDurations([seg(300), seg(300)], DEFAULT_MACHINE_KINEMATICS)
    const cornered = computeKinematicDurations(
      [seg(300, { dirIn: [1, 0, 0] }), seg(300, { dirIn: [0, 1, 0], dirOut: [0, 1, 0] })],
      DEFAULT_MACHINE_KINEMATICS,
    )
    expect(cornered[0]! + cornered[1]!).toBeGreaterThan(collinear[0]! + collinear[1]!)
  })

  it('returns an empty result for an empty segment list', () => {
    expect(computeKinematicDurations([], DEFAULT_MACHINE_KINEMATICS).length).toBe(0)
  })
})
