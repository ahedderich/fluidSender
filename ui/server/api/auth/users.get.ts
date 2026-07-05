import { getConfig } from '../../utils/appState'

export default defineEventHandler(async (event) => {
  const session = event.context.session
  if (!session || session.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }
  const config = await getConfig()
  return (config.auth?.users ?? []).map(({ id, username, role }) => ({ id, username, role }))
})
