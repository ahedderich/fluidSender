import { setConfig, broadcast } from '../utils/appState'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  await setConfig(body)
  broadcast({ type: 'config:updated', payload: body })
  return { ok: true }
})
