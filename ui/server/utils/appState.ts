import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { stringify, parse } from 'yaml'
import type { Peer } from 'crossws'
import type { JobState } from './gcode/types'
import type { MachineStatus } from './machine/types'

const CONFIG_DIR = process.env.NUXT_CONFIG_PATH ?? './config'

export interface StockDef {
  shape: 'rect' | 'round'
  width?: number
  height?: number
  rotation?: number
  diameter?: number
  depth: number
}

export interface ConnectionState {
  machineId: string | null
  connected: boolean
  status: string
  firmwareVersion: string
}

// ─── Shared UI state (server-authoritative, pushed to every client) ─────────────

export interface ModalEntry {
  id: string
  kind: string
  props?: Record<string, unknown>
}

export interface Toast {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
  /** ms until auto-dismiss; 0 = sticky */
  timeout: number
}

export interface UiConsoleEntry {
  id: number
  type: 'sent' | 'recv' | 'info' | 'error'
  text: string
  ts: number
}

export interface UiState {
  nav: {
    probingTab: string
    route: string
    wizard: { key: string | null; step: number }
  }
  selection: { activeMachineId: string; selectedToolId: string | null; selectedFile: string | null }
  jogActive: boolean
  modals: ModalEntry[]
  toasts: Toast[]
  console: UiConsoleEntry[]
}

const CONSOLE_LIMIT = 300

const ui: UiState = {
  nav: { probingTab: 'stock', route: '/', wizard: { key: null, step: 0 } },
  selection: { activeMachineId: '', selectedToolId: null, selectedFile: null },
  jogActive: false,
  modals: [],
  toasts: [],
  console: [],
}

// A patch op targets a top-level UiState slice by `path`. Scalars use `set`;
// arrays (modals/toasts/console) use `push`/`removeId`. `meta` carries extra
// data alongside a removal (e.g. a modal's resolution result).
export type PatchOp =
  | { path: string; set: Record<string, unknown> }
  | { path: string; push: unknown }
  | { path: string; removeId: string; meta?: Record<string, unknown> }
  | { path: string; clear: true }

interface AppConfig {
  auth?: { enabled?: boolean }
  machines?: unknown[]
  app?: Record<string, unknown>
}

