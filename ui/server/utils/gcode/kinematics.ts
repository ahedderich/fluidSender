/**
 * Acceleration- and junction-deviation-aware move duration modelling.
 *
 * Mirrors the exact algorithm FluidNC's own planner uses (verified against
 * `FluidNC/FluidNC/src/Planner.cpp` and `NutsBolts.cpp` in the locally-cloned
 * firmware reference — see CLAUDE.md), not an invented approximation:
 *  - direction-projected per-move acceleration/max-rate (NutsBolts.cpp
 *    `limit_acceleration_by_axis_maximum` / `limit_rate_by_axis_maximum`)
 *  - junction (cornering) speed limit from the angle between consecutive
 *    moves and the machine's junction deviation (Planner.cpp:391-411)
 *  - a reverse+forward entry-speed reconciliation pass per run of moves,
 *    where a run is delimited by anything that drains the planner
 *    (Planner.cpp:130-190, `planner_recalculate`)
 */

type Vec3 = readonly [number, number, number]

export interface AxisKinematics {
  maxRateMmPerMin: number
  accelerationMmPerSec2: number
}

export interface MachineKinematics {
  x: AxisKinematics
  y: AxisKinematics
  z: AxisKinematics
  junctionDeviationMm: number
}

/** A single motion segment (rapid, feed, or arc) as seen by the kinematic solver. */
export interface KinematicSegment {
  lengthMm: number
  /** Commanded feed capped by direction-projected axis max rate (nominalSpeedForSegment). */
  nominalSpeedMmPerMin: number
  /** Direction-projected acceleration limit for this segment (limitAccelByAxisMaximum). */
  accelMmPerMin2: number
  /** Unit direction vector at the start of the segment (tangent, for arcs). */
  dirIn: Vec3
  /** Unit direction vector at the end of the segment (tangent, for arcs). */
  dirOut: Vec3
  /** True if a planner-draining command (spindle/coolant/WCS/dwell/probe/pause/...)
   *  intervened before this segment, forcing it to start from rest. */
  hardStopBefore: boolean
}

// FluidNC's own shipped example config (FluidNC/FluidNC/data/config.yaml) — real,
// citable firmware defaults for when no machine is connected/selected, not invented
// numbers. A freshly-flashed, unconfigured FluidNC effectively behaves like this.
const DEFAULT_AXIS: AxisKinematics = { maxRateMmPerMin: 1000, accelerationMmPerSec2: 25 }
export const DEFAULT_MACHINE_KINEMATICS: MachineKinematics = {
  x: { ...DEFAULT_AXIS },
  y: { ...DEFAULT_AXIS },
  z: { ...DEFAULT_AXIS },
  junctionDeviationMm: 0.01,
}

// FluidNC/Grbl Config.h constants.
const MINIMUM_JUNCTION_SPEED_SQR = 0 // (mm/min)^2
const MINIMUM_FEED_RATE = 1 // mm/min

function resolveAxis(raw: unknown, fallback: AxisKinematics): AxisKinematics {
  const a = raw as Record<string, unknown> | undefined
  const maxRate = typeof a?.max_rate_mm_per_min === 'number' && a.max_rate_mm_per_min > 0 ? a.max_rate_mm_per_min : fallback.maxRateMmPerMin
  const accel = typeof a?.acceleration_mm_per_sec2 === 'number' && a.acceleration_mm_per_sec2 > 0 ? a.acceleration_mm_per_sec2 : fallback.accelerationMmPerSec2
  return { maxRateMmPerMin: maxRate, accelerationMmPerSec2: accel }
}

/**
 * Resolve real per-axis rate/acceleration + junction deviation from a machine's
 * fetched `fluidncConfig` (the raw parsed YAML object stored server-side — see
 * ws.ts `_finishConfigFetch`), falling back field-by-field to
 * DEFAULT_MACHINE_KINEMATICS. Mirrors the existing `axes?.x?.max_travel_mm || 300`
 * fallback pattern used client-side in GCodeViewport.vue.
 */
export function resolveMachineKinematics(fluidncConfig: Record<string, unknown> | null | undefined): MachineKinematics {
  const axes = fluidncConfig?.axes as Record<string, unknown> | undefined
  const jd = fluidncConfig?.junction_deviation_mm
  return {
    x: resolveAxis(axes?.x, DEFAULT_MACHINE_KINEMATICS.x),
    y: resolveAxis(axes?.y, DEFAULT_MACHINE_KINEMATICS.y),
    z: resolveAxis(axes?.z, DEFAULT_MACHINE_KINEMATICS.z),
    junctionDeviationMm: typeof jd === 'number' && jd > 0 ? jd : DEFAULT_MACHINE_KINEMATICS.junctionDeviationMm,
  }
}

