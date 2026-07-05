import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { path?: string }
  const rawPath = body.path?.trim() ?? ''

  if (!rawPath) {
    throw createError({ statusCode: 400, message: 'path is required' })
  }

  // Sanitize each path segment
  const safePath = rawPath
    .split('/')
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128))
    .filter(Boolean)
    .join('/')

  if (!safePath) {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  const absPath = resolve(join(UPLOADS_DIR, safePath))
  if (!absPath.startsWith(UPLOADS_DIR + '/')) {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  await mkdir(absPath, { recursive: true })
  return { ok: true, path: safePath }
})
