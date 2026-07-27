import { describe, it, expect } from 'vitest'
import { computeRotationResult } from '../../../server/utils/probing/probingWizards'

// Simulates probing a rigid stock rotated by `thetaDeg` (CCW-positive, world convention),
// for a given reference edge, and returns what the wizard would measure.
//
// Each probe move commands an exact nominal position on the *non-probed* axis and
// reads back where the touch probe contacts the physical (rotated) edge *line* — not
// where an individual nominal point would land if rotated. Modelling the edge as a
// line through pc (chosen as the rotation pivot, WLOG — rotationDeg/bowMm only depend
// on relative offsets, so the pivot choice doesn't affect the result) with direction
// rotated by theta gives an exact (not small-angle) relation: for a fixed commanded
// coordinate, the measured coordinate is `pc + (target - pc) * tan(theta)` (sign flips
// per axis — see the two branches below, matching computeRotationResult's two branches).
function simulateEdgeProbe(
  edge: 'top' | 'bottom' | 'left' | 'right',
  thetaDeg: number,
  measuredWidth: number,
  measuredHeight: number,
  insideOffset: number,
) {
  const tanT = Math.tan(thetaDeg * (Math.PI / 180))

  let p1: { x: number; y: number }
  let pc: { x: number; y: number }
  let p3: { x: number; y: number }
  let probeAxis: 'X' | 'Y'
  if (edge === 'top') {
    p1 = { x: -(measuredWidth / 2 - insideOffset), y: measuredHeight / 2 }
    pc = { x: 0, y: measuredHeight / 2 }
    p3 = { x: measuredWidth / 2 - insideOffset, y: measuredHeight / 2 }
    probeAxis = 'Y'
  } else if (edge === 'bottom') {
    p1 = { x: -(measuredWidth / 2 - insideOffset), y: -measuredHeight / 2 }
    pc = { x: 0, y: -measuredHeight / 2 }
    p3 = { x: measuredWidth / 2 - insideOffset, y: -measuredHeight / 2 }
    probeAxis = 'Y'
  } else if (edge === 'left') {
    p1 = { x: -measuredWidth / 2, y: -(measuredHeight / 2 - insideOffset) }
    pc = { x: -measuredWidth / 2, y: 0 }
    p3 = { x: -measuredWidth / 2, y: measuredHeight / 2 - insideOffset }
    probeAxis = 'X'
  } else {
    p1 = { x: measuredWidth / 2, y: -(measuredHeight / 2 - insideOffset) }
    pc = { x: measuredWidth / 2, y: 0 }
    p3 = { x: measuredWidth / 2, y: measuredHeight / 2 - insideOffset }
    probeAxis = 'X'
  }

  const wpos = (nominal: { x: number; y: number }): number =>
    probeAxis === 'Y' ? pc.y + (nominal.x - pc.x) * tanT : pc.x - (nominal.y - pc.y) * tanT

  return computeRotationResult(probeAxis, p1, pc, p3, wpos(p1), wpos(pc), wpos(p3))
}

describe('computeRotationResult', () => {
  const edges: Array<'top' | 'bottom' | 'left' | 'right'> = ['top', 'bottom', 'left', 'right']

  it('agrees in sign and magnitude across all four edges for the same physical rotation', () => {
    for (const thetaDeg of [10, -10, 2, -2, 0.5, -0.5]) {
      for (const edge of edges) {
        const { rotationDeg } = simulateEdgeProbe(edge, thetaDeg, 100, 100, 20)
        expect(Math.abs(rotationDeg - thetaDeg), `edge=${edge} theta=${thetaDeg}`).toBeLessThan(1e-9)
      }
    }
  })

  it('reports zero rotation and zero bow for an unrotated stock', () => {
    for (const edge of edges) {
      const { rotationDeg, bowMm } = simulateEdgeProbe(edge, 0, 100, 100, 20)
      expect(Math.abs(rotationDeg)).toBeLessThan(1e-9)
      expect(Math.abs(bowMm)).toBeLessThan(1e-9)
    }
  })
})
