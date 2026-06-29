import { toolStore } from '../../utils/tool/toolStore'

export default defineEventHandler(async (event) => {
  const { machineId } = getQuery(event) as { machineId?: string }
  if (!machineId) {
    throw createError({ statusCode: 400, statusMessage: 'machineId required' })
  }

  await Promise.all([
    toolStore.loadMachineLibrary(machineId),
    toolStore.loadAppLibrary(),
  ])

  return toolStore.getAll(machineId)
})
