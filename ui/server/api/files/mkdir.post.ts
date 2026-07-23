import { mkdir } from 'node:fs/promises'
import { sanitizeFolderPath, resolveUploadPath } from '../../utils/uploadPaths'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { path?: string }
  const rawPath = body.path?.trim() ?? ''

  if (!rawPath) {
    throw createError({ statusCode: 400, message: 'path is required' })
  }

  const safePath = sanitizeFolderPath(rawPath)
  if (!safePath) {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  const absPath = resolveUploadPath(safePath)
  await mkdir(absPath, { recursive: true })
  return { ok: true, path: safePath }
})
