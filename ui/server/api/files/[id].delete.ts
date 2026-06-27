import { unlink } from 'node:fs/promises'
import { join, basename } from 'node:path'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')

export default defineEventHandler(async (event) => {
  const rawId = getRouterParam(event, 'id') ?? ''

  // Sanitise: strip any path traversal and ensure the ID stays within UPLOADS_DIR
  const safeId = basename(rawId)
  if (!safeId || safeId !== rawId) {
    throw createError({ statusCode: 400, message: 'Invalid file id' })
  }

  try {
    await unlink(join(UPLOADS_DIR, safeId))
    return { ok: true }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError({ statusCode: 404, message: 'File not found' })
    }
    throw createError({ statusCode: 500, message: (err as Error).message })
  }
})
