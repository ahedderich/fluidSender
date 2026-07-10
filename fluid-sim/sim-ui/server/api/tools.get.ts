import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const PATH = join(process.cwd(), 'config', 'tools.json')

export interface SimTool {
  id: string
  number: number
  name: string
  diameter: number
  shoulderLength: number
}

export interface ToolsFile {
  loadedNumber: number | null
  tools: SimTool[]
}

const DEFAULTS: ToolsFile = { loadedNumber: null, tools: [] }

export default defineEventHandler(async (): Promise<ToolsFile> => {
  try {
    const data = await readFile(PATH, 'utf-8')
    return JSON.parse(data) as ToolsFile
  } catch {
    await writeFile(PATH, JSON.stringify(DEFAULTS, null, 2))
    return DEFAULTS
  }
})
