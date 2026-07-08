import { toolStore } from '../../utils/tool/toolStore'
import type { ToolLibraryEntry } from '../../utils/tool/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<ToolLibraryEntry & { machineId: string }>(event)
  const { machineId, ...entry } = body
  if (!machineId) throw createError({ statusCode: 400, statusMessage: 'machineId required' })
  await toolStore.upsert(entry, machineId)
  return { ok: true }
})
