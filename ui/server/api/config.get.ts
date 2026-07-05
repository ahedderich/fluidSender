import { getConfig } from '../utils/appState'

export default defineEventHandler(async () => {
  const config = await getConfig()
  const { auth, ...rest } = config
  return {
    ...rest,
    auth: auth ? { enabled: auth.enabled } : undefined,
  }
})
