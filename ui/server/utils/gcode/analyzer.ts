import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { analyzeGCode } from './analysis'
import type { GCodeLine, JobAnalysis } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')
const CURRENT_JOB_DIR = join(DATA_DIR, 'current_job')

const ANALYSIS_PATH = join(CURRENT_JOB_DIR, 'analysis.json')
const VECTORS_PATH = join(CURRENT_JOB_DIR, 'vectors.json')
const MODAL_STATES_PATH = join(CURRENT_JOB_DIR, 'modal-states.json')

export async function loadCachedAnalysis(fileId: string): Promise<JobAnalysis | null> {
  try {
    const raw = await readFile(ANALYSIS_PATH, 'utf8')
    const a = JSON.parse(raw) as JobAnalysis
    if (a.version !== 3 || a.fileId !== fileId) return null
    return a
  } catch {
    return null
  }
}

/** Read analysis.json without knowing the fileId in advance (used on server boot). */
export async function loadRawAnalysis(): Promise<JobAnalysis | null> {
  try {
    const raw = await readFile(ANALYSIS_PATH, 'utf8')
    const a = JSON.parse(raw) as JobAnalysis
    if (a.version !== 3) return null
    return a
  } catch {
    return null
  }
}

export async function clearAnalysis(): Promise<void> {
  await Promise.allSettled([
    unlink(ANALYSIS_PATH),
    unlink(VECTORS_PATH),
    unlink(MODAL_STATES_PATH),
  ])
}

/**
 * Analyse a GCode file: run single-pass analysis, then persist all three artefacts.
 * Returns the analysis metadata and the in-memory line array (so the caller does not
 * need to re-read or re-parse the file).
 *
 * onProgress receives 0–100 values at key milestones.
 * Throws with message 'Aborted' if signal fires before completion.
 */
export async function analyzeGCodeFile(
  fileId: string,
  filename: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<{ analysis: JobAnalysis; lines: GCodeLine[] }> {
  onProgress(0)

  const content = await readFile(join(UPLOADS_DIR, fileId), 'utf8')
  if (signal.aborted) throw new Error('Aborted')
  onProgress(10)

  const { lines, vectors, modalStates, tools, axisRanges, estimatedTotalMs, noToolDefinitions, headerToolDefs } = analyzeGCode(content)
  if (signal.aborted) throw new Error('Aborted')
  onProgress(80)

  const analysis: JobAnalysis = {
    version: 3,
    fileId,
    filename,
    analyzedAt: Date.now(),
    totalLines: lines.length,
    estimatedTotalMs,
    axisRanges,
    tools,
    noToolDefinitions,
    headerToolDefs,
  }

  await mkdir(CURRENT_JOB_DIR, { recursive: true })
  await Promise.all([
    writeFile(ANALYSIS_PATH, JSON.stringify(analysis), 'utf8'),
    writeFile(VECTORS_PATH, JSON.stringify(vectors), 'utf8'),
    writeFile(MODAL_STATES_PATH, JSON.stringify(modalStates), 'utf8'),
  ])

  if (signal.aborted) {
    await clearAnalysis()
    throw new Error('Aborted')
  }

  onProgress(100)
  return { analysis, lines }
}
