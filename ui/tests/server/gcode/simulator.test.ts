import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { simulateToLine } from '../../../server/utils/gcode/simulator'
import { preprocessGCode } from '../../../server/utils/gcode/preprocessor'

function lines(gcode: string) {
  return preprocessGCode(gcode).lines
}

describe('simulateToLine', () => {
  it('returns default modal state for empty program', () => {
    const state = simulateToLine([], 0)
    assert.equal(state.positionMode, 'G90')
    assert.equal(state.spindleMode, 'M5')
    assert.equal(state.coolant, 'off')
    assert.deepEqual(state.position, { x: 0, y: 0, z: 0 })
  })

  it('tracks absolute position after G0 moves', () => {
    const state = simulateToLine(lines('G0 X10 Y5 Z-2\n'), 0)
    assert.deepEqual(state.position, { x: 10, y: 5, z: -2 })
  })

  it('tracks relative position in G91 mode', () => {
    const gcode = 'G91\nG0 X5\nG0 X5\n'
    const ls = lines(gcode)
    const state = simulateToLine(ls, 2)
    assert.ok(Math.abs(state.position.x - 10) < 0.001)
  })

  it('returns to absolute mode after G90', () => {
    const gcode = 'G91\nG0 X5\nG90\nG0 X20\n'
    const ls = lines(gcode)
    const state = simulateToLine(ls, 3)
    assert.equal(state.positionMode, 'G90')
    assert.ok(Math.abs(state.position.x - 20) < 0.001)
  })

  it('tracks work coordinate system changes', () => {
    const state = simulateToLine(lines('G55\n'), 0)
    assert.equal(state.workCoordinate, 'G55')
  })

  it('tracks spindle mode and speed', () => {
    const state = simulateToLine(lines('M3 S8000\n'), 0)
    assert.equal(state.spindleMode, 'M3')
    assert.equal(state.spindleSpeed, 8000)
  })

  it('tracks coolant on and off', () => {
    const ls = lines('M8\nG0 X10\nM9\n')
    assert.equal(simulateToLine(ls, 1).coolant, 'M8')
    assert.equal(simulateToLine(ls, 2).coolant, 'off')
  })

  it('tracks feed rate', () => {
    const state = simulateToLine(lines('G1 X10 F1200\n'), 0)
    assert.equal(state.feedRate, 1200)
  })

  it('is idempotent — calling twice returns equal state', () => {
    const gcode = 'G0 X10\nM3 S5000\nG55\nG1 X20 F600\n'
    const ls = lines(gcode)
    const a = simulateToLine(ls, 3)
    const b = simulateToLine(ls, 3)
    assert.deepEqual(a, b)
  })

  it('stops at targetIndex and does not apply later lines', () => {
    const ls = lines('G0 X10\nG0 X50\n')
    const state = simulateToLine(ls, 0)
    assert.ok(Math.abs(state.position.x - 10) < 0.001)
  })

  it('handles targetIndex beyond line count gracefully', () => {
    const ls = lines('G0 X5\n')
    const state = simulateToLine(ls, 999)
    assert.ok(Math.abs(state.position.x - 5) < 0.001)
  })

  it('tracks tool number', () => {
    const state = simulateToLine(lines('T2 M6\n'), 0)
    assert.equal(state.toolNumber, 2)
  })

  it('tracks unit mode G20', () => {
    const state = simulateToLine(lines('G20\n'), 0)
    assert.equal(state.units, 'G20')
  })

  it('tracks position through modal G1 lines', () => {
    // Line 1 has no G1 word but the motion mode carries over
    const gcode = 'G1 X10 F600\nX20\n'
    const ls = lines(gcode)
    const state = simulateToLine(ls, 1)
    assert.ok(Math.abs(state.position.x - 20) < 0.001)
  })

  it('tracks motion mode field', () => {
    const state = simulateToLine(lines('G1 X5 F600\n'), 0)
    assert.equal(state.motionMode, 'G1')
  })
})
