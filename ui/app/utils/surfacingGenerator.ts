export interface SurfacingParams {
  shape: 'rect' | 'round'
  width: number
  height: number
  diameter: number
  toolDiameter: number
  toolNumber: number
  toolType: string
  toolName: string
  toolCornerRadius: number
  stepover: number
  depthOfCut: number
  feedrate: number
  spindleSpeed: number
  coolant: 'off' | 'mist' | 'flood'
  pattern: 'linear' | 'spiral'
  rotation: number
}

export interface PassLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

function f(v: number): string {
  return v.toFixed(4)
}

// Clip an infinite parametric line (ox + t*dx, oy + t*dy) to an axis-aligned rectangle.
// Returns the clipped segment endpoints, or null if the line misses the rectangle entirely.
function clipLineToRect(
  ox: number, oy: number,
  dx: number, dy: number,
  xMin: number, xMax: number, yMin: number, yMax: number,
): PassLine | null {
  let tMin = -1e9, tMax = 1e9

  if (Math.abs(dx) > 1e-10) {
    const t1 = (xMin - ox) / dx, t2 = (xMax - ox) / dx
    tMin = Math.max(tMin, Math.min(t1, t2))
    tMax = Math.min(tMax, Math.max(t1, t2))
  } else if (ox < xMin || ox > xMax) {
    return null
  }

  if (Math.abs(dy) > 1e-10) {
    const t1 = (yMin - oy) / dy, t2 = (yMax - oy) / dy
    tMin = Math.max(tMin, Math.min(t1, t2))
    tMax = Math.min(tMax, Math.max(t1, t2))
  } else if (oy < yMin || oy > yMax) {
    return null
  }

  if (tMax < tMin - 1e-10) return null
  return { x1: ox + tMin * dx, y1: oy + tMin * dy, x2: ox + tMax * dx, y2: oy + tMax * dy }
}

export function linearPasses(params: SurfacingParams): PassLine[] {
  const { shape, width, height, diameter, stepover, rotation } = params
  const passes: PassLine[] = []

  if (shape === 'rect') {
    const W = width, H = height
    const theta = rotation * Math.PI / 180

    if (Math.abs(rotation % 360) < 0.001) {
      for (let y = -H / 2; y <= H / 2 + 0.001; y += stepover) {
        passes.push({ x1: -W / 2, y1: y, x2: W / 2, y2: y })
      }
    } else {
      // Pass direction: (cosT, sinT); sweep direction (perp): (-sinT, cosT)
      const cosT = Math.cos(theta), sinT = Math.sin(theta)
      // Half-extent of the rectangle in the sweep direction
      const R = (W / 2) * Math.abs(sinT) + (H / 2) * Math.abs(cosT)
      for (let d = -R; d <= R + 0.001; d += stepover) {
        const ox = d * (-sinT), oy = d * cosT
        const seg = clipLineToRect(ox, oy, cosT, sinT, -W / 2, W / 2, -H / 2, H / 2)
        if (seg) passes.push(seg)
      }
    }
  } else {
    const r = diameter / 2
    for (let y = -r; y <= r + 0.001; y += stepover) {
      const halfX = Math.sqrt(Math.max(0, r * r - y * y))
      if (halfX > 0.001) passes.push({ x1: -halfX, y1: y, x2: halfX, y2: y })
    }
  }

  return passes
}

function linearGCode(params: SurfacingParams): string[] {
  const { depthOfCut, feedrate } = params
  const lines: string[] = []
  const passes = linearPasses(params)
  if (passes.length === 0) return lines

  const first = passes[0]
  lines.push(`G0 X${f(first.x1)} Y${f(first.y1)}`)
  lines.push(`G1 Z${f(-depthOfCut)} F${(feedrate * 0.3).toFixed(1)}`)

  for (let i = 0; i < passes.length; i++) {
    const p = passes[i]
    const rev = i % 2 !== 0
    const sx = rev ? p.x2 : p.x1, sy = rev ? p.y2 : p.y1
    const ex = rev ? p.x1 : p.x2, ey = rev ? p.y1 : p.y2
    if (i === 0) {
      lines.push(`G1 X${f(ex)} Y${f(ey)} F${feedrate}`)
    } else {
      lines.push(`G1 X${f(sx)} Y${f(sy)}`)
      lines.push(`G1 X${f(ex)} Y${f(ey)}`)
    }
  }

  return lines
}

