import { describe, it, expect } from 'vitest'
import { blendDeviation, deviationFor, edgeZeroValues } from '../../../server/utils/probing/probingRunner'
import type { ProbeCompensation } from '../../../server/utils/tool/types'

// Test cases intentionally mirror the Rust unit tests in
// fluid-sim/sim/src/machine/probe.rs so the two implementations cannot drift apart.

const comp: ProbeCompensation = { xPlus: 0.1, xMinus: -0.2, yPlus: 0.3, yMinus: 0.4, zMinus: 0.5 }

function closeTo(actual: number, expected: number, eps = 1e-12) {
  expect(Math.abs(actual - expected) < eps, `Expected ${actual} ≈ ${expected}`).toBe(true)
}

describe('blendDeviation', () => {
  it('returns the exact value for axis-aligned directions', () => {
    closeTo(blendDeviation([1, 0, 0], comp), 0.1)
    closeTo(blendDeviation([-1, 0, 0], comp), -0.2)
    closeTo(blendDeviation([0, 1, 0], comp), 0.3)
    closeTo(blendDeviation([0, -1, 0], comp), 0.4)
    closeTo(blendDeviation([0, 0, -1], comp), 0.5)
  })

  it('returns 0 for +Z probing', () => {
    expect(blendDeviation([0, 0, 1], comp)).toBe(0)
  })

  it('returns the 50/50 average at 45° in XY', () => {
    const c: ProbeCompensation = { xPlus: 0.2, xMinus: 0, yPlus: 0.4, yMinus: 0, zMinus: 0 }
    const s = Math.SQRT1_2
    closeTo(blendDeviation([s, s, 0], c), 0.3)
  })

  it('weights an equal-component XYZ diagonal as equal thirds', () => {
    const c: ProbeCompensation = { xPlus: 0.3, xMinus: 0, yPlus: 0.6, yMinus: 0, zMinus: 0.9 }
    const v = 1 / Math.sqrt(3)
    closeTo(blendDeviation([v, v, -v], c), (0.3 + 0.6 + 0.9) / 3)
  })

  it('is linear in the direction components (2:1 XY blend)', () => {
    const c: ProbeCompensation = { xPlus: 0.3, xMinus: 0, yPlus: 0.6, yMinus: 0, zMinus: 0 }
    // |nx| : |ny| = 2 : 1 → weights 2/3, 1/3
    const len = Math.sqrt(5)
    closeTo(blendDeviation([2 / len, 1 / len, 0], c), (2 * 0.3 + 1 * 0.6) / 3)
  })

  it('returns 0 for the zero vector', () => {
    expect(blendDeviation([0, 0, 0], comp)).toBe(0)
  })
})

describe('deviationFor', () => {
  it('maps each (axis, direction) pair to the §2.4 table', () => {
    closeTo(deviationFor('X', '+', comp), comp.xPlus)
    closeTo(deviationFor('X', '-', comp), comp.xMinus)
    closeTo(deviationFor('Y', '+', comp), comp.yPlus)
    closeTo(deviationFor('Y', '-', comp), comp.yMinus)
    closeTo(deviationFor('Z', '-', comp), comp.zMinus)
    expect(deviationFor('Z', '+', comp)).toBe(0)
  })
})

describe('edgeZeroValues', () => {
  it("'-' probe, single reading settled at contact → classic macro (+effective)", () => {
    // Z-down touch-off: reading r, machine still at r → G10 value = +effective.
    const { edgeMach, zeroAtSettle } = edgeZeroValues([10], 10, '-', 1, 2)
    closeTo(edgeMach, 9) // surface is `effective` below the tool reference
    closeTo(zeroAtSettle, 1)
  })

  it("'+' probe mirrors the sign (−effective)", () => {
    const { edgeMach, zeroAtSettle } = edgeZeroValues([10], 10, '+', 1, 2)
    closeTo(edgeMach, 11) // edge is `effective` ahead of the tool reference
    closeTo(zeroAtSettle, -1)
  })

  it('the settle−avg term carries the wiggle average into the zero value', () => {
    // avg of last 2 readings = 10.1; settle at 10.3 (final retract release point).
    const { edgeMach, zeroAtSettle } = edgeZeroValues([9.7, 10.0, 10.2], 10.3, '-', 1, 2)
    closeTo(edgeMach, 9.1)
    closeTo(zeroAtSettle, 1.2)
  })

  it('averageN larger than the reading count uses all readings', () => {
    const { edgeMach } = edgeZeroValues([10.0, 10.2], 10.2, '-', 1, 5)
    closeTo(edgeMach, 9.1)
  })

  it('deviation shrinks the effective offset', () => {
    // effective = tipRadius − deviation is passed in pre-computed: 1 − 0.2 = 0.8.
    const { zeroAtSettle } = edgeZeroValues([10], 10, '-', 0.8, 2)
    closeTo(zeroAtSettle, 0.8)
  })
})
