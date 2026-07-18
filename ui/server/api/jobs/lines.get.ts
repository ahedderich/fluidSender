import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

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

    const raw = await readFile(join(CURRENT_JOB_DIR, 'lines.json'), 'utf8')
    setHeader(event, 'Content-Type', 'application/json')
    setHeader(event, 'Cache-Control', 'private, max-age=3600')
    return raw
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError({ statusCode: 404, message: 'Lines not found — job not analysed yet' })
    }
    if ((err as { statusCode?: number }).statusCode) throw err
    throw createError({ statusCode: 500, message: (err as Error).message })
  }
})
