import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { preprocessGCode } from '../../../server/utils/gcode/preprocessor'

const RAPID = 3000 // mm/min

function closeTo(actual: number, expected: number, digits = 0) {
  const tolerance = Math.pow(10, -digits) / 2 + 0.5
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `Expected ${actual} to be close to ${expected} (±${tolerance})`,
  )
}

describe('preprocessGCode', () => {
  it('classifies a rapid move and estimates duration', () => {
    const { lines } = preprocessGCode('G0 X10 Y0 Z0\n', RAPID)
    assert.equal(lines[0].type, 'rapid')
    // 10mm at 3000mm/min = 0.2s = 200ms
    closeTo(lines[0].estimatedDurationMs, 200, 0)
  })

  it('classifies a feed move and estimates duration', () => {
    const { lines } = preprocessGCode('G1 X100 F600\n', RAPID)
    assert.equal(lines[0].type, 'feed')
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
    assert.ok(lines[2].estimatedDurationMs > 0)
  })

  it('switches back to G90 absolute mode', () => {
    const gcode = 'G91\nG0 X5\nG90\nG0 X5\n'
    const { lines } = preprocessGCode(gcode, RAPID)
    // G91 move: 5mm; G90 move: from X=5 to X=5 → 0mm
    assert.ok(lines[1].estimatedDurationMs > 0)
    closeTo(lines[3].estimatedDurationMs, 0, 1)
  })

  it('classifies a G4 dwell correctly', () => {
    const { lines } = preprocessGCode('G4 P2.5\n', RAPID)
    assert.equal(lines[0].type, 'dwell')
    closeTo(lines[0].estimatedDurationMs, 2500, 0)
  })

  it('classifies arc moves', () => {
    const { lines } = preprocessGCode('G2 X10 Y0 I5 J0 F600\n', RAPID)
    assert.equal(lines[0].type, 'arc')
    assert.ok(lines[0].estimatedDurationMs > 0)
  })

  it('classifies spindle commands', () => {
    const { lines } = preprocessGCode('M3 S12000\n', RAPID)
    assert.equal(lines[0].type, 'spindle')
    assert.equal(lines[0].estimatedDurationMs, 0)
  })

  it('classifies coolant commands', () => {
    const { lines } = preprocessGCode('M8\n', RAPID)
    assert.equal(lines[0].type, 'coolant')
    assert.equal(lines[0].estimatedDurationMs, 0)
  })

  it('strips comments from blank lines', () => {
    const { lines } = preprocessGCode('; this is a comment\n(also a comment)\n', RAPID)
    assert.equal(lines[0].type, 'comment')
    assert.equal(lines[1].type, 'comment')
  })

  it('handles inline comments', () => {
    const { lines } = preprocessGCode('G0 X10 (rapid to 10)\n', RAPID)
    assert.equal(lines[0].type, 'rapid')
  })

  it('computes axis ranges', () => {
    const gcode = 'G0 X0 Y0 Z0\nG1 X50 Y30 Z-5 F600\n'
    const { axisRanges } = preprocessGCode(gcode, RAPID)
    assert.equal(axisRanges.x.min, 0)
    assert.equal(axisRanges.x.max, 50)
    assert.equal(axisRanges.y.max, 30)
    assert.equal(axisRanges.z.min, -5)
  })

  it('handles canned cycles as unsupported', () => {
    const { lines } = preprocessGCode('G81 X10 Y10 Z-5 R1 F200\n', RAPID)
    assert.equal(lines[0].type, 'unsupported')
    assert.equal(lines[0].estimatedDurationMs, 0)
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
    assert.deepEqual(
      lines.map((l) => l.index),
      [0, 1, 2],
    )
  })

  it('preserves raw line text', () => {
    const raw = 'G0 X10.5 Y-3.2 ; move'
    const { lines } = preprocessGCode(raw + '\n', RAPID)
    assert.equal(lines[0].raw, raw)
  })
})