function spiralGCode(params: SurfacingParams): string[] {
  const { shape, width, height, diameter, stepover, depthOfCut, feedrate } = params
  const lines: string[] = []
  const pf = (feedrate * 0.3).toFixed(1)

  if (shape === 'rect') {
    const W = width, H = height
    lines.push(`G0 X0.0000 Y0.0000`)
    lines.push(`G1 Z${f(-depthOfCut)} F${pf}`)

    for (let n = 1; ; n++) {
      const hW = Math.min(n * stepover, W / 2)
      const hH = Math.min(n * stepover, H / 2)
      const done = hW >= W / 2 - 0.001 && hH >= H / 2 - 0.001

      lines.push(`G1 X${f(hW)} Y${f(-hH)}${n === 1 ? ` F${feedrate}` : ''}`)
      lines.push(`G1 X${f(-hW)} Y${f(-hH)}`)
      lines.push(`G1 X${f(-hW)} Y${f(hH)}`)
      lines.push(`G1 X${f(hW)} Y${f(hH)}`)

      if (done) break

      const hW2 = Math.min((n + 1) * stepover, W / 2)
      const hH2 = Math.min((n + 1) * stepover, H / 2)
      lines.push(`G1 X${f(hW)} Y${f(-hH2)}`)
      if (hW2 > hW + 0.001) lines.push(`G1 X${f(hW2)} Y${f(-hH2)}`)
    }
  } else {
    const r = diameter / 2
    const segA = 5 * Math.PI / 180
    const rate = stepover / (2 * Math.PI)
    const tMax = r / rate

    lines.push(`G0 X0.0000 Y0.0000`)
    lines.push(`G1 Z${f(-depthOfCut)} F${pf}`)

    let first = true
    for (let theta = 0; theta <= tMax + segA; theta += segA) {
      const t = Math.min(theta, tMax)
      const rr = rate * t
      const x = rr * Math.cos(t), y = rr * Math.sin(t)
      lines.push(`G1 X${f(x)} Y${f(y)}${first ? ` F${feedrate}` : ''}`)
      first = false
      if (theta >= tMax) break
    }

    // Final cleanup circle
    lines.push(`G1 X${f(r)} Y0.0000`)
    lines.push(`G2 X${f(r)} Y0.0000 I${f(-r)} J0.0000`)
  }

  return lines
}

export function generateSurfacingGCode(params: SurfacingParams): string {
  const {
    toolNumber, toolDiameter, toolCornerRadius, toolType, toolName,
    depthOfCut, feedrate, spindleSpeed, coolant, shape, width, height, diameter, stepover, pattern,
  } = params

  const typeStr = toolName ? `${toolType} - ${toolName}` : toolType
  const dimStr = shape === 'rect' ? `${width}x${height} mm` : `diameter ${diameter} mm`

  return [
    `(Surfacing job - generated by FluidSender)`,
    `(T${toolNumber} D=${toolDiameter} CR=${toolCornerRadius} - ZMIN=-${depthOfCut} - ${typeStr})`,
    `G90 G94`,
    `G17`,
    `G21`,
    `G28 G91 Z0`,
    `G90`,
    `; Stock: ${shape} ${dimStr}`,
    `; Stepover: ${stepover} mm, Feedrate: ${feedrate} mm/min`,
    `; WCS origin assumed at stock center (X0 Y0 = center of stock surface)`,
    ``,
    `G0 Z5.0000`,
    `M3 S${spindleSpeed}`,
    ...(coolant === 'mist' ? ['M7'] : coolant === 'flood' ? ['M8'] : []),
    ...(pattern === 'linear' ? linearGCode(params) : spiralGCode(params)),
    ``,
    `G0 Z5.0000`,
    `M5`,
    `M9`,
    `M2`,
  ].join('\n')
}

export function buildFilename(params: SurfacingParams): string {
  const d = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
  const dims = params.shape === 'rect'
    ? `${params.width}x${params.height}`
    : `d${params.diameter}`
  return `surface_${dims}_${params.pattern}_${d}.nc`
}
