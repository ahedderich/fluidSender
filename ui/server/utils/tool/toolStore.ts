import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { broadcastPatch } from '../appState'
import { importFusion360Library } from './fusion360'
import type { ToolLibraryEntry, ToolLibraryFile } from './types'

const DATA_DIR = process.env.DATA_DIR ?? '/app/data'

function appLibraryPath(): string {
  return join(DATA_DIR, 'tool-library-app.json')
}

function machineLibraryPath(machineId: string): string {
  return join(DATA_DIR, 'machines', machineId, 'tool-library.json')
}

async function readLibrary(path: string): Promise<ToolLibraryEntry[]> {
  try {
    const raw = await readFile(path, 'utf8')
    const file = JSON.parse(raw) as ToolLibraryFile
    return file.tools ?? []
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function writeLibrary(path: string, tools: ToolLibraryEntry[]): Promise<void> {
  const file: ToolLibraryFile = { version: 1, tools }
  await mkdir(dirname(path), { recursive: true })
  const tmp = path + '.tmp'
  await writeFile(tmp, JSON.stringify(file, null, 2), 'utf8')
  await rename(tmp, path)
}

// In-memory caches
let _appTools: ToolLibraryEntry[] = []
const _machineTools: Map<string, ToolLibraryEntry[]> = new Map()

class ToolStore {
  async loadAppLibrary(): Promise<ToolLibraryEntry[]> {
    _appTools = await readLibrary(appLibraryPath())
    return _appTools
  }

  async loadMachineLibrary(machineId: string): Promise<ToolLibraryEntry[]> {
    const tools = await readLibrary(machineLibraryPath(machineId))
    _machineTools.set(machineId, tools)
    return tools
  }

  async saveAppLibrary(tools: ToolLibraryEntry[]): Promise<void> {
    _appTools = tools
    await writeLibrary(appLibraryPath(), tools)
  }

  async saveMachineLibrary(machineId: string, tools: ToolLibraryEntry[]): Promise<void> {
    _machineTools.set(machineId, tools)
    await writeLibrary(machineLibraryPath(machineId), tools)
  }

  getAll(machineId: string): { machine: ToolLibraryEntry[]; app: ToolLibraryEntry[] } {
    return {
      machine: _machineTools.get(machineId) ?? [],
      app: _appTools,
    }
  }

  async upsert(entry: ToolLibraryEntry, machineId: string): Promise<void> {
    if (entry.source === 'A') {
      const idx = _appTools.findIndex((t) => t.id === entry.id)
      if (idx >= 0) _appTools[idx] = entry
      else _appTools.push(entry)
      await this.saveAppLibrary(_appTools)
    } else {
      const tools = _machineTools.get(machineId) ?? []
      const idx = tools.findIndex((t) => t.id === entry.id)
      if (idx >= 0) tools[idx] = entry
      else tools.push(entry)
      _machineTools.set(machineId, tools)
      await this.saveMachineLibrary(machineId, tools)
    }
    this._broadcastLibrary(machineId)
  }

  async delete(id: string, scope: 'M' | 'A', machineId: string): Promise<void> {
    if (scope === 'A') {
      _appTools = _appTools.filter((t) => t.id !== id)
      await this.saveAppLibrary(_appTools)
    } else {
      const tools = (_machineTools.get(machineId) ?? []).filter((t) => t.id !== id)
      _machineTools.set(machineId, tools)
      await this.saveMachineLibrary(machineId, tools)
    }
    this._broadcastLibrary(machineId)
  }

  async importFusion360(
    data: unknown,
    scope: 'M' | 'A',
    machineId: string,
  ): Promise<{ added: number; updated: number }> {
    const { tools: incoming } = importFusion360Library(data, scope)
    const existing = scope === 'A' ? _appTools : (_machineTools.get(machineId) ?? [])

    let added = 0
    let updated = 0

    for (const tool of incoming) {
      // Match by tool number within scope only
      const idx = existing.findIndex((t) => t.number === tool.number && t.source === scope)
      if (idx >= 0) {
        const old = existing[idx]!
        // Preserve FluidSender-owned fields that Fusion 360 has no concept of
        existing[idx] = {
          ...tool,
          id: old.id,
          totalRuntimeMinutes: old.totalRuntimeMinutes,
          jobCount: old.jobCount,
          lastUsed: old.lastUsed,
          probeConfig: old.probeConfig,
          probeCompensation: old.probeCompensation,
        }
        updated++
      } else {
        existing.push(tool)
        added++
      }
    }

    if (scope === 'A') {
      await this.saveAppLibrary(existing)
    } else {
      _machineTools.set(machineId, existing)
      await this.saveMachineLibrary(machineId, existing)
    }

    this._broadcastLibrary(machineId)
    return { added, updated }
  }

  async incrementRuntime(
    toolNumber: number,
    scope: 'M' | 'A',
    machineId: string,
    minutes: number,
  ): Promise<void> {
    if (minutes < 0) return
    const now = Date.now()

    if (scope === 'A') {
      const tool = _appTools.find((t) => t.number === toolNumber)
      if (tool) {
        tool.totalRuntimeMinutes += minutes
        tool.jobCount += 1
        tool.lastUsed = now
        await this.saveAppLibrary(_appTools)
      } else {
        console.warn(`[toolStore] incrementRuntime: no app-scoped tool #${toolNumber} — ${minutes.toFixed(2)}min dropped`)
      }
    } else {
      const tools = _machineTools.get(machineId) ?? []
      const tool = tools.find((t) => t.number === toolNumber)
      if (tool) {
        tool.totalRuntimeMinutes += minutes
        tool.jobCount += 1
        tool.lastUsed = now
        await this.saveMachineLibrary(machineId, tools)
      } else {
        console.warn(`[toolStore] incrementRuntime: no machine-scoped tool #${toolNumber} on ${machineId} — ${minutes.toFixed(2)}min dropped`)
      }
    }

    this._broadcastLibrary(machineId)
  }

  async clearRuntime(id: string, scope: 'M' | 'A', machineId: string): Promise<void> {
    if (scope === 'A') {
      const tool = _appTools.find((t) => t.id === id)
      if (tool) {
        tool.totalRuntimeMinutes = 0
        tool.jobCount = 0
        tool.lastUsed = undefined
        await this.saveAppLibrary(_appTools)
      }
    } else {
      const tools = _machineTools.get(machineId) ?? []
      const tool = tools.find((t) => t.id === id)
      if (tool) {
        tool.totalRuntimeMinutes = 0
        tool.jobCount = 0
        tool.lastUsed = undefined
        await this.saveMachineLibrary(machineId, tools)
      }
    }
    this._broadcastLibrary(machineId)
  }

  private _broadcastLibrary(machineId: string): void {
    const { machine, app } = this.getAll(machineId)
    broadcastPatch([{ path: 'toolLibrary', set: { machine, app } }])
  }
}

export const toolStore = new ToolStore()
