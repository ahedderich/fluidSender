import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')

export default defineEventHandler(async () => {
  try {
    const entries = await readdir(UPLOADS_DIR)
    const files = await Promise.all(
      entries
        .filter((name) => !name.startsWith('.'))
        .map(async (name) => {
          const info = await stat(join(UPLOADS_DIR, name))
          return {
            id: name,
            // Strip the UUID prefix to get a human-readable name
            name: name.replace(/^[0-9a-f]{8}-[0-9a-f-]+-/i, ''),
            size: info.size,
            modifiedAt: info.mtimeMs,
          }
        }),
    )
    // Sort newest first
    files.sort((a, b) => b.modifiedAt - a.modifiedAt)
    return { files }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { files: [] }
    throw createError({ statusCode: 500, message: (err as Error).message })
  }
})