/** Stable fingerprint used to invalidate cached analysis when the resolved kinematics change. */
export function fingerprintKinematics(k: MachineKinematics): string {
  return [
    k.x.maxRateMmPerMin, k.x.accelerationMmPerSec2,
    k.y.maxRateMmPerMin, k.y.accelerationMmPerSec2,
    k.z.maxRateMmPerMin, k.z.accelerationMmPerSec2,
    k.junctionDeviationMm,
  ].join(',')
}

function limitByAxisMaximum(dir: Vec3, values: Vec3): number {
  let limit = Infinity
  for (let i = 0; i < 3; i++) {
    const c = dir[i]!
    if (c !== 0) limit = Math.min(limit, values[i]! / Math.abs(c))
  }
  return limit
}

/** Direction-projected max rate — mirrors NutsBolts.cpp `limit_rate_by_axis_maximum`. */
export function limitRateByAxisMaximum(dir: Vec3, k: MachineKinematics): number {
  const limit = limitByAxisMaximum(dir, [k.x.maxRateMmPerMin, k.y.maxRateMmPerMin, k.z.maxRateMmPerMin])
  return Number.isFinite(limit) ? limit : Math.max(k.x.maxRateMmPerMin, k.y.maxRateMmPerMin, k.z.maxRateMmPerMin)
}

/**
 * Direction-projected acceleration, in mm/min^2 — mirrors NutsBolts.cpp
 * `limit_acceleration_by_axis_maximum`, including its mm/sec^2 -> mm/min^2 conversion
 * (`* secPerMinSq`) so it stays unit-consistent with mm/min speeds used everywhere else.
 */
export function limitAccelByAxisMaximum(dir: Vec3, k: MachineKinematics): number {
  const limit = limitByAxisMaximum(dir, [k.x.accelerationMmPerSec2, k.y.accelerationMmPerSec2, k.z.accelerationMmPerSec2])
  const mmPerSec2 = Number.isFinite(limit) ? limit : Math.max(k.x.accelerationMmPerSec2, k.y.accelerationMmPerSec2, k.z.accelerationMmPerSec2)
  return mmPerSec2 * 3600
}

/** Commanded feed capped by direction-projected max rate; pass null for rapids (uses max rate directly). */
export function nominalSpeedForSegment(dir: Vec3, commandedFeedMmPerMin: number | null, k: MachineKinematics): number {
  const maxRate = limitRateByAxisMaximum(dir, k)
  const nominal = commandedFeedMmPerMin === null ? maxRate : Math.min(commandedFeedMmPerMin, maxRate)
  return Math.max(0, nominal)
}

/**
 * Junction (cornering) speed-squared limit between two consecutive segments —
 * Planner.cpp:391-411. `junctionDeltaVec` (the direction the machine must
 * accelerate in to negotiate the corner) is the normalized difference between
 * the two segments' unit vectors, not either segment's own direction.
 */
function junctionSpeedSqr(prevDirOut: Vec3, dirIn: Vec3, k: MachineKinematics): number {
  const cosTheta = -(prevDirOut[0] * dirIn[0] + prevDirOut[1] * dirIn[1] + prevDirOut[2] * dirIn[2])
  if (cosTheta > 0.999999) return MINIMUM_JUNCTION_SPEED_SQR // near-reversal — enforce (near-)stop
  if (cosTheta < -0.999999) return Infinity // straight through — no cornering limit

  const dx = dirIn[0] - prevDirOut[0]
  const dy = dirIn[1] - prevDirOut[1]
  const dz = dirIn[2] - prevDirOut[2]
  const mag = Math.hypot(dx, dy, dz)
  const deltaUnit: Vec3 = mag > 1e-9 ? [dx / mag, dy / mag, dz / mag] : [0, 0, 0]
  const junctionAccel = limitAccelByAxisMaximum(deltaUnit, k)
  const sinThetaD2 = Math.sqrt(0.5 * (1 - cosTheta))
  const raw = (junctionAccel * k.junctionDeviationMm * sinThetaD2) / (1 - sinThetaD2)
  return Math.max(MINIMUM_JUNCTION_SPEED_SQR, raw)
}

