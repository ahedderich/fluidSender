import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { stringify, parse } from 'yaml'

const DEFAULT_CONFIG = {
  auth: { enabled: false },
  machines: [] as unknown[],
  app: {
    units: 'mm',
    macros: [] as unknown[],
    viewport: { defaultView: 'iso', showGrid: true, showAxes: true },
    jog: { slowSpeed: 100, mediumSpeed: 500, fastSpeed: 2000, xyStep: 1.0, zStep: 0.5 },
    shortcuts: {
      jogXPos: 'ArrowRight',
      jogXNeg: 'ArrowLeft',
      jogYPos: 'ArrowUp',
      jogYNeg: 'ArrowDown',
      jogZPos: 'PageUp',
      jogZNeg: 'PageDown',
      feedHold: '!',
      cycleStart: '~',
      softReset: 'ctrl+x',
      home: '$',
      speedSlow: '1',
      speedMedium: '2',
      speedFast: '3',
    },
  },
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const configDir = config.configPath as string
  const configFile = join(configDir, 'app.yaml')

  try {
    const raw = await readFile(configFile, 'utf8')
    return parse(raw) ?? DEFAULT_CONFIG
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(configDir, { recursive: true })
      await writeFile(configFile, stringify(DEFAULT_CONFIG), 'utf8')
      return DEFAULT_CONFIG
    }
    throw createError({ statusCode: 500, message: 'Failed to read config' })
  }
})
