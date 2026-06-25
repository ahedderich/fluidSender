import { readFile } from 'fs/promises'
import { join } from 'path'

const PATH = join(process.cwd(), 'config', 'scenarios.json')

export default defineEventHandler(async () => {
  try {
    const data = await readFile(PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
})