function segmentDurationMs(entry: number, exit: number, nominal: number, accelMmPerMin2: number, lengthMm: number): number {
  if (lengthMm <= 0) return 0
  if (nominal < MINIMUM_FEED_RATE || accelMmPerMin2 <= 0) {
    return nominal > 0 ? (lengthMm / nominal) * 60_000 : 0
  }
  // entry/exit are always <= nominal by construction; clamp defensively against float drift.
  const v = Math.max(nominal, entry, exit)
  const dAccel = Math.max(0, (v * v - entry * entry) / (2 * accelMmPerMin2))
  const dDecel = Math.max(0, (v * v - exit * exit) / (2 * accelMmPerMin2))

  let totalMin: number
  if (dAccel + dDecel <= lengthMm) {
    // Trapezoid: reach nominal speed, cruise, decelerate.
    const dCruise = lengthMm - dAccel - dDecel
    totalMin = (v - entry) / accelMmPerMin2 + dCruise / v + (v - exit) / accelMmPerMin2
  } else {
    // Triangle: too short to reach nominal — solve peak speed reachable within lengthMm.
    const peakSqr = Math.max(entry * entry, exit * exit, accelMmPerMin2 * lengthMm + (entry * entry + exit * exit) / 2)
    const peak = Math.sqrt(peakSqr)
    totalMin = (peak - entry) / accelMmPerMin2 + (peak - exit) / accelMmPerMin2
  }
  return Math.max(0, totalMin) * 60_000
}

/** Solve one contiguous run (no hard stops inside) via FluidNC's reverse+forward pass. */
function solveRun(segments: KinematicSegment[], start: number, end: number, k: MachineKinematics, out: Float64Array): void {
  const len = end - start
  if (len <= 0) return

  const maxEntrySqr = new Float64Array(len)
  for (let i = 1; i < len; i++) {
    const prev = segments[start + i - 1]!
    const seg = segments[start + i]!
    const v = Math.min(prev.nominalSpeedMmPerMin, seg.nominalSpeedMmPerMin)
    maxEntrySqr[i] = Math.min(v * v, junctionSpeedSqr(prev.dirOut, seg.dirIn, k))
  }
  // maxEntrySqr[0] stays 0 — a run always starts from rest (either program start or a
  // preceding planner-draining command), matching Planner.cpp:364-368.

  const entrySqr = new Float64Array(len)
  const last = segments[start + len - 1]!
  entrySqr[len - 1] = Math.min(maxEntrySqr[len - 1]!, 2 * last.accelMmPerMin2 * last.lengthMm)
  for (let i = len - 2; i >= 0; i--) {
    const seg = segments[start + i]!
    const candidate = entrySqr[i + 1]! + 2 * seg.accelMmPerMin2 * seg.lengthMm
    entrySqr[i] = Math.min(maxEntrySqr[i]!, candidate)
  }

  for (let i = 0; i < len - 1; i++) {
    const seg = segments[start + i]!
    if (entrySqr[i]! < entrySqr[i + 1]!) {
      const candidate = entrySqr[i]! + 2 * seg.accelMmPerMin2 * seg.lengthMm
      if (candidate < entrySqr[i + 1]!) entrySqr[i + 1] = candidate
    }
  }

  for (let i = 0; i < len; i++) {
    const seg = segments[start + i]!
    const entry = Math.sqrt(Math.max(0, entrySqr[i]!))
    const exit = i < len - 1 ? Math.sqrt(Math.max(0, entrySqr[i + 1]!)) : 0
    out[start + i] = segmentDurationMs(entry, exit, seg.nominalSpeedMmPerMin, seg.accelMmPerMin2, seg.lengthMm)
  }
}

/**
 * Compute a realistic (accel + junction-deviation aware) duration per segment.
 * Segments are split into independent runs at every `hardStopBefore` boundary —
 * each run is solved exactly like a full planner buffer that filled and drained once,
 * which is mathematically equivalent to how the real firmware's incremental
 * reverse/forward recalculation converges for a fully-known sequence of moves.
 */
export function computeKinematicDurations(segments: KinematicSegment[], kinematics: MachineKinematics): Float64Array {
  const n = segments.length
  const durationsMs = new Float64Array(n)
  if (n === 0) return durationsMs

  let runStart = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || segments[i]!.hardStopBefore) {
      solveRun(segments, runStart, i, kinematics, durationsMs)
      runStart = i
    }
  }
  return durationsMs
}
