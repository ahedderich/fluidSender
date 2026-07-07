import { unlink, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { deleteMeta } from '../utils/fileMetadata'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawPath = (query.path as string | undefined)?.trim() ?? ''
  const isFolder = (query.type as string | undefined) === 'folder'

  if (!rawPath) {
    throw createError({ statusCode: 400, message: 'path is required' })
  }

  const absPath = resolve(join(UPLOADS_DIR, rawPath))
  if (!absPath.startsWith(UPLOADS_DIR + '/')) {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  try {
    if (isFolder) {
      await rm(absPath, { recursive: true, force: true })
    } else {
      await unlink(absPath)
    }
    await deleteMeta(rawPath, isFolder)
    return { ok: true }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError({ statusCode: 404, message: 'Not found' })
    }
    throw createError({ statusCode: 500, message: (err as Error).message })
  }
})
