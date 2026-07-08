import { toolStore } from '../../utils/tool/toolStore'
import { buildFusion360Export } from '../../utils/tool/fusion360'

export default defineEventHandler(async (event) => {
  const { scope, machineId } = getQuery(event) as { scope?: string; machineId?: string }
  if (!machineId) throw createError({ statusCode: 400, statusMessage: 'machineId required' })

  const scopes = (scope ?? 'M,A').split(',').map((s) => s.trim())
  const { machine, app } = toolStore.getAll(machineId)

  const tools = [
    ...(scopes.includes('M') ? machine : []),
    ...(scopes.includes('A') ? app : []),
  ]

  const json = buildFusion360Export(tools)

  setHeader(event, 'Content-Type', 'application/json')
  setHeader(event, 'Content-Disposition', 'attachment; filename="tool-library.json"')
  return json
})
