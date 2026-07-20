import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { analyzeGCode } from './analysis'
import type { CompactGCodeLine } from './lineCodec'
import type { GCodeLine, GCodeModalState, ModalStateCheckpoint, TransformMode } from './types'
import { subdirForMode } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'

// getModalStateAtLine() is called repeatedly per job (resume/pause/toolchange). These
// caches avoid re-reading+re-parsing modal-states.json and lines.json from disk on
// every call. Invalidated by analyzer.ts whenever it writes or clears those
// artefacts, and by jobRunner.clear() on a full reset.
const modalStatesCache = new Map<string, ModalStateCheckpoint[]>()
const rawLinesCache = new Map<string, string[]>()

function modalStatesPath(mode: TransformMode): string {
  const sub = subdirForMode(mode)
  const dir = sub ? join(DATA_DIR, 'current_job', sub) : join(DATA_DIR, 'current_job')
  return join(dir, 'modal-states.json')
}

function linesPath(mode: TransformMode): string {
  const sub = subdirForMode(mode)
  const dir = sub ? join(DATA_DIR, 'current_job', sub) : join(DATA_DIR, 'current_job')
  return join(dir, 'lines.json')
}

/** Drop cached modal states (and their paired raw lines) for one mode, or all modes if none is given. */
export function invalidateModalStatesCache(mode?: TransformMode): void {
  if (mode) {
    modalStatesCache.delete(modalStatesPath(mode))
    rawLinesCache.delete(linesPath(mode))
  } else {
    modalStatesCache.clear()
    rawLinesCache.clear()
  }
}

/** Binary search for the checkpoint with the largest lineIndex <= target. Checkpoints are sorted ascending. */
function floorCheckpoint(checkpoints: ModalStateCheckpoint[], target: number): ModalStateCheckpoint | null {
  let lo = 0
  let hi = checkpoints.length - 1
  let result: ModalStateCheckpoint | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (checkpoints[mid]!.lineIndex <= target) {
      result = checkpoints[mid]!
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}

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
  // Default modalCheckpointInterval (1) — dense, one checkpoint per line, so
  // checkpoints[idx].lineIndex === idx and positional indexing still holds.
  const { modalStates } = analyzeGCode(content)
  const idx = Math.max(0, Math.min(targetIndex, modalStates.length - 1))
  return modalStates[idx]?.state ?? defaultState
}

/**
 * Return the modal state (position, units, spindle, etc.) recorded immediately
 * after line `lineIndex` executed. Used only during crash recovery.
 *
 * modal-states.json is a sparse checkpoint array (one entry every
 * MODAL_CHECKPOINT_INTERVAL lines, see analysis.ts) rather than one entry per line —
 * a dense array would be 149MB for a 668k-line file to serve what's only ever a
 * handful of point lookups per job. This finds the nearest checkpoint at or before
 * lineIndex and, if it isn't an exact hit, replays forward over just the (at most
 * MODAL_CHECKPOINT_INTERVAL - 1) raw lines between the checkpoint and the target.
 */
export async function getModalStateAtLine(lineIndex: number, mode: TransformMode = 'none'): Promise<GCodeModalState | null> {
  try {
    const modalPath = modalStatesPath(mode)
    let checkpoints = modalStatesCache.get(modalPath)
    if (!checkpoints) {
      const raw = await readFile(modalPath, 'utf8')
      checkpoints = JSON.parse(raw) as ModalStateCheckpoint[]
      modalStatesCache.set(modalPath, checkpoints)
    }

    const floor = floorCheckpoint(checkpoints, lineIndex)
    if (!floor) return null
    if (floor.lineIndex === lineIndex) return floor.state

    const linesPathStr = linesPath(mode)
    let rawLines = rawLinesCache.get(linesPathStr)
    if (!rawLines) {
      const raw = await readFile(linesPathStr, 'utf8')
      rawLines = (JSON.parse(raw) as CompactGCodeLine[]).map((c) => c.r)
      rawLinesCache.set(linesPathStr, rawLines)
    }
    // Preserve the previous dense-array contract: an out-of-range index returns
    // null rather than silently clamping to the last line via slice().
    if (lineIndex < 0 || lineIndex >= rawLines.length) return null

    const slice = rawLines.slice(floor.lineIndex + 1, lineIndex + 1)
    if (slice.length === 0) return floor.state

    const { modalStates } = analyzeGCode(slice.join('\n'), undefined, undefined, floor.state)
    return modalStates[modalStates.length - 1]?.state ?? floor.state
  } catch {
    return null
  }
}
