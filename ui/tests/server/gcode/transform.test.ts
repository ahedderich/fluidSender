import { describe, it, expect } from 'vitest'
import { applyTransforms } from '../../../server/utils/gcode/transform'
import type { HeightmapResult } from '../../../server/utils/appState'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseXY(line: string): { x: number; y: number } {
  const xm = /X([-\d.]+)/.exec(line)
  const ym = /Y([-\d.]+)/.exec(line)
  return { x: parseFloat(xm?.[1] ?? '0'), y: parseFloat(ym?.[1] ?? '0') }
}

function parseZ(line: string): number {
  const zm = /Z([-\d.]+)/.exec(line)
  return parseFloat(zm?.[1] ?? '0')
}

function near(a: number, b: number, tol = 0.001): boolean {
  return Math.abs(a - b) < tol
}

function assertNear(actual: number, expected: number, tol = 0.001, msg?: string): void {
  expect(near(actual, expected, tol), `${msg ?? ''} expected ${actual} ≈ ${expected} (±${tol})`).toBe(true)
}

const ROT_45 = { rotationDeg: 45, bowMm: 0, edge: 'top' as const }
const ROT_NEG45 = { rotationDeg: -45, bowMm: 0, edge: 'top' as const }

// ── Rotation tests ────────────────────────────────────────────────────────────

describe('rotation transform', () => {
  it('rotates a G1 X/Y move by -angleDeg around origin', () => {
    const alpha = -45 * (Math.PI / 180)
    const cos = Math.cos(alpha)
    const sin = Math.sin(alpha)
    const x = 10, y = 0
    const expectedX = x * cos - y * sin
    const expectedY = x * sin + y * cos

    const out = applyTransforms('G1 X10 Y0 F500', 'rotated', ROT_45, null)
    const { x: rx, y: ry } = parseXY(out)

    assertNear(rx, expectedX, 0.001, 'X')
    assertNear(ry, expectedY, 0.001, 'Y')
  })

  it('rotates a G0 move (X/Y only, Z unchanged)', () => {
    const out = applyTransforms('G0 X5 Y5 Z3', 'rotated', ROT_NEG45, null)
    const alpha = 45 * (Math.PI / 180)
    const expectedX = 5 * Math.cos(alpha) - 5 * Math.sin(alpha)
    const expectedY = 5 * Math.sin(alpha) + 5 * Math.cos(alpha)
    const { x: rx, y: ry } = parseXY(out)
    assertNear(rx, expectedX, 0.001, 'X')
    assertNear(ry, expectedY, 0.001, 'Y')
    assertNear(parseZ(out), 3, 0.001, 'Z unchanged')
  })

  it('rotates a G2 arc endpoint and I/J center offsets', () => {
    const gcode = 'G90\nG0 X10 Y0\nG2 X0 Y10 I-10 J0'
    const out = applyTransforms(gcode, 'rotated', ROT_45, null)
    const lines = out.split('\n')
    const arcLine = lines[2]!

    const alpha = -45 * (Math.PI / 180)
    const cos = Math.cos(alpha)
    const sin = Math.sin(alpha)
    // endpoint (0,10) rotated by α
    const ex = 0 * cos - 10 * sin
    const ey = 0 * sin + 10 * cos
    // center offset (-10,0) rotated by α
    const ei = -10 * cos - 0 * sin
    const ej = -10 * sin + 0 * cos

    const { x: rx, y: ry } = parseXY(arcLine)
    assertNear(rx, ex, 0.001, 'arc endpoint X')
    assertNear(ry, ey, 0.001, 'arc endpoint Y')

    const im = /I([-\d.]+)/.exec(arcLine)
    const jm = /J([-\d.]+)/.exec(arcLine)
    assertNear(parseFloat(im?.[1] ?? '0'), ei, 0.001, 'arc I')
    assertNear(parseFloat(jm?.[1] ?? '0'), ej, 0.001, 'arc J')
  })

  it('converts R-format G2 arc to I/J in rotated output', () => {
    const gcode = 'G90\nG0 X10 Y0\nG2 X0 Y10 R10'
    const out = applyTransforms(gcode, 'rotated', ROT_45, null)
    const arcLine = out.split('\n')[2]!

    expect(arcLine.includes('I'), 'output should include I').toBe(true)
    expect(arcLine.includes('J'), 'output should include J').toBe(true)
    expect(!/\bR[\d.-]/.test(arcLine), 'output should not include R word').toBe(true)
  })

  it('correctly rotates a G91 (relative) G1 delta', () => {
    const alpha = -45 * (Math.PI / 180)
    const cos = Math.cos(alpha)
    const sin = Math.sin(alpha)
    const dx = 5, dy = 3
    const expectedX = dx * cos - dy * sin
    const expectedY = dx * sin + dy * cos

    const out = applyTransforms('G91\nG1 X5 Y3', 'rotated', ROT_45, null)
    const { x: rx, y: ry } = parseXY(out.split('\n')[1]!)
    assertNear(rx, expectedX, 0.001, 'G91 X')
    assertNear(ry, expectedY, 0.001, 'G91 Y')
  })

  it('passes non-motion lines verbatim', () => {
    const lines = ['M3 S12000', 'G4 P0.5', '; comment', '(inline comment)', 'G54']
    const out = applyTransforms(lines.join('\n'), 'rotated', ROT_45, null)
    expect(out).toBe(lines.join('\n'))
  })
})

