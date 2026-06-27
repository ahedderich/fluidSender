import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { preprocessGCode } from './preprocessor'
import type { JobAnalysis, PathSegment, ToolSection } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')
const CURRENT_JOB_DIR = join(DATA_DIR, 'current_job')

const ANALYSIS_PATH = join(CURRENT_JOB_DIR, 'analysis.json')
const VECTORS_PATH = join(CURRENT_JOB_DIR, 'vectors.json')

export async function loadCachedAnalysis(fileId: string): Promise<JobAnalysis | null> {
  try {
    const raw = await readFile(ANALYSIS_PATH, 'utf8')
    const a = JSON.parse(raw) as JobAnalysis
    if (a.version !== 1 || a.fileId !== fileId) return null
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
    if (a.version !== 1) return null
    return a
  } catch {
    return null
  }
}

export async function clearAnalysis(): Promise<void> {
  await Promise.allSettled([
    unlink(ANALYSIS_PATH),
    unlink(VECTORS_PATH),
  ])
}

/**
 * Tessellate a circular arc (XY plane, helical Z) into a sequence of 3D points.
 * i/j are center offsets relative to the start position.
 */
function tessellateArc(
  sx: number, sy: number, sz: number,
  ex: number, ey: number, ez: number,
  i: number, j: number,
  cw: boolean,
  numSegs = 32,
): Array<[number, number, number]> {
  const cx = sx + i
  const cy = sy + j
  const r = Math.sqrt(i * i + j * j)

  const startAngle = Math.atan2(sy - cy, sx - cx)
  const endAngle = Math.atan2(ey - cy, ex - cx)

  let sweep: number
  if (cw) {
    sweep = startAngle - endAngle
    if (sweep <= 0) sweep += 2 * Math.PI
  } else {
    sweep = endAngle - startAngle
    if (sweep <= 0) sweep += 2 * Math.PI
  }

  // Full-circle: start ≈ end
  if (Math.hypot(ex - sx, ey - sy) < 1e-6) sweep = 2 * Math.PI

  const pts: Array<[number, number, number]> = []
  for (let k = 1; k <= numSegs; k++) {
    const t = k / numSegs
    const angle = cw ? startAngle - t * sweep : startAngle + t * sweep
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle), sz + (ez - sz) * t])
  }
  return pts
}

/**
 * Analyse a GCode file: extract tool sections, build 3D path segments,
 * compute time estimate, then persist results alongside the GCode file.
 *
 * onProgress receives 0–100 values at key milestones.
 * Throws with message 'Aborted' if signal fires before completion.
 */
export async function analyzeGCodeFile(
  fileId: string,
  filename: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<JobAnalysis> {
  onProgress(0)

  const content = await readFile(join(UPLOADS_DIR, fileId), 'utf8')
  if (signal.aborted) throw new Error('Aborted')
  onProgress(10)

  const { lines, axisRanges } = preprocessGCode(content)
  if (signal.aborted) throw new Error('Aborted')
  onProgress(75)

  // ── Tool section extraction ───────────────────────────────────────────────
  const tools: ToolSection[] = [
    { toolNumber: 0, toolChangeCmd: null, startLine: 0, endLine: lines.length - 1 },
  ]
  let pendingTool = 0

  for (const line of lines) {
    const clean = line.raw.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim().toUpperCase()
    const tMatch = /\bT(\d+)/.exec(clean)
    if (tMatch) pendingTool = parseInt(tMatch[1], 10)

    if (/\bM0?6\b/.test(clean)) {
      // Close previous section at the line before this tool change
      tools[tools.length - 1].endLine = line.index > 0 ? line.index - 1 : 0
      tools.push({
        toolNumber: pendingTool,
        toolChangeCmd: line.raw.trim(),
        startLine: line.index,
        endLine: lines.length - 1,
      })
    }
  }
  if (signal.aborted) throw new Error('Aborted')
  onProgress(85)

  // ── 3D path segment extraction ────────────────────────────────────────────
  // Build a lookup: lineIndex → toolSectionIndex (binary search would be faster
  // for huge files, but a running pointer is O(n) and simpler)
  const segments: PathSegment[] = []
  let cx = 0, cy = 0, cz = 0
  let sIdx = 0

  for (const line of lines) {
    // Advance section pointer when we pass the next section's start
    while (sIdx + 1 < tools.length && line.index >= tools[sIdx + 1].startLine) sIdx++

    if (line.toPos !== undefined) {
      const [tx, ty, tz] = line.toPos

      if (line.type === 'arc' && line.arcI !== undefined && line.arcJ !== undefined) {
        // Tessellate arc into short segments so it renders as a true curve
        const pts = tessellateArc(cx, cy, cz, tx, ty, tz, line.arcI, line.arcJ, line.arcCw ?? false)
        let px = cx, py = cy, pz = cz
        for (const [nx, ny, nz] of pts) {
          if (nx !== px || ny !== py || nz !== pz)
            segments.push({ t: 'A', x0: px, y0: py, z0: pz, x1: nx, y1: ny, z1: nz, s: sIdx })
          px = nx; py = ny; pz = nz
        }
      } else if (tx !== cx || ty !== cy || tz !== cz) {
        const segType = line.type === 'rapid' ? 'R' : 'F'
        segments.push({ t: segType, x0: cx, y0: cy, z0: cz, x1: tx, y1: ty, z1: tz, s: sIdx })
      }

      cx = tx; cy = ty; cz = tz
    }
  }
  if (signal.aborted) throw new Error('Aborted')
  onProgress(95)

  const estimatedTotalMs = lines.at(-1)?.cumulativeDurationMs ?? 0

  const analysis: JobAnalysis = {
    version: 1,
    fileId,
    filename,
    analyzedAt: Date.now(),
    totalLines: lines.length,
    estimatedTotalMs,
    axisRanges,
    tools,
  }

  await mkdir(CURRENT_JOB_DIR, { recursive: true })
  await Promise.all([
    writeFile(ANALYSIS_PATH, JSON.stringify(analysis), 'utf8'),
    writeFile(VECTORS_PATH, JSON.stringify(segments), 'utf8'),
  ])

  if (signal.aborted) {
    // Remove partially-written files if abort raced with save
    await clearAnalysis()
    throw new Error('Aborted')
  }

  return analysis
}
