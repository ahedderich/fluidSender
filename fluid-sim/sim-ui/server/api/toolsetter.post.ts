import { writeFile } from 'fs/promises'
import { join } from 'path'

const PATH = join(process.cwd(), 'config', 'toolsetter.json')

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  await writeFile(PATH, JSON.stringify(body, null, 2))
  return { ok: true }
})
