import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { initMeta } from '../utils/fileMetadata'
import { UPLOADS_DIR, sanitizeFilename } from '../utils/uploadPaths'

const MAX_FILE_SIZE = 100 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: 'No files provided' })
  }

  const dirPart = formData.find((p) => p.name === 'dir')
  const rawDir = dirPart?.data ? Buffer.from(dirPart.data).toString().trim() : ''

  const targetDir = rawDir ? resolve(join(UPLOADS_DIR, rawDir)) : UPLOADS_DIR
  if (targetDir !== UPLOADS_DIR && !targetDir.startsWith(UPLOADS_DIR + '/')) {
    throw createError({ statusCode: 400, message: 'Invalid target directory' })
  }

  await mkdir(targetDir, { recursive: true })

  const fileParts = formData.filter((p) => p.name === 'file' && p.filename && p.data)
  if (fileParts.length === 0) {
    throw createError({ statusCode: 400, message: 'No file parts provided' })
  }

  const results: { fileId: string; filename: string }[] = []

  for (const part of fileParts) {
    if (part.data.length > MAX_FILE_SIZE) {
      throw createError({ statusCode: 413, message: `${part.filename} exceeds 100 MB limit` })
    }

    const safeName = sanitizeFilename(part.filename ?? '')
    if (!safeName) continue

    const destPath = join(targetDir, safeName)
    const relPath = rawDir ? `${rawDir.replace(/\/$/, '')}/${safeName}` : safeName
    const uploadedAt = Date.now()

    await new Promise<void>((res, rej) => {
      const ws = createWriteStream(destPath)
      ws.on('error', rej)
      ws.on('finish', res)
      ws.write(part.data)
      ws.end()
    })

    // Overwriting a file resets its execution history — old stats describe the
    // previous contents (mirrors the external API upload endpoint's behavior).
    await initMeta(relPath, uploadedAt)
    results.push({ fileId: relPath, filename: safeName })
  }

  return { files: results }
})