// ── Heightmap helpers ─────────────────────────────────────────────────────────

function makeHm(values: (number | null)[], cols = 2, rows = 2, spacing = 10): HeightmapResult {
  return { colCount: cols, rowCount: rows, spacingX: spacing, spacingY: spacing, originX: 0, originY: 0, values }
}

// ── Heightmap — null fill ─────────────────────────────────────────────────────

describe('heightmap — null fill', () => {
  it('fills nulls with nearest non-null value', () => {
    // 2×2 grid: only bottom-right corner is 5.0
    const hm = makeHm([null, null, null, 5.0])
    const out = applyTransforms('G1 X0 Y0 Z0', 'height_adjusted', null, hm)
    // All cells fill to 5.0 → correction at (0,0) clamped to grid boundary = f00=5, f10=5, f01=5, f11=5 → +5
    assertNear(parseZ(out), 5.0, 0.01, 'Z corrected by null-filled value')
  })

  it('returns unchanged output when all values are null', () => {
    const hm = makeHm([null, null, null, null])
    const input = 'G1 X5 Y5 Z-2'
    const out = applyTransforms(input, 'height_adjusted', null, hm)
    expect(out).toBe(input)
  })
})

// ── Heightmap — bilinear interpolation ───────────────────────────────────────

describe('heightmap — bilinear interpolation', () => {
  it('returns exact value at grid origin (corner)', () => {
    const hm = makeHm([0, 1, 2, 3])
    const out = applyTransforms('G90\nG1 X0 Y0 Z0', 'height_adjusted', null, hm)
    assertNear(parseZ(out.split('\n')[1]!), 0, 0.001, 'Z at origin')
  })

  it('returns exact value at first column, second row', () => {
    const hm = makeHm([0, 1, 2, 3])
    // X=0, Y=10 → f01=2
    const out = applyTransforms('G90\nG1 X0 Y10 Z0', 'height_adjusted', null, hm)
    assertNear(parseZ(out.split('\n')[1]!), 2, 0.001, 'Z at row=1,col=0')
  })

  it('interpolates center of 2×2 grid as average of 4 corners', () => {
    const hm = makeHm([0, 1, 2, 3])
    // Center at (5, 5): bilinear = (0+1+2+3)/4 = 1.5
    const out = applyTransforms('G90\nG1 X5 Y5 Z0', 'height_adjusted', null, hm)
    assertNear(parseZ(out.split('\n')[1]!), 1.5, 0.001, 'Z at center')
  })
})

