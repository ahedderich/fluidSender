import { resolve, join } from 'node:path'
import { jobRunner } from '../../utils/gcode/jobRunner'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { fileId?: string }
  const rawId = body.fileId

  if (!rawId || typeof rawId !== 'string') {
    throw createError({ statusCode: 400, message: 'fileId is required' })
  }

  // Allow subdirectory paths but reject traversal
  const absPath = resolve(join(UPLOADS_DIR, rawId))
  if (!absPath.startsWith(UPLOADS_DIR + '/')) {
    throw createError({ statusCode: 400, message: 'Invalid fileId' })
  }
  const safeId = absPath.slice(UPLOADS_DIR.length + 1)

  jobRunner.loadJob(safeId).catch((err: unknown) => {
    console.error('[jobs/load] unhandled error from jobRunner.loadJob:', err)
  })

  return { ok: true }
})
