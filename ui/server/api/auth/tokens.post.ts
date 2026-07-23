import { createApiToken } from '../../utils/apiTokens'

export default defineEventHandler(async (event) => {
  const session = event.context.session
  if (!session || session.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const { label, allowLoad } = await readBody(event) as { label?: string; allowLoad?: boolean }
  if (!label?.trim()) throw createError({ statusCode: 400, message: 'Label is required' })

  const { record, rawToken } = await createApiToken(label.trim(), allowLoad ?? false)

  // rawToken is only ever available in this one response — it is not recoverable afterwards.
  return { ...record, token: rawToken }
})
