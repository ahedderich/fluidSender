import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const PATH = join(process.cwd(), 'config', 'toolsetter.json')

export interface ToolsetterFile {
  enabled: boolean
  x: number
  y: number
  radius: number
  triggerZ: number
}

const DEFAULTS: ToolsetterFile = { enabled: false, x: 0, y: 0, radius: 4, triggerZ: -60 }

export default defineEventHandler(async (): Promise<ToolsetterFile> => {
  try {
    const data = await readFile(PATH, 'utf-8')
    return JSON.parse(data) as ToolsetterFile
  } catch {
    await writeFile(PATH, JSON.stringify(DEFAULTS, null, 2))
    return DEFAULTS
  }
})
