import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { readMeta, type ExecutionRecord } from '../utils/fileMetadata'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')
const NC_EXTS = new Set(['.nc', '.gcode', '.cnc', '.tap', '.ngc'])

function isNcFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot >= 0 && NC_EXTS.has(name.slice(dot).toLowerCase())
}

export function stripUuidPrefix(name: string): string {
  return name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
}

function validateDir(dir: string): string {
  if (!dir) return UPLOADS_DIR
  const abs = resolve(join(UPLOADS_DIR, dir))
  if (abs !== UPLOADS_DIR && !abs.startsWith(UPLOADS_DIR + '/')) {
    throw createError({ statusCode: 400, message: 'Invalid directory path' })
  }
  return abs
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const dir = (query.dir as string | undefined)?.trim() ?? ''

  const absDir = validateDir(dir)

  const relPrefix = dir ? dir.replace(/\/$/, '') + '/' : ''

  try {
    const entries = await readdir(absDir, { withFileTypes: true })

    const folders: {
      type: 'folder'; name: string; path: string; childCount: number
    }[] = []

    const files: {
      type: 'file'
      name: string
      path: string
      size: number
      uploadedAt: number
      isNc: boolean
      lastExecution: ExecutionRecord | null
      totalSuccessful: number
      totalFailed: number
    }[] = []

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === '_meta') continue

      const relPath = relPrefix + entry.name

      if (entry.isDirectory()) {
        let childCount = 0
        try {
          const children = await readdir(join(absDir, entry.name))
          childCount = children.filter((n) => !n.startsWith('.') && n !== '_meta').length
        } catch { /* ignore unreadable dirs */ }
        folders.push({ type: 'folder', name: entry.name, path: relPath, childCount })
      } else if (entry.isFile()) {
        const info = await stat(join(absDir, entry.name))
        const meta = await readMeta(relPath)
        const executions = meta?.executions ?? []
        const last = executions.length > 0 ? executions[executions.length - 1] ?? null : null
        files.push({
          type: 'file',
          name: stripUuidPrefix(entry.name),
          path: relPath,
          size: info.size,
          uploadedAt: meta?.uploadedAt ?? info.mtimeMs,
          isNc: isNcFile(entry.name),
          lastExecution: last,
          totalSuccessful: executions.filter((e) => e.status === 'success').length,
          totalFailed: executions.filter((e) => e.status !== 'success').length,
        })
      }
    }

    return { folders, files }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { folders: [], files: [] }
    throw createError({ statusCode: 500, message: (err as Error).message })
  }
})
