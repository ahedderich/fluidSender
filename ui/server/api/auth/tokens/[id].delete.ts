import { revokeApiToken } from '../../../utils/apiTokens'

export default defineEventHandler(async (event) => {
  const session = event.context.session
  if (!session || session.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'id is required' })

  const revoked = await revokeApiToken(id)
  if (!revoked) throw createError({ statusCode: 404, message: 'Token not found' })

  return { ok: true }
})
