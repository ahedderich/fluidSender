import { jobRunner } from '../../utils/gcode/jobRunner'
import { resolveUploadPath, UPLOADS_DIR } from '../../utils/uploadPaths'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { fileId?: string }
  const rawId = body.fileId

  if (!rawId || typeof rawId !== 'string') {
    throw createError({ statusCode: 400, message: 'fileId is required' })
  }

  // Allow subdirectory paths but reject traversal
  const absPath = resolveUploadPath(rawId)
  if (absPath === UPLOADS_DIR) {
    throw createError({ statusCode: 400, message: 'Invalid fileId' })
  }
  const safeId = absPath.slice(UPLOADS_DIR.length + 1)

  jobRunner.loadJob(safeId).catch((err: unknown) => {
    console.error('[jobs/load] unhandled error from jobRunner.loadJob:', err)
  })

  return { ok: true }
})