const DEFAULT_CONFIG: AppConfig = {
  auth: { enabled: false },
  machines: [],
  app: {
    units: 'mm',
    macros: [],
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

const peers = new Set<Peer>()

let cachedConfig: AppConfig = structuredClone(DEFAULT_CONFIG)
let configLoaded = false

// ─── Stock definition (server-authoritative, persisted in app.yaml) ───────────

let stockDef: StockDef | null = null

export function getStock(): StockDef | null {
  return stockDef
}

export async function setStock(s: StockDef): Promise<PatchOp> {
  stockDef = s
  const config = await getConfig()
  config.app = { ...(config.app ?? {}), stock: s }
  await setConfig(config)
  return { path: 'stock', set: { stock: s } }
}

export async function clearStock(): Promise<PatchOp> {
  stockDef = null
  const config = await getConfig()
  config.app = { ...(config.app ?? {}), stock: null }
  await setConfig(config)
  return { path: 'stock', set: { stock: null } }
}

// ─── Job state (server-authoritative, synced to all clients via patch) ────────

const job: JobState = {
  status: 'idle',
  fileId: null,
  filename: null,
  totalLines: 0,
  sendPtr: 0,
  execPtr: 0,
  inPlanner: 0,
  maxPlannerSlots: 0,
  estimatedTotalMs: 0,
  startWallClock: null,
  axisRanges: null,
  analyzeProgress: 0,
  toolSections: null,
  recovery: null,
  errorMessage: null,
}

export function getJobState(): JobState {
  return { ...job }
}

export function setJobState(partial: Partial<JobState>): PatchOp {
  Object.assign(job, partial)
  return { path: 'job', set: { ...job } as unknown as Record<string, unknown> }
}

const connection: ConnectionState = {
  machineId: null,
  connected: false,
  status: 'DISCONNECTED',
  firmwareVersion: '',
}

// ─── Peer registry ────────────────────────────────────────────────────────────

export function registerPeer(peer: Peer) {
  peers.add(peer)
}

export function removePeer(peer: Peer) {
  peers.delete(peer)
}

export function broadcast(msg: unknown, except?: Peer) {
  const text = JSON.stringify(msg)
  for (const p of peers) {
    if (p !== except) p.send(text)
  }
}

export function broadcastPatch(ops: PatchOp[]) {
  broadcast({ t: 'patch', payload: { ops } })
}

// ─── Shared UI state mutators ───────────────────────────────────────────────────

export function getUiState(): UiState {
  return ui
}

export function setNav(partial: Partial<UiState['nav']>): PatchOp {
  Object.assign(ui.nav, partial)
  return { path: 'nav', set: { ...ui.nav } }
}

export function setJogActive(active: boolean): PatchOp {
  ui.jogActive = active
  return { path: 'jogActive', set: { jogActive: active } }
}

export function setSelection(partial: Partial<UiState['selection']>): PatchOp {
  Object.assign(ui.selection, partial)
  return { path: 'selection', set: { ...ui.selection } }
}

export function openModal(entry: ModalEntry): PatchOp | null {
  if (ui.modals.some((m) => m.id === entry.id)) return null
  ui.modals.push(entry)
  return { path: 'modals', push: entry }
}

export function resolveModal(id: string, result: unknown): PatchOp | null {
  const idx = ui.modals.findIndex((m) => m.id === id)
  if (idx === -1) return null
  ui.modals.splice(idx, 1)
  return { path: 'modals', removeId: id, meta: { result } }
}

export function pushToast(toast: Toast): PatchOp {
  ui.toasts.push(toast)
  return { path: 'toasts', push: toast }
}

export function removeToast(id: string): PatchOp | null {
  const idx = ui.toasts.findIndex((t) => t.id === id)
  if (idx === -1) return null
  ui.toasts.splice(idx, 1)
  return { path: 'toasts', removeId: id }
}

let consoleSeq = 0

export function pushConsole(entry: Omit<UiConsoleEntry, 'id'>): PatchOp {
  const full: UiConsoleEntry = { ...entry, id: consoleSeq++ }
  ui.console.push(full)
  if (ui.console.length > CONSOLE_LIMIT) ui.console.splice(0, ui.console.length - CONSOLE_LIMIT)
  return { path: 'console', push: full }
}

export function clearConsole(): PatchOp {
  ui.console.length = 0
  return { path: 'console', clear: true }
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getConfig(): Promise<AppConfig> {
  if (configLoaded) return cachedConfig
  const configFile = join(CONFIG_DIR, 'app.yaml')
  console.log('[appState] loading config from', configFile)
  try {
    const raw = await readFile(configFile, 'utf8')
    cachedConfig = (parse(raw) as AppConfig) ?? structuredClone(DEFAULT_CONFIG)
    console.log('[appState] config loaded successfully')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('[appState] config not found, writing defaults to', configFile)
      await mkdir(CONFIG_DIR, { recursive: true })
      await writeFile(configFile, stringify(DEFAULT_CONFIG), 'utf8')
      cachedConfig = structuredClone(DEFAULT_CONFIG)
    } else {
      console.error('[appState] unexpected error reading config:', err)
      throw err
    }
  }
  stockDef = (cachedConfig.app?.stock as StockDef | null | undefined) ?? null
  configLoaded = true
  return cachedConfig
}

export async function setConfig(config: AppConfig): Promise<void> {
  cachedConfig = config
  configLoaded = true
  const configFile = join(CONFIG_DIR, 'app.yaml')
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(configFile, stringify(config), 'utf8')
}

// ─── Machine connection ───────────────────────────────────────────────────────

export function getConnection(): ConnectionState {
  return { ...connection }
}

export function setConnection(state: Partial<ConnectionState>): ConnectionState {
  Object.assign(connection, state)
  return { ...connection }
}

// ─── Full state snapshot ──────────────────────────────────────────────────────

export function getFullState() {
  return { config: cachedConfig, connection: getConnection() }
}

// getMachineStatus is injected at startup to avoid a circular dependency with the poller
let _getMachineStatus: (() => MachineStatus | null) | null = null

export function registerMachineStatusProvider(fn: () => MachineStatus | null) {
  _getMachineStatus = fn
}

export function getSnapshot() {
  return {
    config: cachedConfig,
    connection: getConnection(),
    ui,
    job: getJobState(),
    machine: _getMachineStatus?.() ?? null,
    stock: stockDef,
  }
}
