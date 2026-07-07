/** Parse a word value like `X-12.5` → -12.5. Returns undefined if word not present. */
export function word(clean: string, letter: string): number | undefined {
  const re = new RegExp(`${letter}([+-]?\\d*\\.?\\d+)`, 'i')
  const m = re.exec(clean)
  return m ? parseFloat(m[1]!) : undefined
}

/** Strip inline comments `(...)` and end-of-line comments `;...` for internal parsing. Never modifies the original line. */
export function stripComments(raw: string): string {
  return raw.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim()
}

/** Euclidean 3-axis distance. */
export function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
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
export function rToIJ(
  sx: number, sy: number,
  ex: number, ey: number,
  r: number, ccw: boolean,
): { i: number; j: number } {
  const dx = ex - sx
  const dy = ey - sy
  const chord = Math.sqrt(dx * dx + dy * dy)
  if (chord < 1e-6) return { i: r, j: 0 }
  let h = -Math.sqrt(Math.max(0, 4 * r * r - chord * chord)) / chord
  if (ccw !== r < 0) h = -h
  return { i: 0.5 * (dx - dy * h), j: 0.5 * (dy + dx * h) }
}

/** Compute arc length from I/J center offsets or R radius. */
export function arcLength(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  i: number | undefined,
  j: number | undefined,
  r: number | undefined,
  clockwise: boolean,
): number {
  if (r !== undefined) {
    // R-format: positive R = minor arc (<180°), negative R = major arc (>180°)
    const radius = Math.abs(r)
    if (radius < 0.0001) return dist3(startX, startY, 0, endX, endY, 0)
    const chord = dist3(startX, startY, 0, endX, endY, 0)
    if (chord < 0.0001) return 2 * Math.PI * radius
    const halfAngle = Math.asin(Math.min(chord / (2 * radius), 1))
    return radius * (r < 0 ? 2 * Math.PI - 2 * halfAngle : 2 * halfAngle)
  }
  // I/J format: derive exact sweep angle via atan2 (handles arcs > 180° correctly)
  const cx = startX + (i ?? 0)
  const cy = startY + (j ?? 0)
  const radius = Math.sqrt((startX - cx) ** 2 + (startY - cy) ** 2)
  if (radius < 0.0001) return dist3(startX, startY, 0, endX, endY, 0)
  const chord = dist3(startX, startY, 0, endX, endY, 0)
  if (chord < 0.0001) return 2 * Math.PI * radius
  const startAngle = Math.atan2(startY - cy, startX - cx)
  const endAngle = Math.atan2(endY - cy, endX - cx)
  let sweep: number
  if (clockwise) {
    sweep = startAngle - endAngle
    if (sweep <= 0) sweep += 2 * Math.PI
  } else {
    sweep = endAngle - startAngle
    if (sweep <= 0) sweep += 2 * Math.PI
  }
  return radius * sweep
}
