import { readFile, rename, writeFile, unlink, readdir, mkdir, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { JobCheckpoint } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const CURRENT_JOB_DIR = join(DATA_DIR, 'current_job')
const CHECKPOINT_PATH = join(CURRENT_JOB_DIR, 'checkpoint.json')
const CHECKPOINT_TMP = CHECKPOINT_PATH + '.tmp'

export async function saveCheckpoint(checkpoint: JobCheckpoint): Promise<void> {
  try {
    await mkdir(CURRENT_JOB_DIR, { recursive: true })
    await writeFile(CHECKPOINT_TMP, JSON.stringify(checkpoint), 'utf8')
    await rename(CHECKPOINT_TMP, CHECKPOINT_PATH)
  } catch (err) {
    console.error('[checkpoint] Failed to save checkpoint:', err)
  }
}

export async function loadCheckpoint(): Promise<JobCheckpoint | null> {
  try {
    const raw = await readFile(CHECKPOINT_PATH, 'utf8')
    const parsed = JSON.parse(raw) as JobCheckpoint
    if (parsed.version !== 2) return null
    return parsed
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    console.error('[checkpoint] Failed to load checkpoint:', err)
    return null
  }
}

export async function clearCheckpoint(): Promise<void> {
  try {
    await unlink(CHECKPOINT_PATH)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[checkpoint] Failed to clear checkpoint:', err)
    }
  }
}

/** Delete every file and known subdirectories in the current_job directory. */
export async function clearAllJobData(): Promise<void> {
  // Remove transform subfolders first
  const subdirs = ['rotated', 'height_adjusted', 'rotated_height_adjusted']
  for (const sub of subdirs) {
    const subPath = join(CURRENT_JOB_DIR, sub)
    try {
      const entries = await readdir(subPath)
      await Promise.allSettled(entries.map((f) => unlink(join(subPath, f))))
      await rmdir(subPath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[checkpoint] Failed to clear subdir ${sub}:`, err)
      }
    }
  }

  // Remove files in root current_job dir
  try {
    const entries = await readdir(CURRENT_JOB_DIR)
    await Promise.allSettled(
      entries
        .filter((f) => f !== '.gitkeep')
        .map((f) => unlink(join(CURRENT_JOB_DIR, f))),
    )
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[checkpoint] Failed to clear job data:', err)
    }
  }
}
