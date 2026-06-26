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
      lines.push({ index: i, raw, type: 'comment', estimatedDurationMs: 0, cumulativeDurationMs: cumulativeMs })
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

    // Rapid move (G0)
    if (/\bG0\b/.test(clean) || /\bG00\b/.test(clean)) {
      const { tx, ty, tz } = resolveTarget(clean)
      const d = dist3(curX, curY, curZ, tx, ty, tz) * toMm
      durationMs = (d / maxRapidMmPerMin) * 60_000
      updateAxisRanges(tx, ty, tz)
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
      // Add Z component to arc length (helical arc)
      const totalLen = Math.sqrt(len * len + ((tz - curZ) * toMm) ** 2)
      const feedMmPerMin = feedRate * toMm
      if (feedMmPerMin > 0) durationMs = (totalLen / feedMmPerMin) * 60_000
      updateAxisRanges(tx, ty, tz)
      curX = tx; curY = ty; curZ = tz
      type = 'arc'
    }
    // Dwell (G4)
    else if (/\bG0?4\b/.test(clean)) {
      const pSec = word(clean, 'P')
      // FluidNC G4 P is in seconds (GRBL convention)
      durationMs = pSec !== undefined ? pSec * 1000 : 0
      type = 'dwell'
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

    cumulativeMs += durationMs
    lines.push({ index: i, raw, type, estimatedDurationMs: durationMs, cumulativeDurationMs: cumulativeMs })
  }

  // Clamp axis ranges to 0 if no motion found
  if (!isFinite(axisRanges.x.min)) axisRanges.x = { min: 0, max: 0 }
  if (!isFinite(axisRanges.y.min)) axisRanges.y = { min: 0, max: 0 }
  if (!isFinite(axisRanges.z.min)) axisRanges.z = { min: 0, max: 0 }

  return { lines, axisRanges }
}
