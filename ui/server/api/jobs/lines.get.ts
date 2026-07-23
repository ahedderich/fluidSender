import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CompactGCodeLine } from '../../utils/gcode/lineCodec'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const CURRENT_JOB_DIR = join(DATA_DIR, 'current_job')

export default defineEventHandler(async (event) => {
  const rawId = getQuery(event).fileId as string | undefined

  if (!rawId) throw createError({ statusCode: 400, message: 'fileId query parameter required' })

  try {
    // Verify the current_job analysis belongs to the requested file.
    // fileId may include subdirectory segments (e.g. "test/holes.nc") — it's only ever
    // compared for identity here, never used to build a filesystem path, so no
    // basename()/traversal sanitisation is needed.
    const analysisRaw = await readFile(join(CURRENT_JOB_DIR, 'analysis.json'), 'utf8')
    const analysis = JSON.parse(analysisRaw) as { fileId?: string }
    if (analysis.fileId !== rawId) {
      throw createError({ statusCode: 404, message: 'Lines not found — job not analysed yet' })
    }

    // There's no separate lean lines-text.json artefact anymore — lines.json's
    // compact wire format (lineCodec.ts) is already small enough that deriving
    // the raw-text-only response from it here isn't worth a second on-disk copy.
    const raw = await readFile(join(CURRENT_JOB_DIR, 'lines.json'), 'utf8')
    const compact = JSON.parse(raw) as CompactGCodeLine[]
    setHeader(event, 'Content-Type', 'application/json')
    // No client-side caching: this URL is keyed only on fileId, not on analysis
    // content, so a stale cached response here can silently outlive a format
    // or content change for the same file (e.g. re-running the analyzer). The
    // endpoint is a cheap disk read, not a computation, so there's no real
    // cost to always refetching.
    setHeader(event, 'Cache-Control', 'no-store')
    return JSON.stringify(compact.map((c) => c.r))
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError({ statusCode: 404, message: 'Lines not found — job not analysed yet' })
    }
    if ((err as { statusCode?: number }).statusCode) throw err
    throw createError({ statusCode: 500, message: (err as Error).message })
  }
})
