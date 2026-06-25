import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const PATH = join(process.cwd(), 'config', 'scenarios.json')

const DEFAULTS = [
  {
    id: 'rect-outer-edge',
    name: 'Rect — XYZ Outer Edge',
    description:
      'Machine centered above rectangular stock. Probe all four sides to find center XY, then surface for Z.',
    machineState: 'Idle',
    pos: { x: 150.0, y: 100.0, z: 5.0 },
    wco: { x: 0.0, y: 0.0, z: 0.0 },
    stock: { shape: 'rect', width: 100, height: 80, depth: 20, ox: 100, oy: 60, diameter: 80, rotation: 0 },
  },
  {
    id: 'round-center',
    name: 'Round — XYZ Center',
    description:
      'Machine centered above round stock. Probe 3–4 points on the circumference to find center XY, then surface for Z.',
    machineState: 'Idle',
    pos: { x: 150.0, y: 100.0, z: 5.0 },
    wco: { x: 0.0, y: 0.0, z: 0.0 },
    stock: { shape: 'round', width: 80, height: 80, depth: 20, ox: 110, oy: 60, diameter: 80, rotation: 0 },
  },
  {
    id: 'rect-corner-xyz',
    name: 'Rect — Corner XYZ',
    description:
      'Machine positioned just outside the front-left corner. Probe the X and Y faces to set the corner as XY origin, then surface for Z.',
    machineState: 'Idle',
    pos: { x: 95.0, y: 55.0, z: 5.0 },
    wco: { x: 0.0, y: 0.0, z: 0.0 },
    stock: { shape: 'rect', width: 100, height: 80, depth: 20, ox: 100, oy: 60, diameter: 80, rotation: 0 },
  },
  {
    id: 'rotation-probe',
    name: 'Rect — Rotation Probe',
    description:
      'Rectangular stock rotated 15°. Probe two points along the long edge to measure the rotation angle and compensate with G68 or in CAM.',
    machineState: 'Idle',
    pos: { x: 105.0, y: 65.0, z: 5.0 },
    wco: { x: 0.0, y: 0.0, z: 0.0 },
    stock: { shape: 'rect', width: 100, height: 80, depth: 20, ox: 100, oy: 60, diameter: 80, rotation: 15 },
  },
  {
    id: 'center-hole-z-zeroed',
    name: 'Center Hole — Z Pre-zeroed',
    description:
      'Machine at the center of a bore hole. XY and Z zero already set at the hole center at stock surface level. Ready to probe hole walls to verify center.',
    machineState: 'Idle',
    pos: { x: 150.0, y: 100.0, z: -5.0 },
    wco: { x: 150.0, y: 100.0, z: -5.0 },
    stock: { shape: 'rect', width: 100, height: 80, depth: 20, ox: 100, oy: 60, diameter: 80, rotation: 0 },
  },
]

export default defineEventHandler(async () => {
  try {
    const data = await readFile(PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    // File doesn't exist yet — write defaults and return them
    await writeFile(PATH, JSON.stringify(DEFAULTS, null, 2))
    return DEFAULTS
  }
})
