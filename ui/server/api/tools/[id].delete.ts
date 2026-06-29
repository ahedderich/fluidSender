import { toolStore } from '../../utils/tool/toolStore'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { scope, machineId } = getQuery(event) as { scope?: string; machineId?: string }
  if (!machineId) throw createError({ statusCode: 400, statusMessage: 'machineId required' })
  if (scope !== 'M' && scope !== 'A') throw createError({ statusCode: 400, statusMessage: 'scope must be M or A' })
  await toolStore.delete(id, scope, machineId)
  return { ok: true }
})
