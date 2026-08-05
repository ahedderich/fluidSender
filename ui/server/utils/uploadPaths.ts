import { resolve, join } from 'node:path'
import { stat } from 'node:fs/promises'
import { createError } from 'h3'

export const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
export const UPLOADS_DIR = join(DATA_DIR, 'uploads')

/** Lightweight content fingerprint (size + mtime) for a file under UPLOADS_DIR — cheap
 *  enough to check on every load, and sufficient to detect a same-path overwrite (e.g.
 *  a same-name re-upload) without hashing the whole file. */
export async function computeUploadFingerprint(relPath: string): Promise<string> {
  const s = await stat(join(UPLOADS_DIR, relPath))
  return `${s.size}:${s.mtimeMs}`
}

/** Resolves a user-supplied relative path against UPLOADS_DIR and rejects traversal
 *  outside of it (e.g. `../../etc`). Throws a 400 h3 error on an invalid path. */
export function resolveUploadPath(relPath: string): string {
  const abs = resolve(join(UPLOADS_DIR, relPath))
  if (abs !== UPLOADS_DIR && !abs.startsWith(UPLOADS_DIR + '/')) {
    throw createError({ statusCode: 400, message: 'Invalid path', data: { code: 'VALIDATION_FAILED' } })
  }
  return abs
}

/** Sanitizes a single path segment (folder or file name) to a safe charset. */
export function sanitizeSegment(seg: string): string {
  return seg.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128)
}

/** Sanitizes a `/`-separated relative folder path segment-by-segment, dropping empties. */
export function sanitizeFolderPath(rawPath: string): string {
  return rawPath
    .split('/')
    .map(sanitizeSegment)
    .filter(Boolean)
    .join('/')
}

/** Sanitizes a filename: drops any leading directory components, then restricts
 *  to a safe charset (matches the browser upload endpoint's behavior). */
export function sanitizeFilename(rawName: string): string {
  return sanitizeSegment(rawName.replace(/.*[/\\]/, ''))
}
