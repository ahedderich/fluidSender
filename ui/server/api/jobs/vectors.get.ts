import { readFile } from 'node:fs/promises'
import { jobPaths } from '../../utils/gcode/analyzer'
import { jobRunner } from '../../utils/gcode/jobRunner'

export default defineEventHandler(async (event) => {
  const rawId = getQuery(event).fileId as string | undefined

  if (!rawId) throw createError({ statusCode: 400, message: 'fileId query parameter required' })

  try {
    // Always read from jobRunner's own active transform mode, not a client-supplied
    // one — this is the same mode loadJob() last used to produce `lines` (what cycle
    // start actually sends), so it's the only place "current" can mean anything. If a
    // future change ever lets the sender resume/re-send without a full loadJob() re-run,
    // this equivalence needs re-checking.
    const paths = jobPaths(jobRunner.transformMode)

    // Verify the on-disk analysis belongs to the requested file.
    // fileId may include subdirectory segments (e.g. "test/holes.nc") — it's only ever
    // compared for identity here, never used to build a filesystem path, so no
    // basename()/traversal sanitisation is needed.
    const analysisRaw = await readFile(paths.analysis, 'utf8')
    const analysis = JSON.parse(analysisRaw) as { fileId?: string }
    if (analysis.fileId !== rawId) {
      throw createError({ statusCode: 404, message: 'Vectors not found — job not analysed yet' })
    }

    const raw = await readFile(paths.vectors, 'utf8')
    setHeader(event, 'Content-Type', 'application/json')
    // No client-side caching: this URL is keyed only on fileId, not on analysis
    // content, so a stale cached response here can silently outlive a format
    // or content change for the same file (e.g. re-running the analyzer). The
    // endpoint is a cheap disk read, not a computation, so there's no real
    // cost to always refetching. (See the identical note on lines.get.ts.)
    setHeader(event, 'Cache-Control', 'no-store')
    return raw
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError({ statusCode: 404, message: 'Vectors not found — job not analysed yet' })
    }
    if ((err as { statusCode?: number }).statusCode) throw err
    throw createError({ statusCode: 500, message: (err as Error).message })
  }
})
