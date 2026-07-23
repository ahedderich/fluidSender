import { app } from 'electron'
import { join } from 'node:path'

export function getConfigDir(): string {
  return join(app.getPath('userData'), 'config')
}

export function getDataDir(): string {
  return join(app.getPath('userData'), 'data')
}
