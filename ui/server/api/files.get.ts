import { listUploadsFolder } from '../utils/folderListing'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const dir = (query.dir as string | undefined)?.trim() ?? ''
  return listUploadsFolder(dir)
})
