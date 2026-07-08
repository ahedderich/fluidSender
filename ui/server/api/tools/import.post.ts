import { toolStore } from '../../utils/tool/toolStore'
import { broadcastPatch, pushToast } from '../../utils/appState'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ data: unknown; scope: string; machineId: string }>(event)
  const { data, scope, machineId } = body

  if (scope !== 'M' && scope !== 'A') {
    throw createError({ statusCode: 400, statusMessage: 'scope must be M or A' })
  }
  if (!machineId) {
    throw createError({ statusCode: 400, statusMessage: 'machineId required' })
  }

  // Ensure library is loaded before import
  if (scope === 'A') await toolStore.loadAppLibrary()
  else await toolStore.loadMachineLibrary(machineId)

  const result = await toolStore.importFusion360(data, scope, machineId)

  broadcastPatch([
    pushToast({
      id: `tool-import-${Date.now()}`,
      type: 'success',
      message: `Imported ${result.added} new tools, updated ${result.updated}`,
      timeout: 5000,
    }),
  ])

  return result
})
