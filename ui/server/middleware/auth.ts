import { verifySession, parseCookie, type SessionPayload } from '../utils/auth'
import { verifyApiToken } from '../utils/apiTokens'
import { getConfig, type ApiTokenRecord } from '../utils/appState'
import { externalError } from '../utils/externalApiError'

declare module 'h3' {
  interface H3EventContext {
    session: SessionPayload | null
    authEnabled: boolean
    /** Set only for /api/external/* requests authenticated via bearer token. */
    apiToken: ApiTokenRecord | null
  }
}

const PUBLIC_PATHS = ['/api/auth/login', '/login', '/_nuxt', '/favicon']

// Third-party integrations (e.g. a CAM post-processor) authenticate with a bearer
// token instead of a session cookie. This is deliberately independent of auth.enabled:
// the token is its own opt-in security layer, scoped to these routes only, and
// generating one is how a user chooses to expose this surface at all.
const EXTERNAL_API_PREFIX = '/api/external/'

export default defineEventHandler(async (event) => {
  const path = event.path ?? ''

  if (path.startsWith(EXTERNAL_API_PREFIX)) {
    event.context.session = null
    event.context.authEnabled = false

    const authHeader = getHeader(event, 'authorization') ?? ''
    const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
    const tokenRecord = rawToken ? await verifyApiToken(rawToken) : null

    if (!tokenRecord) {
      return externalError(event, {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid API token. Send it as "Authorization: Bearer <token>".',
      })
    }

    event.context.apiToken = tokenRecord
    return
  }

  event.context.apiToken = null

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
