import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')
const META_DIR = join(UPLOADS_DIR, '_meta')

export interface ExecutionRecord {
  startedAt: number
  completedAt: number
  /** Active runtime (ms), excluding paused/tool-change/program-pause time — the
   *  actual cutting duration, as opposed to (completedAt - startedAt) wall-clock.
   *  Optional for backward compatibility with records written before this field
   *  existed. */
  activeDurationMs?: number
  status: 'success' | 'error' | 'aborted'
  machineId: string
  machineName?: string
  errorMessage?: string
}

export interface FileMeta {
  uploadedAt: number
  executions: ExecutionRecord[]
}

function metaPath(relFilePath: string): string {
  return join(META_DIR, relFilePath + '.json')
}

export async function readMeta(relFilePath: string): Promise<FileMeta | null> {
  try {
    const raw = await readFile(metaPath(relFilePath), 'utf8')
    return JSON.parse(raw) as FileMeta
  } catch {
    return null
  }
}

export async function writeMeta(relFilePath: string, meta: FileMeta): Promise<void> {
  const p = metaPath(relFilePath)
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(meta), 'utf8')
}

export async function initMeta(relFilePath: string, uploadedAt: number): Promise<void> {
  await writeMeta(relFilePath, { uploadedAt, executions: [] })
}

export async function appendExecution(relFilePath: string, record: ExecutionRecord): Promise<void> {
  const existing = (await readMeta(relFilePath)) ?? { uploadedAt: Date.now(), executions: [] }
  existing.executions.push(record)
  if (existing.executions.length > 100) {
    existing.executions = existing.executions.slice(-100)
  }
  await writeMeta(relFilePath, existing)
}

export async function deleteMeta(relPath: string, isFolder: boolean): Promise<void> {
  try {
    const target = isFolder
      ? join(META_DIR, relPath)
      : metaPath(relPath)
    await rm(target, { recursive: true, force: true })
  } catch { /* ignore */ }
}
