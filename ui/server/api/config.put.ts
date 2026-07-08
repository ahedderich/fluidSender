import { getConfig, setConfig, broadcast } from '../utils/appState'

export default defineEventHandler(async (event) => {
  const session = event.context.session
  if (session && session.role === 'viewer') {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const body = await readBody(event) as Record<string, unknown>
  const existing = await getConfig()

  const merged = {
    ...body,
    auth: {
      ...(existing.auth ?? {}),
      enabled: ((body.auth as Record<string, unknown> | undefined)?.enabled as boolean | undefined) ?? existing.auth?.enabled,
    },
    app: { ...(existing.app ?? {}), ...(body.app as Record<string, unknown> ?? {}) },
  }
  await setConfig(merged)
  broadcast({ type: 'config:updated', payload: merged })
  return { ok: true }
})
