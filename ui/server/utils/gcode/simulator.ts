import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GCodeModalState } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const CURRENT_JOB_DIR = join(DATA_DIR, 'current_job')
const MODAL_STATES_PATH = join(CURRENT_JOB_DIR, 'modal-states.json')

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
