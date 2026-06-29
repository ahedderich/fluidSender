import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { RuntimeSession } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const LOG_PATH = join(DATA_DIR, 'tool-runtime-log.json')

// In-memory cache: key = `${scope}:${machineId}:${toolNumber}`
const _cache = new Map<string, number>()

function cacheKey(toolNumber: number, scope: 'M' | 'A', machineId: string): string {
  return `${scope}:${machineId}:${toolNumber}`
}

export async function loadRuntimeLog(): Promise<void> {
  try {
    const raw = await readFile(LOG_PATH, 'utf8')
    const sessions = JSON.parse(raw) as RuntimeSession[]
    _cache.clear()
    for (const s of sessions) {
      const key = cacheKey(s.toolNumber, s.scope, s.machineId)
      const durationMin = Math.floor((s.endMs - s.startMs) / 60_000)
      _cache.set(key, (_cache.get(key) ?? 0) + durationMin)
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[runtimeLog] error loading log:', err)
    }
  }
}

export function getTotalRuntimeMinutes(toolNumber: number, scope: 'M' | 'A', machineId: string): number {
  return _cache.get(cacheKey(toolNumber, scope, machineId)) ?? 0
}

export async function appendRuntimeSession(session: RuntimeSession): Promise<void> {
  const key = cacheKey(session.toolNumber, session.scope, session.machineId)
  const durationMin = Math.floor((session.endMs - session.startMs) / 60_000)
  _cache.set(key, (_cache.get(key) ?? 0) + durationMin)

  try {
    let existing: RuntimeSession[] = []
    try {
      const raw = await readFile(LOG_PATH, 'utf8')
      existing = JSON.parse(raw) as RuntimeSession[]
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    existing.push(session)
    await mkdir(dirname(LOG_PATH), { recursive: true })
    const tmp = LOG_PATH + '.tmp'
    await writeFile(tmp, JSON.stringify(existing, null, 2), 'utf8')
    await rename(tmp, LOG_PATH)
  } catch (err) {
    console.error('[runtimeLog] error appending session:', err)
  }
}