// ── Heightmap — G1 segmentation ───────────────────────────────────────────────

describe('heightmap — G1 move segmentation', () => {
  it('does not split a short move (within grid spacing)', () => {
    const hm = makeHm([0, 0, 0, 0])
    const out = applyTransforms('G90\nG1 X5 Y0 Z0', 'height_adjusted', null, hm)
    const segs = out.split('\n').filter((l) => l.startsWith('G1'))
    expect(segs.length, 'single segment for short move').toBe(1)
  })

  it('splits a long move into correct number of segments', () => {
    // spacing=10, move 50mm in X → ceil(50/10)=5 segments
    const hm = makeHm([0, 0, 0, 0], 2, 2, 10)
    const out = applyTransforms('G90\nG1 X50 Y0 Z0', 'height_adjusted', null, hm)
    const segs = out.split('\n').filter((l) => l.startsWith('G1'))
    expect(segs.length, '5 segments for 50mm move with spacing=10').toBe(5)
  })

  it('places F word on first segment only', () => {
    const hm = makeHm([0, 0, 0, 0], 2, 2, 10)
    const out = applyTransforms('G90\nG1 X50 Y0 Z0 F1000', 'height_adjusted', null, hm)
    const segs = out.split('\n').filter((l) => l.startsWith('G1'))
    expect(segs[0]!.includes('F'), 'first segment has F').toBe(true)
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.includes('F'), `segment ${i} should not have F`).toBe(false)
    }
  })
})

// ── Heightmap — arc tessellation ─────────────────────────────────────────────

describe('heightmap — G2/G3 arc tessellation', () => {
  it('tessellates a quarter-circle arc into multiple G1 segments', () => {
    const hm = makeHm([0, 0, 0, 0], 2, 2, 2)
    const gcode = 'G90\nG0 X10 Y0\nG3 X0 Y10 I-10 J0'
    const out = applyTransforms(gcode, 'height_adjusted', null, hm)
    const segs = out.split('\n').filter((l) => l.startsWith('G1'))
    expect(segs.length > 1, 'arc tessellated into multiple segments').toBe(true)
    for (const seg of segs) {
      expect(seg, 'segment is valid G1').toMatch(/G1 X[-\d.]+ Y[-\d.]+ Z[-\d.]+/)
    }
  })

  it('handles full circle arc (start equals end)', () => {
    const hm = makeHm([0, 0, 0, 0], 2, 2, 2)
    const gcode = 'G90\nG0 X10 Y0\nG3 X10 Y0 I-10 J0'
    const out = applyTransforms(gcode, 'height_adjusted', null, hm)
    const segs = out.split('\n').filter((l) => l.startsWith('G1'))
    expect(segs.length > 4, 'full circle produces many segments').toBe(true)
  })
})

// ── Combined transform order ───────────────────────────────────────────────────

describe('combined rotation + heightmap', () => {
  it('applies rotation before heightmap (rotated_height_adjusted)', () => {
    const rot = { rotationDeg: 90, bowMm: 0, edge: 'top' as const }
    const hm = makeHm([1, 1, 1, 1]) // uniform +1 Z correction everywhere
    const out = applyTransforms('G90\nG1 X10 Y0 Z0', 'rotated_height_adjusted', rot, hm)
    const lines = out.split('\n')
    const { x, y } = parseXY(lines[1]!)
    // -90° rotation of (10, 0): x' = 10*cos(-90°) - 0*sin(-90°) = 0, y' = 10*sin(-90°) + 0 = -10
    assertNear(x, 0, 0.01, 'rotated X')
    assertNear(y, -10, 0.01, 'rotated Y')
    // Z correction is +1 from flat heightmap
    assertNear(parseZ(lines[1]!), 1, 0.01, 'Z corrected')
  })
})
