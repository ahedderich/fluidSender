import { getConfig, getConnection } from '../../utils/appState'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: 'No file provided' })
  }

  const filePart = formData.find((p) => p.name === 'config')
  if (!filePart?.data) {
    throw createError({ statusCode: 400, message: 'Missing config field' })
  }

  const conn = getConnection()
  if (!conn.connected || !conn.machineId) {
    throw createError({ statusCode: 409, message: 'Not connected to machine' })
  }

  const config = await getConfig()
  const machines = (config.machines ?? []) as { id?: string; fluidncIp?: string | null }[]
  const machine = machines.find((m) => m.id === conn.machineId)
  const machineIp = machine?.fluidncIp

  if (!machineIp) {
    throw createError({ statusCode: 409, message: 'Machine IP not known — reconnect first' })
  }

  const filename = ((machine as { fluidncConfig?: { configFilename?: string } }).fluidncConfig?.configFilename ?? 'config.yaml').replace(/^\//, '')
  const fileSize = filePart.data.length
  const boundary = `----FluidSenderBoundary${Date.now()}`
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n/\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="/${filename}"\r\n\r\n${fileSize}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="myfile[]"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    filePart.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const uploadUrl = `http://${machineIp}/files`
  console.log(`[config-upload] POST ${uploadUrl}  filename=${filename}  size=${fileSize}B`)

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length.toString(),
    },
    body,
  })

  const responseText = await response.text().catch(() => '')
  console.log(`[config-upload] FluidNC response: ${response.status} ${response.statusText}  body=${JSON.stringify(responseText)}`)

  if (!response.ok) {
    throw createError({ statusCode: 502, message: `FluidNC upload failed (${response.status}): ${responseText}` })
  }

  return { ok: true, filename }
})
