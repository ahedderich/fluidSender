import { getConfig } from '../utils/appState'

export default defineEventHandler(async () => {
  const config = await getConfig()
  const { auth, ...rest } = config
  return {
    ...rest,
    auth: auth ? { enabled: auth.enabled } : undefined,
    // Per-process fact, not persisted config — read fresh each request so the
    // same build behaves correctly whether it's running in Docker or Electron.
    runtime: process.env.FLUIDSENDER_RUNTIME === 'electron' ? 'electron' : 'container',
  }
})
