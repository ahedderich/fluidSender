export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const path = getRouterParam(event, 'path') ?? ''
  const method = event.method
  const targetUrl = `${config.simControlUrl}/api/${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (method === 'GET') {
    const response = await $fetch(targetUrl, { method: 'GET' }).catch((e) => {
      throw createError({ statusCode: 502, message: `Sim unreachable: ${e}` })
    })
    return response
  }

  const body = await readBody(event).catch(() => null)
  const response = await $fetch(targetUrl, {
    method: method as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body: body ? JSON.stringify(body) : undefined,
    headers,
  }).catch((e) => {
    throw createError({ statusCode: 502, message: `Sim unreachable: ${e}` })
  })

  return response ?? null
})
