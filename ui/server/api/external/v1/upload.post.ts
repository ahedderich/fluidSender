import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { initMeta } from '../../../utils/fileMetadata'
import { resolveUploadPath, sanitizeFilename, sanitizeFolderPath } from '../../../utils/uploadPaths'
import { jobRunner } from '../../../utils/gcode/jobRunner'
import { getJobState, type ApiTokenRecord } from '../../../utils/appState'
import { externalError, toExternalError } from '../../../utils/externalApiError'

const MAX_FILE_SIZE = 100 * 1024 * 1024

function fieldValue(formData: { name?: string; data: Buffer }[], name: string): string | undefined {
  const part = formData.find((p) => p.name === name)
  return part?.data ? Buffer.from(part.data).toString('utf8').trim() : undefined
}

interface LoadResult {
  ok: boolean
  code?: 'FORBIDDEN' | 'JOB_BUSY' | 'LOAD_FAILED'
  message?: string
}

/** Attempts to load the just-stored file as the active job, synchronously. Never
 *  throws — a failed load doesn't unwind a successful store, it's reported inline. */
async function tryLoad(relPath: string, token: ApiTokenRecord): Promise<LoadResult> {
  if (!token.allowLoad) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'This API token is not permitted to load files. Enable "Allow load" for this token in Authentication settings.',
    }
  }

  const status = jobRunner.status
  if (status === 'running' || status === 'pausing' || status === 'stopping') {
    return { ok: false, code: 'JOB_BUSY', message: 'Cannot load a job while one is running. Pause or cancel first.' }
  }

  await jobRunner.loadJob(relPath)

  const jobState = getJobState()
  if (jobState.status === 'error') {
    return { ok: false, code: 'LOAD_FAILED', message: jobState.errorMessage ?? 'Failed to load file' }
  }
  return { ok: true }
}

export default defineEventHandler(async (event) => {
  const token = event.context.apiToken
  if (!token) {
    return externalError(event, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Missing or invalid API token' })
  }

  try {
    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      return externalError(event, { statusCode: 400, code: 'VALIDATION_FAILED', message: 'Expected multipart/form-data with a "file" part' })
    }

    const rawFolder = fieldValue(formData, 'folder') ?? ''
    const rawFilenameField = fieldValue(formData, 'filename')
    const loadRequested = fieldValue(formData, 'load') === 'true'

    const filePart = formData.find((p) => p.name === 'file' && p.filename && p.data)
    if (!filePart) {
      return externalError(event, { statusCode: 400, code: 'VALIDATION_FAILED', message: 'No "file" part provided' })
    }

    if (filePart.data.length > MAX_FILE_SIZE) {
      return externalError(event, { statusCode: 413, code: 'VALIDATION_FAILED', message: 'File exceeds 100 MB limit' })
    }

    const safeFilename = sanitizeFilename(rawFilenameField || filePart.filename || '')
    if (!safeFilename) {
      return externalError(event, { statusCode: 400, code: 'VALIDATION_FAILED', message: 'A valid filename is required' })
    }

    const safeFolder = sanitizeFolderPath(rawFolder)
    const targetDir = resolveUploadPath(safeFolder)
    const relPath = safeFolder ? `${safeFolder}/${safeFilename}` : safeFilename
    const destPath = join(targetDir, safeFilename)

    try {
      await mkdir(targetDir, { recursive: true })
      await new Promise<void>((res, rej) => {
        const ws = createWriteStream(destPath)
        ws.on('error', rej)
        ws.on('finish', res)
        ws.write(filePart.data)
        ws.end()
      })
    } catch (err: unknown) {
      return externalError(event, { statusCode: 500, code: 'STORAGE_FAILED', message: `Failed to store file: ${(err as Error).message}` })
    }

    const uploadedAt = Date.now()
    // Overwriting a file resets its execution history — old stats describe the previous contents.
    await initMeta(relPath, uploadedAt)

    const response: Record<string, unknown> = {
      ok: true,
      file: { path: relPath, size: filePart.data.length, uploadedAt },
    }

    if (loadRequested) {
      response.load = await tryLoad(relPath, token)
    }

    return response
  } catch (err: unknown) {
    return toExternalError(event, err)
  }
})
