import { readFile, access } from 'node:fs/promises'
import { join, resolve, basename } from 'node:path'
import { constants } from 'node:fs'

function stripUuidPrefix(name: string): string {
  return name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
}

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawPath = (query.path as string | undefined)?.trim() ?? ''

  if (!rawPath) {
    throw createError({ statusCode: 400, message: 'path is required' })
  }

  const absPath = resolve(join(UPLOADS_DIR, rawPath))
  if (!absPath.startsWith(UPLOADS_DIR + '/')) {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  try {
    await access(absPath, constants.R_OK)
  } catch {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  const displayName = stripUuidPrefix(basename(rawPath))
  const encoded = encodeURIComponent(displayName)
  setHeader(event, 'Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`)
  setHeader(event, 'Content-Type', 'application/octet-stream')

  return readFile(absPath)
})
