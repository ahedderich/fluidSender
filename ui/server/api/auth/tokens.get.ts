import { listApiTokens } from '../../utils/apiTokens'

export default defineEventHandler(async (event) => {
  const session = event.context.session
  if (!session || session.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }
  return listApiTokens()
})
