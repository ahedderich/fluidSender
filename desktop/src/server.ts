import { app } from 'electron'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdir, readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { getConfigDir, getDataDir } from './paths.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Default, and fallback if the persisted setting is missing/invalid. Deliberately
// not 3000 (ui/'s own default) to avoid colliding with a Docker deployment of
// FluidSender running on the same machine.
const DEFAULT_PORT = 17173
// The Electron window always loads via loopback regardless of bind host below —
// binding 0.0.0.0 already includes loopback, so there's never a reason to route
// the app's own window through the LAN-facing interface.
const LOOPBACK = '127.0.0.1'

function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535
}

// Reads the "Expose on Network" app setting (ui/app/components/settings/AppInterfaceTab.vue)
// directly from app.yaml, before Nitro starts — there's no live-rebind capability
// once the server is listening, so this can only be read once at startup.
async function resolveNetworkConfig(configDir: string): Promise<{ host: string; port: number }> {
  try {
    const raw = await readFile(join(configDir, 'app.yaml'), 'utf-8')
    const parsed = parse(raw) as { app?: { network?: { exposeOnLan?: boolean; port?: number } } }
    const network = parsed.app?.network
    return {
      host: network?.exposeOnLan ? '0.0.0.0' : LOOPBACK,
      port: isValidPort(network?.port) ? network.port : DEFAULT_PORT,
    }
  } catch {
    return { host: LOOPBACK, port: DEFAULT_PORT }
  }
}

// ui/.output/server/index.mjs only exports the Nitro app handler, not a
// listener/server object, so there's nothing to await beyond module
// evaluation — poll the actual HTTP endpoint instead.
async function waitForReady(url: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await fetch(url)
      return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`)
}

export async function startServer(): Promise<{ url: string }> {
  const configDir = getConfigDir()
  const dataDir = getDataDir()
  await mkdir(configDir, { recursive: true })
  await mkdir(dataDir, { recursive: true })

  const { host, port } = await resolveNetworkConfig(configDir)

  // Must be set before the dynamic import below — ui/server/utils/appState.ts's
  // CONFIG_DIR and the ~12 files reading DATA_DIR all resolve these as
  // module-level consts, evaluated once at import time.
  process.env.NUXT_CONFIG_PATH = configDir
  process.env.DATA_DIR = dataDir
  process.env.NITRO_PORT = String(port)
  process.env.NITRO_HOST = host
  process.env.NODE_ENV = 'production'
  process.env.FLUIDSENDER_RUNTIME = 'electron'

  const entry = app.isPackaged
    ? join(process.resourcesPath, 'ui-output', 'server', 'index.mjs')
    : join(__dirname, '..', 'vendor', 'ui-output', 'server', 'index.mjs')

  // Dynamic import (not a static top-level import) so it runs after the env
  // vars above are set, and pathToFileURL is required since index.mjs is ESM.
  await import(pathToFileURL(entry).href)

  const url = `http://${LOOPBACK}:${port}/`
  await waitForReady(url)
  return { url }
}
