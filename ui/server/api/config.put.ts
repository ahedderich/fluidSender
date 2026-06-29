import { getConfig, setConfig, broadcast } from '../utils/appState'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as Record<string, unknown>
  const existing = await getConfig()
  // Deep-merge app so server-managed fields (e.g. loadedTools) survive client saves
  const merged = {
    ...body,
    app: { ...(existing.app ?? {}), ...(body.app as Record<string, unknown> ?? {}) },
  }
  await setConfig(merged)
  broadcast({ type: 'config:updated', payload: merged })
  return { ok: true }
})
