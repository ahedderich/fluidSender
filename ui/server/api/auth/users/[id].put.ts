import { hash } from 'bcryptjs'
import { getConfig, setConfig } from '../../../utils/appState'

export default defineEventHandler(async (event) => {
  const session = event.context.session
  if (!session || session.role !== 'admin') throw createError({ statusCode: 403, message: 'Forbidden' })

  const id = getRouterParam(event, 'id')
  const { role, password } = await readBody(event) as { role?: string; password?: string }

  const config = await getConfig()
  const users = config.auth?.users ?? []
  const idx = users.findIndex((u) => u.id === id)
  if (idx === -1) throw createError({ statusCode: 404, message: 'User not found' })

  const user = users[idx]!

  if (role) {
    if (!['viewer', 'operator', 'admin'].includes(role)) throw createError({ statusCode: 400, message: 'Invalid role' })
    if (user.role === 'admin' && role !== 'admin' && users.filter((u) => u.role === 'admin').length <= 1) {
      throw createError({ statusCode: 400, message: 'Cannot downgrade the last admin' })
    }
    user.role = role as 'viewer' | 'operator' | 'admin'
  }

  if (password) {
    if (password.length < 8) throw createError({ statusCode: 400, message: 'Password must be at least 8 characters' })
    user.passwordHash = await hash(password, 12)
  }

  users[idx] = user
  config.auth = { ...(config.auth ?? {}), users }
  await setConfig(config)
  return { id: user.id, username: user.username, role: user.role }
})
