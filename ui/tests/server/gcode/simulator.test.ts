import { describe, it, expect } from 'vitest'
import { simulateToLine } from '../../../server/utils/gcode/simulator'
import { preprocessGCode } from '../../../server/utils/gcode/preprocessor'

function lines(gcode: string) {
  return preprocessGCode(gcode).lines
}

describe('simulateToLine', () => {
  it('returns default modal state for empty program', () => {
    const state = simulateToLine([], 0)
    expect(state.positionMode).toBe('G90')
    expect(state.spindleMode).toBe('M5')
    expect(state.coolant).toBe('off')
    expect(state.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('tracks absolute position after G0 moves', () => {
    const state = simulateToLine(lines('G0 X10 Y5 Z-2\n'), 0)
    expect(state.position).toEqual({ x: 10, y: 5, z: -2 })
  })

  it('tracks relative position in G91 mode', () => {
    const gcode = 'G91\nG0 X5\nG0 X5\n'
    const ls = lines(gcode)
    const state = simulateToLine(ls, 2)
    expect(Math.abs(state.position.x - 10) < 0.001).toBe(true)
  })

  it('returns to absolute mode after G90', () => {
    const gcode = 'G91\nG0 X5\nG90\nG0 X20\n'
    const ls = lines(gcode)
    const state = simulateToLine(ls, 3)
    expect(state.positionMode).toBe('G90')
    expect(Math.abs(state.position.x - 20) < 0.001).toBe(true)
  })

  it('tracks work coordinate system changes', () => {
    const state = simulateToLine(lines('G55\n'), 0)
    expect(state.workCoordinate).toBe('G55')
  })

  it('tracks spindle mode and speed', () => {
    const state = simulateToLine(lines('M3 S8000\n'), 0)
    expect(state.spindleMode).toBe('M3')
    expect(state.spindleSpeed).toBe(8000)
  })

  it('tracks coolant on and off', () => {
    const ls = lines('M8\nG0 X10\nM9\n')
    expect(simulateToLine(ls, 1).coolant).toBe('M8')
    expect(simulateToLine(ls, 2).coolant).toBe('off')
  })

  it('tracks feed rate', () => {
    const state = simulateToLine(lines('G1 X10 F1200\n'), 0)
    expect(state.feedRate).toBe(1200)
  })

  it('is idempotent — calling twice returns equal state', () => {
    const gcode = 'G0 X10\nM3 S5000\nG55\nG1 X20 F600\n'
    const ls = lines(gcode)
    const a = simulateToLine(ls, 3)
    const b = simulateToLine(ls, 3)
    expect(a).toEqual(b)
  })

  it('stops at targetIndex and does not apply later lines', () => {
    const ls = lines('G0 X10\nG0 X50\n')
    const state = simulateToLine(ls, 0)
    expect(Math.abs(state.position.x - 10) < 0.001).toBe(true)
  })

  it('handles targetIndex beyond line count gracefully', () => {
    const ls = lines('G0 X5\n')
    const state = simulateToLine(ls, 999)
    expect(Math.abs(state.position.x - 5) < 0.001).toBe(true)
  })

  it('tracks tool number', () => {
    const state = simulateToLine(lines('T2 M6\n'), 0)
    expect(state.toolNumber).toBe(2)
  })

  it('tracks unit mode G20', () => {
    const state = simulateToLine(lines('G20\n'), 0)
    expect(state.units).toBe('G20')
  })

  it('tracks position through modal G1 lines', () => {
    // Line 1 has no G1 word but the motion mode carries over
    const gcode = 'G1 X10 F600\nX20\n'
    const ls = lines(gcode)
    const state = simulateToLine(ls, 1)
    expect(Math.abs(state.position.x - 20) < 0.001).toBe(true)
  })

  it('tracks motion mode field', () => {
    const state = simulateToLine(lines('G1 X5 F600\n'), 0)
    expect(state.motionMode).toBe('G1')
  })
})
