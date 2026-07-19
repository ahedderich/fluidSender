import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { readMeta, type ExecutionRecord } from './fileMetadata'
import { resolveUploadPath } from './uploadPaths'

const NC_EXTS = new Set(['.nc', '.gcode', '.cnc', '.tap', '.ngc'])

function isNcFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot >= 0 && NC_EXTS.has(name.slice(dot).toLowerCase())
}

export function stripUuidPrefix(name: string): string {
  return name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
}

export interface FolderEntry {
  type: 'folder'
  name: string
  path: string
  childCount: number
}

export interface FileEntry {
  type: 'file'
  name: string
  path: string
  size: number
  uploadedAt: number
  isNc: boolean
  lastExecution: ExecutionRecord | null
  totalSuccessful: number
  totalFailed: number
}

/** Lists the contents of a single uploads-relative directory (not recursive).
 *  `dir` is the raw (unsanitized) relative path as supplied by a caller; throws
 *  a 400 h3 error if it escapes UPLOADS_DIR. A missing directory returns empty
 *  lists rather than erroring, matching the browser file browser's behavior. */
export async function listUploadsFolder(dir: string): Promise<{ folders: FolderEntry[]; files: FileEntry[] }> {
  const absDir = resolveUploadPath(dir)
  const relPrefix = dir ? dir.replace(/\/$/, '') + '/' : ''

  try {
    const entries = await readdir(absDir, { withFileTypes: true })

    const folders: FolderEntry[] = []
    const files: FileEntry[] = []

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
}
