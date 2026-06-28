import { basename } from 'node:path'
import { jobRunner } from '../../utils/gcode/jobRunner'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { fileId?: string }
  const rawId = body.fileId

  if (!rawId || typeof rawId !== 'string') {
    throw createError({ statusCode: 400, message: 'fileId is required' })
  }

  const safeId = basename(rawId)
  if (!safeId || safeId !== rawId) {
    throw createError({ statusCode: 400, message: 'Invalid fileId' })
  }

  // Kick off async — state changes are broadcast to all clients via WS patches
  jobRunner.loadJob(safeId).catch((err: unknown) => {
    console.error('[jobs/load] unhandled error from jobRunner.loadJob:', err)
  })

  return { ok: true }
})
