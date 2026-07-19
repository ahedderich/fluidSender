import { listUploadsFolder } from '../../../utils/folderListing'
import { externalError, toExternalError } from '../../../utils/externalApiError'

export default defineEventHandler(async (event) => {
  if (!event.context.apiToken) {
    return externalError(event, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Missing or invalid API token' })
  }

  try {
    const query = getQuery(event)
    const dir = (query.folder as string | undefined)?.trim() ?? ''
    const { folders, files } = await listUploadsFolder(dir)
    return { ok: true, folders, files }
  } catch (err: unknown) {
    return toExternalError(event, err)
  }
})
