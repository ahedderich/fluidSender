import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'
const UPLOADS_DIR = join(DATA_DIR, 'uploads')
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

export default defineEventHandler(async (event) => {
  await mkdir(UPLOADS_DIR, { recursive: true })

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: 'No file provided' })
  }

  const filePart = formData.find((p) => p.name === 'file')
  if (!filePart || !filePart.data || !filePart.filename) {
    throw createError({ statusCode: 400, message: 'Field "file" with filename is required' })
  }

  if (filePart.data.length > MAX_FILE_SIZE) {
    throw createError({ statusCode: 413, message: 'File exceeds 100 MB limit' })
  }

  // Sanitise filename — strip any path components and restrict to safe chars
  const safeName = filePart.filename
    .replace(/.*[/\\]/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128)

  if (!safeName) {
    throw createError({ statusCode: 400, message: 'Invalid filename' })
  }

  const fileId = `${randomUUID()}-${safeName}`
  const destPath = join(UPLOADS_DIR, fileId)

  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(destPath)
    ws.on('error', reject)
    ws.on('finish', resolve)
    ws.write(filePart.data)
    ws.end()
  })

  return { fileId, filename: safeName }
})
