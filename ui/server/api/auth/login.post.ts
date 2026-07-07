import { compare } from 'bcryptjs'
import { signSession, COOKIE_NAME } from '../../utils/auth'
import { getConfig } from '../../utils/appState'

export default defineEventHandler(async (event) => {
  const { username, password } = await readBody(event) as { username: string; password: string }
  if (!username || !password) throw createError({ statusCode: 400, message: 'Missing credentials' })

  const config = await getConfig()
  if (!config.auth?.enabled) {
    throw createError({ statusCode: 400, message: 'Authentication is not enabled' })
  }

  const user = (config.auth.users ?? []).find((u) => u.username === username)
  if (!user) throw createError({ statusCode: 401, message: 'Invalid credentials' })

  const valid = await compare(password, user.passwordHash)
  if (!valid) throw createError({ statusCode: 401, message: 'Invalid credentials' })

  const runtimeConfig = useRuntimeConfig()
  const token = await signSession(
    { userId: user.id, username: user.username, role: user.role },
    runtimeConfig.jwtSecret as string,
  )

  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })

  return { ok: true, role: user.role, username: user.username }
})
