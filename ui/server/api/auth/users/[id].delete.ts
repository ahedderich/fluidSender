import { getConfig, setConfig } from '../../../utils/appState'

export default defineEventHandler(async (event) => {
  const session = event.context.session
  if (!session || session.role !== 'admin') throw createError({ statusCode: 403, message: 'Forbidden' })

  const id = getRouterParam(event, 'id')
  const config = await getConfig()
  const users = config.auth?.users ?? []
  const target = users.find((u) => u.id === id)
  if (!target) throw createError({ statusCode: 404, message: 'User not found' })

  if (target.role === 'admin' && users.filter((u) => u.role === 'admin').length <= 1) {
    throw createError({ statusCode: 400, message: 'Cannot remove the last admin' })
  }

  config.auth = { ...(config.auth ?? {}), users: users.filter((u) => u.id !== id) }
  await setConfig(config)
  return { ok: true }
})
