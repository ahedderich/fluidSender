import { getConfig } from '../utils/appState'

export default defineEventHandler(async () => {
  return await getConfig()
})
