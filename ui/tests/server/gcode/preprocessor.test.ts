import { describe, it, expect } from 'vitest'
import { preprocessGCode } from '../../../server/utils/gcode/preprocessor'

const RAPID = 3000 // mm/min

function closeTo(actual: number, expected: number, digits = 0) {
  const tolerance = Math.pow(10, -digits) / 2 + 0.5
  expect(
    Math.abs(actual - expected) < tolerance,
    `Expected ${actual} to be close to ${expected} (±${tolerance})`,
  ).toBe(true)
}

describe('preprocessGCode', () => {
  it('classifies a rapid move and estimates duration', () => {
    const { lines } = preprocessGCode('G0 X10 Y0 Z0\n', RAPID)
    expect(lines[0].type).toBe('rapid')
    // 10mm at 3000mm/min = 0.2s = 200ms
    closeTo(lines[0].estimatedDurationMs, 200, 0)
  })

  it('classifies a feed move and estimates duration', () => {
    const { lines } = preprocessGCode('G1 X100 F600\n', RAPID)
    expect(lines[0].type).toBe('feed')
    // 100mm at 600mm/min = 10s = 10000ms
    closeTo(lines[0].estimatedDurationMs, 10000, 0)
  })

  it('accumulates cumulative duration correctly', () => {
    const gcode = 'G0 X10\nG1 X20 F600\n'
    const { lines } = preprocessGCode(gcode, RAPID)
    closeTo(
      lines[1].cumulativeDurationMs,
      lines[0].estimatedDurationMs + lines[1].estimatedDurationMs,
      0,
    )
  })

  it('handles G91 relative mode correctly', () => {
    const gcode = 'G91\nG0 X10\nG0 X10\n'
    const { lines } = preprocessGCode(gcode, RAPID)
    // Both moves should be 10mm — equal duration
    closeTo(lines[1].estimatedDurationMs, lines[2].estimatedDurationMs, 0)
    expect(lines[2].estimatedDurationMs > 0).toBe(true)
  })

  it('switches back to G90 absolute mode', () => {
    const gcode = 'G91\nG0 X5\nG90\nG0 X5\n'
    const { lines } = preprocessGCode(gcode, RAPID)
    // G91 move: 5mm; G90 move: from X=5 to X=5 → 0mm
    expect(lines[1].estimatedDurationMs > 0).toBe(true)
    closeTo(lines[3].estimatedDurationMs, 0, 1)
  })

  it('classifies a G4 dwell correctly', () => {
    const { lines } = preprocessGCode('G4 P2.5\n', RAPID)
    expect(lines[0].type).toBe('dwell')
    closeTo(lines[0].estimatedDurationMs, 2500, 0)
  })

  it('classifies arc moves', () => {
    const { lines } = preprocessGCode('G2 X10 Y0 I5 J0 F600\n', RAPID)
    expect(lines[0].type).toBe('arc')
    expect(lines[0].estimatedDurationMs > 0).toBe(true)
  })

  it('classifies spindle commands', () => {
    const { lines } = preprocessGCode('M3 S12000\n', RAPID)
    expect(lines[0].type).toBe('spindle')
    expect(lines[0].estimatedDurationMs >= 0).toBe(true)
  })

  it('classifies coolant commands', () => {
    const { lines } = preprocessGCode('M8\n', RAPID)
    expect(lines[0].type).toBe('coolant')
    expect(lines[0].estimatedDurationMs >= 0).toBe(true)
  })

  it('strips comments from blank lines', () => {
    const { lines } = preprocessGCode('; this is a comment\n(also a comment)\n', RAPID)
    expect(lines[0].type).toBe('comment')
    expect(lines[1].type).toBe('comment')
  })

  it('handles inline comments', () => {
    const { lines } = preprocessGCode('G0 X10 (rapid to 10)\n', RAPID)
    expect(lines[0].type).toBe('rapid')
  })

  it('computes axis ranges', () => {
    const gcode = 'G0 X0 Y0 Z0\nG1 X50 Y30 Z-5 F600\n'
    const { axisRanges } = preprocessGCode(gcode, RAPID)
    expect(axisRanges.x.min).toBe(0)
    expect(axisRanges.x.max).toBe(50)
    expect(axisRanges.y.max).toBe(30)
    expect(axisRanges.z.min).toBe(-5)
  })

  it('handles canned cycles as unsupported', () => {
    const { lines } = preprocessGCode('G81 X10 Y10 Z-5 R1 F200\n', RAPID)
    expect(lines[0].type).toBe('unsupported')
    expect(lines[0].estimatedDurationMs).toBe(0)
  })

  it('scales correctly with G20 inches', () => {
    // 1 inch rapid → 25.4mm / 3000mm/min * 60000ms ≈ 508ms
    const gcode = 'G20\nG0 X1\n'
    const { lines } = preprocessGCode(gcode, RAPID)
    closeTo(lines[1].estimatedDurationMs, 508, 0)
  })

  it('assigns sequential index values', () => {
    // No trailing newline → exactly 3 lines with indices 0,1,2
    const { lines } = preprocessGCode('G0 X1\nG1 X2 F300\nG0 X0', RAPID)
    expect(lines.map((l) => l.index)).toEqual([0, 1, 2])
  })

  it('preserves raw line text', () => {
    const raw = 'G0 X10.5 Y-3.2 ; move'
    const { lines } = preprocessGCode(raw + '\n', RAPID)
    expect(lines[0].raw).toBe(raw)
  })

  it('tracks position through modal G1 lines (no G word)', () => {
    // Lines 1 and 2 have no explicit G1 — they use the modal motion mode set by line 0
    const gcode = 'G1 X10 Y0 F600\nX20 Y5\nX30 Y10\n'
    const { lines, vectors } = preprocessGCode(gcode, RAPID)
    expect(lines[1].type).toBe('feed')
    expect(lines[2].type).toBe('feed')
    // Each vector's start must equal the previous vector's end
    expect(Math.abs(vectors[0]!.x1 - vectors[1]!.x0) < 1e-6, 'line 1 start x should match line 0 end x').toBe(true)
    expect(Math.abs(vectors[1]!.x1 - vectors[2]!.x0) < 1e-6, 'line 2 start x should match line 1 end x').toBe(true)
  })

  it('tracks position through modal G0 lines (no G word)', () => {
    const gcode = 'G0 X10\nY20\nZ5\n'
    const { lines, vectors } = preprocessGCode(gcode, RAPID)
    expect(lines[1].type).toBe('rapid')
    expect(lines[2].type).toBe('rapid')
    // Y-only move: x stays at 10
    expect(Math.abs(vectors[1]!.x0 - 10) < 1e-6, 'modal G0 Y move should start at X=10').toBe(true)
    expect(Math.abs(vectors[1]!.y1 - 20) < 1e-6, 'modal G0 Y move should end at Y=20').toBe(true)
  })

  it('does not misclassify G28 axis words as modal motion', () => {
    // G28 G91 Z0 — Z0 belongs to the G28 command, not a separate modal move
    const gcode = 'G1 X10 F600\nG28 G91 Z0\nG90\n'
    const { lines } = preprocessGCode(gcode, RAPID)
    expect(lines[1].type).toBe('rapid') // G28 is rapid, not a G1 modal line
  })

  it('arc vectors connect to preceding motion', () => {
    // After the ramp (G1 modal lines 1-3), the arc at line 4 should start where line 3 ended
    const gcode = [
      'G1 X0 Y0 Z0 F500',
      'X1 Y0 Z-1',
      'X2 Y0 Z-2',
      'X3 Y0 Z-3',
      'G3 X5 Y2 I-3 J4',
    ].join('\n')
    const { vectors } = preprocessGCode(gcode, RAPID)
    const ramp = vectors[3]! // last G1 modal line
    const arc = vectors[4]! // G3 arc
    expect(Math.abs(ramp.x1 - arc.x0) < 1e-6, 'arc x0 must match ramp end x').toBe(true)
    expect(Math.abs(ramp.y1 - arc.y0) < 1e-6, 'arc y0 must match ramp end y').toBe(true)
    expect(Math.abs(ramp.z1 - arc.z0) < 1e-6, 'arc z0 must match ramp end z').toBe(true)
  })
})
