import { mkdir } from 'node:fs/promises'
import { resolveUploadPath, sanitizeFolderPath } from '../../../utils/uploadPaths'
import { externalError, toExternalError } from '../../../utils/externalApiError'

export default defineEventHandler(async (event) => {
  if (!event.context.apiToken) {
    return externalError(event, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Missing or invalid API token' })
  }

  try {
    const body = await readBody(event) as { folder?: string }
    const rawPath = body.folder?.trim() ?? ''
    if (!rawPath) {
      return externalError(event, { statusCode: 400, code: 'VALIDATION_FAILED', message: 'folder is required' })
    }

    const safePath = sanitizeFolderPath(rawPath)
    if (!safePath) {
      return externalError(event, { statusCode: 400, code: 'VALIDATION_FAILED', message: 'Invalid folder path' })
    }

    const absPath = resolveUploadPath(safePath)

    try {
      await mkdir(absPath, { recursive: true })
    } catch (err: unknown) {
      return externalError(event, { statusCode: 500, code: 'STORAGE_FAILED', message: `Failed to create folder: ${(err as Error).message}` })
    }

    return { ok: true, folder: safePath }
  } catch (err: unknown) {
    return toExternalError(event, err)
  }
})
