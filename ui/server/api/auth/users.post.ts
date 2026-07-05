import { hash } from 'bcryptjs'
import { getConfig, setConfig } from '../../utils/appState'

export default defineEventHandler(async (event) => {
  const session = event.context.session
  if (!session || session.role !== 'admin') throw createError({ statusCode: 403, message: 'Forbidden' })

  const { username, role, password } = await readBody(event) as {
    username: string; role: string; password: string
  }
  if (!username?.trim()) throw createError({ statusCode: 400, message: 'Username is required' })
  if (!['viewer', 'operator', 'admin'].includes(role)) throw createError({ statusCode: 400, message: 'Invalid role' })
  if (!password || password.length < 8) throw createError({ statusCode: 400, message: 'Password must be at least 8 characters' })

  const config = await getConfig()
  const users = config.auth?.users ?? []
  if (users.some((u) => u.username === username.trim())) {
    throw createError({ statusCode: 409, message: 'Username already exists' })
  }

  const passwordHash = await hash(password, 12)
  const newUser = {
    id: `user-${Date.now()}`,
    username: username.trim(),
    role: role as 'viewer' | 'operator' | 'admin',
    passwordHash,
  }
  users.push(newUser)
  config.auth = { ...(config.auth ?? {}), users }
  await setConfig(config)

  return { id: newUser.id, username: newUser.username, role: newUser.role }
})
