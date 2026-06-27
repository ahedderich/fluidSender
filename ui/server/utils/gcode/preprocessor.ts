import type { AxisRanges, GCodeLine, GCodeLineType } from './types'

const DEFAULT_MAX_RAPID_MM_PER_MIN = 3000

interface PreprocessResult {
  lines: GCodeLine[]
  axisRanges: AxisRanges
}

/** Strip inline comments `(...)` and end-of-line comments `;...` from a raw GCode line. */
function stripComments(raw: string): string {
  return raw.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim()
}

/** Parse a word value like `X-12.5` → -12.5. Returns undefined if word not present. */
function word(clean: string, letter: string): number | undefined {
  const re = new RegExp(`${letter}([+-]?\\d*\\.?\\d+)`, 'i')
  const m = re.exec(clean)
  return m ? parseFloat(m[1]) : undefined
}

/** Euclidean 3-axis distance. */
function dist3(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Convert an R-word arc radius to I/J center offsets.
 * Follows GRBL/FluidNC convention: positive R = minor arc (<180°), negative R = major arc.
 * Condition CCW XOR R<0 controls which side of the chord the center lands on.
 */
function rToIJ(
  sx: number, sy: number,
  ex: number, ey: number,
  r: number, ccw: boolean,
): { i: number; j: number } {
  const dx = ex - sx
  const dy = ey - sy
  const chord = Math.sqrt(dx * dx + dy * dy)
  if (chord < 1e-6) return { i: r, j: 0 } // degenerate: full circle, arbitrary start
  let h = -Math.sqrt(Math.max(0, 4 * r * r - chord * chord)) / chord
  if (ccw !== r < 0) h = -h  // CCW XOR R<0 → negate
  return { i: 0.5 * (dx - dy * h), j: 0.5 * (dy + dx * h) }
}

/** Approximate arc length from I/J center offsets or R radius. */
function arcLength(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  i: number | undefined,
  j: number | undefined,
  r: number | undefined,
  clockwise: boolean,
): number {
  let radius: number
  if (r !== undefined) {
    radius = Math.abs(r)
  } else {
    const cx = startX + (i ?? 0)
    const cy = startY + (j ?? 0)
    radius = Math.sqrt((startX - cx) ** 2 + (startY - cy) ** 2)
  }
  if (radius < 0.0001) return dist3(startX, startY, 0, endX, endY, 0)

  // chord half-angle → arc angle
  const chord = dist3(startX, startY, 0, endX, endY, 0)
  const halfAngle = Math.asin(Math.min(chord / (2 * radius), 1))
  let angle = 2 * halfAngle

  // If start ≈ end (full circle) use 2π
  if (chord < 0.0001) angle = 2 * Math.PI

  // For large-arc (> 180°) the chord formula gives the minor arc; use the reflex
  if (r !== undefined && r < 0) angle = 2 * Math.PI - angle

  return radius * angle
}

export function preprocessGCode(
  content: string,
  maxRapidMmPerMin: number = DEFAULT_MAX_RAPID_MM_PER_MIN,
): PreprocessResult {
  const rawLines = content.split(/\r?\n/)

  // Modal state tracked during preprocessing
  let posMode: 'G90' | 'G91' = 'G90'
  let units: 'G20' | 'G21' = 'G21' // mm by default
  let feedRate = 0
  let curX = 0
  let curY = 0
  let curZ = 0

  const axisRanges: AxisRanges = {
    x: { min: Infinity, max: -Infinity },
    y: { min: Infinity, max: -Infinity },
    z: { min: Infinity, max: -Infinity },
  }

  function updateAxisRanges(x: number, y: number, z: number) {
    axisRanges.x.min = Math.min(axisRanges.x.min, x)
    axisRanges.x.max = Math.max(axisRanges.x.max, x)
    axisRanges.y.min = Math.min(axisRanges.y.min, y)
    axisRanges.y.max = Math.max(axisRanges.y.max, y)
    axisRanges.z.min = Math.min(axisRanges.z.min, z)
    axisRanges.z.max = Math.max(axisRanges.z.max, z)
  }

  function resolveTarget(
    clean: string,
  ): { tx: number; ty: number; tz: number } {
    const xw = word(clean, 'X')
    const yw = word(clean, 'Y')
    const zw = word(clean, 'Z')
    if (posMode === 'G91') {
      return {
        tx: curX + (xw ?? 0),
        ty: curY + (yw ?? 0),
        tz: curZ + (zw ?? 0),
      }
    }
    return {
      tx: xw ?? curX,
      ty: yw ?? curY,
      tz: zw ?? curZ,
    }
  }

  let cumulativeMs = 0
  const lines: GCodeLine[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]
    const clean = stripComments(raw).toUpperCase()

    if (!clean) {
      lines.push({ index: i, raw, type: 'comment', isMotion: false, estimatedDurationMs: 0, cumulativeDurationMs: cumulativeMs })
      continue
    }

    // Update feed rate if present on this line
    const fWord = word(clean, 'F')
    if (fWord !== undefined) feedRate = fWord

    // Detect unit mode
    if (/\bG20\b/.test(clean)) units = 'G20'
    if (/\bG21\b/.test(clean)) units = 'G21'

    // Detect position mode
    if (/\bG90\b/.test(clean)) posMode = 'G90'
    if (/\bG91\b/.test(clean)) posMode = 'G91'

    let type: GCodeLineType = 'modal'
    let durationMs = 0

    // Normalize distance/feedrate: always work in mm internally.
    // G20 coords and F-words are in inches; multiply by 25.4 to convert.
    const toMm = units === 'G20' ? 25.4 : 1

    let toPos: [number, number, number] | undefined

    // Rapid move (G0)
    if (/\bG0\b/.test(clean) || /\bG00\b/.test(clean)) {
      const { tx, ty, tz } = resolveTarget(clean)
      const d = dist3(curX, curY, curZ, tx, ty, tz) * toMm
      durationMs = (d / maxRapidMmPerMin) * 60_000
      updateAxisRanges(tx, ty, tz)
      toPos = [tx, ty, tz]
      curX = tx; curY = ty; curZ = tz
      type = 'rapid'
    }
    // Feed move (G1)
    else if (/\bG1\b/.test(clean) || /\bG01\b/.test(clean)) {
      const { tx, ty, tz } = resolveTarget(clean)
      const feedMmPerMin = feedRate * toMm
      if (feedMmPerMin > 0) {
        const d = dist3(curX, curY, curZ, tx, ty, tz) * toMm
        durationMs = (d / feedMmPerMin) * 60_000
      }
      updateAxisRanges(tx, ty, tz)
      toPos = [tx, ty, tz]
      curX = tx; curY = ty; curZ = tz
      type = 'feed'
    }
    // Arc moves (G2 / G3)
    else if (/\bG0?[23]\b/.test(clean)) {
      const cw = /\bG0?2\b/.test(clean)
      const { tx, ty, tz } = resolveTarget(clean)
      const iw = word(clean, 'I')
      const jw = word(clean, 'J')
      const rw = word(clean, 'R')
      const len = arcLength(curX, curY, tx, ty, iw, jw, rw, cw) * toMm
      const totalLen = Math.sqrt(len * len + ((tz - curZ) * toMm) ** 2)
      const feedMmPerMin = feedRate * toMm
      if (feedMmPerMin > 0) durationMs = (totalLen / feedMmPerMin) * 60_000
      if (durationMs === 0) durationMs = 1
      updateAxisRanges(tx, ty, tz)
      toPos = [tx, ty, tz]
      // Resolve center offsets for tessellation in the same units as the position words.
      const arcIJ = rw !== undefined && iw === undefined && jw === undefined
        ? rToIJ(curX, curY, tx, ty, rw, !cw)
        : { i: iw ?? 0, j: jw ?? 0 }
      curX = tx; curY = ty; curZ = tz
      cumulativeMs += durationMs
      lines.push({ index: i, raw, type: 'arc', isMotion: true, estimatedDurationMs: durationMs,
        cumulativeDurationMs: cumulativeMs, toPos, arcI: arcIJ.i, arcJ: arcIJ.j, arcCw: cw })
      continue
    }
    // Dwell (G4)
    else if (/\bG0?4\b/.test(clean)) {
      const pSec = word(clean, 'P')
      // FluidNC G4 P is in seconds (GRBL convention)
      durationMs = pSec !== undefined ? pSec * 1000 : 0
      type = 'dwell'
    }
    // G28 / G30 — move to stored position (queues to planner; target unknown so duration = 0)
    else if (/\bG28\b/.test(clean) || /\bG30\b/.test(clean)) {
      type = 'rapid'
    }
    // G38.x probe — Category B2: drains planner, then blocks until probe completes.
    // ok arrives only after probe finishes, so isMotion must be false (no persistent planner slot).
    else if (/\bG38\.[2-5]\b/.test(clean)) {
      type = 'probe'
    }
    // Canned cycles — unsupported, warn
    else if (/\bG[78]\d\b/.test(clean)) {
      type = 'unsupported'
      console.warn(`[preprocessor] Canned cycle on line ${i + 1}: "${raw.trim()}" — duration estimated as 0`)
    }
    // Spindle
    else if (/\bM0?[345]\b/.test(clean)) {
      type = 'spindle'
    }
    // Coolant
    else if (/\bM0?[789]\b/.test(clean)) {
      type = 'coolant'
    }
    // Tool change
    else if (/\bM0?6\b/.test(clean) || /\bT\d/.test(clean)) {
      type = 'tool'
    }
    // Work coordinate / offset commands
    else if (/\bG5[4-9]\b/.test(clean) || /\bG10\b/.test(clean) || /\bG92\b/.test(clean)) {
      type = 'coord'
    }

    // Non-motion GCode commands cost at least 1ms (controller overhead).
    // Blank/comment lines are excluded by the `continue` above so no type guard needed.
    if (durationMs === 0) durationMs = 1

    // G4 dwell and G38.x probe drain the planner but never queue persistent blocks;
    // they are interpreter-blocking (Category B2) so isMotion must be false.
    const isMotion = type === 'rapid' || type === 'feed'
    cumulativeMs += durationMs
    lines.push({ index: i, raw, type, isMotion, estimatedDurationMs: durationMs, cumulativeDurationMs: cumulativeMs, toPos })
  }

  // Clamp axis ranges to 0 if no motion found
  if (!isFinite(axisRanges.x.min)) axisRanges.x = { min: 0, max: 0 }
  if (!isFinite(axisRanges.y.min)) axisRanges.y = { min: 0, max: 0 }
  if (!isFinite(axisRanges.z.min)) axisRanges.z = { min: 0, max: 0 }

  return { lines, axisRanges }
}
