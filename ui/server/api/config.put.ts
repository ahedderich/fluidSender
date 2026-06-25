import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { stringify } from 'yaml'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const configDir = config.configPath as string
  const configFile = join(configDir, 'app.yaml')
  const body = await readBody(event)
  await mkdir(configDir, { recursive: true })
  await writeFile(configFile, stringify(body), 'utf8')
  return { ok: true }
})
