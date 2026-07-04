import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { analyzeGCode } from './analysis'
import type { GCodeLine, GCodeModalState } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const CURRENT_JOB_DIR = join(DATA_DIR, 'current_job')
const MODAL_STATES_PATH = join(CURRENT_JOB_DIR, 'modal-states.json')

/**
 * Re-analyse the raw content from `glines` and return the modal state recorded
 * immediately after `targetIndex` executed. Used in tests and recovery tooling
 * where the full analysis artefact is not available on disk.
 */
export function simulateToLine(glines: GCodeLine[], targetIndex: number): GCodeModalState {
  const defaultState: GCodeModalState = {
    position: { x: 0, y: 0, z: 0 },
    positionMode: 'G90',
    workCoordinate: 'G54',
    feedRate: 0,
    spindleSpeed: 0,
    spindleMode: 'M5',
    coolant: 'off',
    units: 'G21',
    plane: 'G17',
    motionMode: 'G0',
    toolNumber: 0,
  }
  if (glines.length === 0) return defaultState
  const content = glines.map(l => l.raw).join('\n')
  const { modalStates } = analyzeGCode(content)
  const idx = Math.max(0, Math.min(targetIndex, modalStates.length - 1))
  return modalStates[idx] ?? defaultState
}

/**
 * Return the modal state (position, units, spindle, etc.) recorded immediately
 * after line `lineIndex` executed. Used only during crash recovery — reads from
 * the modal-states.json artefact written at analysis time so no in-memory
 * re-parsing is needed.
 */
export async function getModalStateAtLine(lineIndex: number): Promise<GCodeModalState | null> {
  try {
    const raw = await readFile(MODAL_STATES_PATH, 'utf8')
    const states = JSON.parse(raw) as GCodeModalState[]
    return states[lineIndex] ?? null
  } catch {
    return null
  }
}
