import type { GCodeLine, GCodeModalState } from './types'

const DEFAULT_MODAL_STATE: GCodeModalState = {
  position: { x: 0, y: 0, z: 0 },
  positionMode: 'G90',
  workCoordinate: 'G54',
  feedRate: 0,
  spindleSpeed: 0,
  spindleMode: 'M5',
  coolant: 'off',
  units: 'G21',
  plane: 'G17',
  toolNumber: 0,
}

/** Parse a word value like `X-12.5` → -12.5. Returns undefined if not present. */
function word(clean: string, letter: string): number | undefined {
  const re = new RegExp(`${letter}([+-]?\\d*\\.?\\d+)`, 'i')
  const m = re.exec(clean)
  return m ? parseFloat(m[1]) : undefined
}

function resolveTarget(
  clean: string,
  state: GCodeModalState,
): { x: number; y: number; z: number } {
  const xw = word(clean, 'X')
  const yw = word(clean, 'Y')
  const zw = word(clean, 'Z')
  if (state.positionMode === 'G91') {
    return {
      x: state.position.x + (xw ?? 0),
      y: state.position.y + (yw ?? 0),
      z: state.position.z + (zw ?? 0),
    }
  }
  return {
    x: xw ?? state.position.x,
    y: yw ?? state.position.y,
    z: zw ?? state.position.z,
  }
}

function applyLine(clean: string, state: GCodeModalState): void {
  // Motion commands — update position
  if (
    /\bG0?[0123]\b/.test(clean) ||
    /\bG0\b/.test(clean) ||
    /\bG00\b/.test(clean)
  ) {
    const target = resolveTarget(clean, state)
    state.position = target
  }

  // Position mode
  if (/\bG90\b/.test(clean)) state.positionMode = 'G90'
  if (/\bG91\b/.test(clean)) state.positionMode = 'G91'

  // Work coordinate systems
  if (/\bG54\b/.test(clean)) state.workCoordinate = 'G54'
  if (/\bG55\b/.test(clean)) state.workCoordinate = 'G55'
  if (/\bG56\b/.test(clean)) state.workCoordinate = 'G56'
  if (/\bG57\b/.test(clean)) state.workCoordinate = 'G57'
  if (/\bG58\b/.test(clean)) state.workCoordinate = 'G58'
  if (/\bG59\b/.test(clean)) state.workCoordinate = 'G59'

  // Units
  if (/\bG20\b/.test(clean)) state.units = 'G20'
  if (/\bG21\b/.test(clean)) state.units = 'G21'

  // Plane selection
  if (/\bG17\b/.test(clean)) state.plane = 'G17'
  if (/\bG18\b/.test(clean)) state.plane = 'G18'
  if (/\bG19\b/.test(clean)) state.plane = 'G19'

  // Feed rate
  const fWord = word(clean, 'F')
  if (fWord !== undefined) state.feedRate = fWord

  // Spindle speed
  const sWord = word(clean, 'S')
  if (sWord !== undefined) state.spindleSpeed = sWord

  // Spindle mode
  if (/\bM0?3\b/.test(clean)) state.spindleMode = 'M3'
  if (/\bM0?4\b/.test(clean)) state.spindleMode = 'M4'
  if (/\bM0?5\b/.test(clean)) state.spindleMode = 'M5'

  // Coolant
  if (/\bM0?7\b/.test(clean)) state.coolant = 'M7'
  if (/\bM0?8\b/.test(clean)) state.coolant = 'M8'
  if (/\bM0?9\b/.test(clean)) state.coolant = 'off'

  // Tool number
  const tWord = word(clean, 'T')
  if (tWord !== undefined) state.toolNumber = tWord
}

function stripComments(raw: string): string {
  return raw.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim().toUpperCase()
}

/**
 * Pure function. Virtually executes GCode lines 0..targetIndex and returns
 * the modal state at that point. Used for crash recovery and pause-resume.
 * Never has side effects.
 */
export function simulateToLine(lines: GCodeLine[], targetIndex: number): GCodeModalState {
  const state: GCodeModalState = structuredClone(DEFAULT_MODAL_STATE)
  const limit = Math.min(targetIndex, lines.length - 1)

  for (let i = 0; i <= limit; i++) {
    const clean = stripComments(lines[i].raw)
    if (clean) applyLine(clean, state)
  }

  return state
}
