import { readFile, writeFile, unlink, mkdir, readdir, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { analyzeGCode, MODAL_CHECKPOINT_INTERVAL } from './analysis'
import { invalidateModalStatesCache } from './simulator'
import { encodeLines, decodeLines, type CompactGCodeLine } from './lineCodec'
import type { GCodeLine, JobAnalysis, TransformMode } from './types'
import { subdirForMode } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const BASE_JOB_DIR = join(DATA_DIR, 'current_job')
const ANALYSIS_VERSION = 5

function getJobDir(mode: TransformMode): string {
  const sub = subdirForMode(mode)
  return sub ? join(BASE_JOB_DIR, sub) : BASE_JOB_DIR
}

function jobPaths(mode: TransformMode) {
  const dir = getJobDir(mode)
  return {
    analysis: join(dir, 'analysis.json'),
    vectors: join(dir, 'vectors.json'),
    modal: join(dir, 'modal-states.json'),
    // Compact wire format (lineCodec.ts) — also serves the GCode text panel
    // directly (see /api/jobs/lines.get.ts), so there's no separate lean
    // lines-text.json anymore: the overhead of the full compact row over bare
    // raw text is small enough not to justify maintaining two artefacts.
    lines: join(dir, 'lines.json'),
  }
}

export async function loadCachedAnalysis(fileId: string, mode: TransformMode = 'none'): Promise<JobAnalysis | null> {
  try {
    const raw = await readFile(jobPaths(mode).analysis, 'utf8')
    const a = JSON.parse(raw) as JobAnalysis
    if (a.version !== ANALYSIS_VERSION || a.fileId !== fileId) return null
    return a
  } catch {
    return null
  }
}

/**
 * Read the cached lines.json artefact written alongside analysis.json by the same
 * analyzeGCodeFile() call, decoding it back into the full GCodeLine[] shape.
 * Only meaningful once loadCachedAnalysis() has confirmed a matching, current
 * analysis exists — this function trusts that pairing rather than re-validating
 * fileId itself, since the two files are always written together.
 */
export async function loadCachedLines(mode: TransformMode = 'none'): Promise<GCodeLine[] | null> {
  try {
    const raw = await readFile(jobPaths(mode).lines, 'utf8')
    return decodeLines(JSON.parse(raw) as CompactGCodeLine[])
  } catch {
    return null
  }
}

/** Read analysis.json without knowing the fileId in advance (used on server boot). */
export async function loadRawAnalysis(mode: TransformMode = 'none'): Promise<JobAnalysis | null> {
  try {
    const raw = await readFile(jobPaths(mode).analysis, 'utf8')
    const a = JSON.parse(raw) as JobAnalysis
    if (a.version !== ANALYSIS_VERSION) return null
    return a
  } catch {
    return null
  }
}

export async function clearAnalysis(mode: TransformMode = 'none'): Promise<void> {
  const paths = jobPaths(mode)
  invalidateModalStatesCache(mode)
  await Promise.allSettled([
    unlink(paths.analysis),
    unlink(paths.vectors),
    unlink(paths.modal),
    unlink(paths.lines),
  ])
}

/** Clear all transform-variant subfolders (not the base folder). */
export async function clearAllTransformArtefacts(): Promise<void> {
  const modes: TransformMode[] = ['rotated', 'height_adjusted', 'rotated_height_adjusted']
  for (const mode of modes) {
    invalidateModalStatesCache(mode)
    const dir = getJobDir(mode)
    try {
      const entries = await readdir(dir)
      await Promise.allSettled(entries.map((f) => unlink(join(dir, f))))
      await rmdir(dir)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[analyzer] clearAllTransformArtefacts error for ${mode}:`, err)
      }
    }
  }
}

/**
 * Analyse a GCode string: run single-pass analysis, then persist all three artefacts.
 * Returns the analysis metadata and the in-memory line array.
 *
 * onProgress receives 0–100 values at key milestones.
 * Throws with message 'Aborted' if signal fires before completion.
 */
export async function analyzeGCodeFile(
  fileId: string,
  filename: string,
  content: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
  mode: TransformMode = 'none',
): Promise<{ analysis: JobAnalysis; lines: GCodeLine[] }> {
  onProgress(0)

  if (signal.aborted) throw new Error('Aborted')

  const tAnalyze0 = performance.now()
  // The line-by-line pass is the bulk of the work — map its own 0-100 progress
  // into the 10-80 band instead of jumping straight from 10 to 80.
  const { lines, vectors, modalStates, tools, axisRanges, estimatedTotalMs, noToolDefinitions, generator, generatorInfo } = analyzeGCode(
    content,
    undefined,
    (innerPct) => {
      if (signal.aborted) return
      onProgress(10 + Math.round(innerPct * 0.7))
    },
    // No initial-state seed — this is always a full-file, from-scratch analysis.
    undefined,
    // Sparse checkpoints: modal-states.json only needs point lookups (pause/resume/
    // toolchange), never a dense per-line array — see getModalStateAtLine().
    MODAL_CHECKPOINT_INTERVAL,
  )
  const tAnalyze1 = performance.now()
  if (signal.aborted) throw new Error('Aborted')
  onProgress(80)

  const analysis: JobAnalysis = {
    version: ANALYSIS_VERSION,
    fileId,
    filename,
    analyzedAt: Date.now(),
    totalLines: lines.length,
    estimatedTotalMs,
    axisRanges,
    tools,
    noToolDefinitions,
    generator,
    generatorInfo,
  }

  const tSerialize0 = performance.now()
  const paths = jobPaths(mode)
  await mkdir(getJobDir(mode), { recursive: true })
  await Promise.all([
    writeFile(paths.analysis, JSON.stringify(analysis), 'utf8'),
    writeFile(paths.vectors, JSON.stringify(vectors), 'utf8'),
    writeFile(paths.modal, JSON.stringify(modalStates), 'utf8'),
    writeFile(paths.lines, JSON.stringify(encodeLines(lines)), 'utf8'),
  ])
  const tSerialize1 = performance.now()

  // The just-written modal-states.json supersedes whatever (if anything) was cached
  // in memory for this mode — drop it so the next getModalStateAtLine() re-reads fresh.
  invalidateModalStatesCache(mode)

  console.log(
    `[perf] analyzeGCodeFile(${fileId}): analyze=${(tAnalyze1 - tAnalyze0).toFixed(0)}ms ` +
    `serialize=${(tSerialize1 - tSerialize0).toFixed(0)}ms lines=${lines.length}`,
  )

  if (signal.aborted) {
    await clearAnalysis(mode)
    throw new Error('Aborted')
  }

  onProgress(100)
  return { analysis, lines }
}
