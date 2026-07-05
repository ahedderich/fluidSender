import { verifySession, parseCookie, type SessionPayload } from '../utils/auth'
import { getConfig } from '../utils/appState'

declare module 'h3' {
  interface H3EventContext {
    session: SessionPayload | null
    authEnabled: boolean
  }
}

const PUBLIC_PATHS = ['/api/auth/login', '/login', '/_nuxt', '/favicon']

export default defineEventHandler(async (event) => {
  const path = event.path ?? ''

  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    event.context.session = null
    event.context.authEnabled = false
    return
  }

  const config = await getConfig()
  const authEnabled = config.auth?.enabled ?? false
  event.context.authEnabled = authEnabled

  if (!authEnabled) {
    event.context.session = { userId: 'local', username: 'local', role: 'admin' }
    return
  }

  const cookieHeader = getHeader(event, 'cookie') ?? ''
  const runtimeConfig = useRuntimeConfig()
  const token = parseCookie(cookieHeader, 'fs_session')
  const session = token ? await verifySession(token, runtimeConfig.jwtSecret as string) : null

  event.context.session = session

  if (!session && path.startsWith('/api/') && path !== '/api/auth/login') {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
})
