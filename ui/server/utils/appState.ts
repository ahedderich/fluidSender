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
  measuredWidth?: number
  measuredHeight?: number
  measuredDiameter?: number
}

export type ProbingPhase = 'idle' | 'running' | 'aborted' | 'completed'

export interface ProbingStepResult {
  axis: 'X' | 'Y' | 'Z'
  direction: '+' | '-'
  edgeWpos: number
}

export interface ProbingRotationResult {
  rotationDeg: number
  bowMm: number
  edge: 'top' | 'bottom' | 'left' | 'right'
}

export interface HeightmapResult {
  colCount: number
  rowCount: number
  spacingX: number
  spacingY: number
  originX: number
  originY: number
  values: (number | null)[]
}

export interface ProbingState {
  phase: ProbingPhase
  wizardKey: string | null
  currentStepLabel: string
  stepIndex: number
  totalSteps: number
  stepResults: ProbingStepResult[]
  measuredCenterX: number | null
  measuredCenterY: number | null
  measuredWidth: number | null
  measuredHeight: number | null
  measuredDiameter: number | null
  rotation: ProbingRotationResult | null
  heightmap: HeightmapResult | null
  errorMessage: string | null
  edgeHistoryX: [number | null, number | null]
  edgeHistoryY: [number | null, number | null]
}

export interface ConnectionState {
  machineId: string | null
  connected: boolean
  status: string
  firmwareVersion: string
  simulatorMode: boolean
  /** Null = unknown/not yet resolved this session (set once `$SS` parses on connect). */
  configValid: boolean | null
  /** Null = unknown/unverified this session — never a bare 0 (see toolLengthState.ts). */
  toolLengthOffset: number | null
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

export interface MacroRunState {
  status: 'running' | 'done' | 'error'
  macroId: string
  macroName: string
  errorMessage: string | null
}

export interface UiState {
  nav: {
    probingTab: string
    route: string
    wizard: { key: string | null; step: number }
  }
  selection: { activeMachineId: string; selectedToolId: string | null; selectedFile: string | null }
  jogActive: boolean
  calibrationActive: boolean
  modals: ModalEntry[]
  toasts: Toast[]
  console: UiConsoleEntry[]
  loadedToolNumber: number | null
  macroRun: MacroRunState | null
  probingState: ProbingState
}

const CONSOLE_LIMIT = 300

const ui: UiState = {
  nav: { probingTab: 'stock', route: '/', wizard: { key: null, step: 0 } },
  selection: { activeMachineId: '', selectedToolId: null, selectedFile: null },
  jogActive: false,
  calibrationActive: false,
  modals: [],
  toasts: [],
  console: [],
  loadedToolNumber: null,
  macroRun: null,
  probingState: {
    phase: 'idle', wizardKey: null, currentStepLabel: '',
    stepIndex: 0, totalSteps: 0, stepResults: [],
    measuredCenterX: null, measuredCenterY: null,
    measuredWidth: null, measuredHeight: null, measuredDiameter: null,
    rotation: null, heightmap: null, errorMessage: null,
    edgeHistoryX: [null, null], edgeHistoryY: [null, null],
  } as ProbingState,
}

// ─── Tool change mode flag (runtime-only, not synced to clients) ──────────────
let _toolChangeModeActive = false

export function setToolChangeModeActive(active: boolean): void {
  _toolChangeModeActive = active
}

export function isToolChangeModeActive(): boolean {
  return _toolChangeModeActive
}

// A patch op targets a top-level UiState slice by `path`. Scalars use `set`;
// arrays (modals/toasts/console) use `push`/`removeId`. `meta` carries extra
// data alongside a removal (e.g. a modal's resolution result).
export type PatchOp =
  | { path: string; set: Record<string, unknown> }
  | { path: string; push: unknown }
  | { path: string; removeId: string; meta?: Record<string, unknown> }
  | { path: string; clear: true }

export interface UserRecord {
  id: string
  username: string
  role: 'viewer' | 'operator' | 'admin'
  passwordHash: string
}

interface AppConfig {
  auth?: {
    enabled?: boolean
    users?: UserRecord[]
  }
  machines?: unknown[]
  app?: Record<string, unknown>
}

function stripAuthUsers(config: AppConfig): AppConfig {
  if (!config.auth?.users?.length) return config
  return { ...config, auth: { ...config.auth, users: undefined } }
}

export { stripAuthUsers }

const DEFAULT_CONFIG: AppConfig = {
  auth: { enabled: false, users: [] },
  machines: [],
  app: {
    units: 'mm',
    macros: [],
    viewport: { defaultView: 'iso', showGrid: true, showAxes: true },
    jog: {
      slow: { speed: 100, xyStep: 0.1, zStep: 0.05 },
      medium: { speed: 500, xyStep: 1.0, zStep: 0.5 },
      fast: { speed: 2000, xyStep: 5.0, zStep: 2.0 },
    },
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

// ─── App update check (server-authoritative, persisted in app.yaml) ───────────
// Tracks the latest known ahedderich/fluidSender release, checked at most once a
// day (see server/utils/githubReleaseCheck.ts). One global value — unlike FluidNC
// firmware, there's only one running FluidSender instance to compare against.

export interface AppUpdateCheck {
  latestVersion: string | null
  checkedAt: number | null
}

let appUpdateCheck: AppUpdateCheck = { latestVersion: null, checkedAt: null }

export function getAppUpdateCheck(): AppUpdateCheck {
  return appUpdateCheck
}

export async function setAppUpdateCheck(patch: Partial<AppUpdateCheck>): Promise<PatchOp> {
  Object.assign(appUpdateCheck, patch)
  const config = await getConfig()
  config.app = { ...(config.app ?? {}), appUpdateCheck }
  await setConfig(config)
  return { path: 'appUpdateCheck', set: { ...appUpdateCheck } }
}

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

export async function clearStock(): Promise<PatchOp[]> {
  stockDef = null
  const config = await getConfig()
  config.app = { ...(config.app ?? {}), stock: null }
  await setConfig(config)
  return [
    { path: 'stock', set: { stock: null } },
    setProbingState({
      measuredWidth: null, measuredHeight: null, measuredDiameter: null,
      rotation: null, heightmap: null,
      edgeHistoryX: [null, null], edgeHistoryY: [null, null],
    }),
  ]
}

export async function clearMeasurements(): Promise<PatchOp> {
  const op = setProbingState({
    measuredWidth: null, measuredHeight: null, measuredDiameter: null,
    rotation: null, heightmap: null,
    edgeHistoryX: [null, null], edgeHistoryY: [null, null],
  })
  const config = await getConfig()
  config.app = { ...(config.app ?? {}), probingResults: { rotation: null, heightmap: null } }
  await setConfig(config)
  return op
}

export async function saveProbingResults(): Promise<void> {
  const config = await getConfig()
  config.app = {
    ...(config.app ?? {}),
    probingResults: {
      rotation: ui.probingState.rotation,
      heightmap: ui.probingState.heightmap,
    },
  }
  await setConfig(config)
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
  accumulatedRunMs: 0,
  axisRanges: null,
  analyzeProgress: 0,
  toolSections: null,
  recovery: null,
  errorMessage: null,
  toolChangeRequest: null,
  programPause: null,
  toolPreferences: {},
  ambiguousTools: [],
  transformMode: 'none',
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
  simulatorMode: false,
  configValid: null,
  toolLengthOffset: null,
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

export function setCalibrationActive(active: boolean): PatchOp {
  ui.calibrationActive = active
  return { path: 'calibrationActive', set: { calibrationActive: active } }
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

// ─── Server-side program-pause modal registry ─────────────────────────────────
const _programPauseHandlers = new Map<string, (action: 'continue' | 'cancel' | 'closed') => void>()

export function openProgramPauseModal(comment: string | null): { id: string; op: PatchOp } {
  const id = (globalThis.crypto?.randomUUID?.() ?? `pp-${Date.now()}-${Math.random().toString(36).slice(2)}`) as string
  const entry: ModalEntry = { id, kind: 'program_pause', props: comment != null ? { comment } : {} }
  ui.modals.push(entry)
  return { id, op: { path: 'modals', push: entry } }
}

export function registerProgramPauseHandler(id: string, handler: (action: 'continue' | 'cancel' | 'closed') => void): void {
  _programPauseHandlers.set(id, handler)
}

/** Resolves a modal, calling any registered program-pause or toolchange handler first. */
export function settleProgramPauseModal(id: string, result: unknown): PatchOp | null {
  const ppHandler = _programPauseHandlers.get(id)
  if (ppHandler) {
    _programPauseHandlers.delete(id)
    ppHandler(result as 'continue' | 'cancel' | 'closed')
  }
  const tcHandler = _toolchangeHandlers.get(id)
  if (tcHandler) {
    _toolchangeHandlers.delete(id)
    tcHandler()
  }
  return resolveModal(id, result)
}

// ─── Toolchange modal resolve handler registry ────────────────────────────────

const _toolchangeHandlers = new Map<string, () => void>()

export function registerToolchangeResolveHandler(id: string, handler: () => void): void {
  _toolchangeHandlers.set(id, handler)
}

export function unregisterToolchangeResolveHandler(id: string): void {
  _toolchangeHandlers.delete(id)
}

// ─── Toolchange modal helpers ─────────────────────────────────────────────────

export type ToolchangePhase = 'waiting_for_swap' | 'probing' | 'probe_result' | 'error'

export interface ToolchangeModalProps {
  phase: ToolchangePhase
  currentToolNumber: number | null
  nextToolNumber: number | null
  isJobContext: boolean
  operation?: 'load' | 'unload' | 'measure'
  probedOffset?: number
  errorMessage?: string
  /** True when this swap will be followed by an automatic toolsetter probe — drives the
   *  step indicator and button copy client-side. Not derived from toolchange strategy
   *  there, since a magazine-missing-slot fallback can enter this same dialog from an ATC
   *  strategy that isn't 'manual-toolsetter'. */
  requiresProbe?: boolean
}

export function openToolchangeModal(props: ToolchangeModalProps): { id: string; op: PatchOp } {
  const id = (globalThis.crypto?.randomUUID?.() ?? `tc-${Date.now()}-${Math.random().toString(36).slice(2)}`) as string
  const entry: ModalEntry = { id, kind: 'toolchange', props: props as unknown as Record<string, unknown> }
  ui.modals.push(entry)
  return { id, op: { path: 'modals', push: entry } }
}

export function updateToolchangeModal(id: string, props: Partial<ToolchangeModalProps>): PatchOp[] {
  const idx = ui.modals.findIndex((m) => m.id === id)
  if (idx === -1) return []
  const existing = ui.modals[idx]!
  const updated: ModalEntry = { ...existing, props: { ...existing.props, ...props as unknown as Record<string, unknown> } }
  ui.modals.splice(idx, 1, updated)
  return [
    { path: 'modals', removeId: id },
    { path: 'modals', push: updated },
  ]
}

export async function updateMagazineSlots(machineId: string, slots: (number | null)[]): Promise<PatchOp> {
  const config = await getConfig()
  const machines = (config.machines ?? []) as Array<Record<string, unknown>>
  const machine = machines.find((m) => m.id === machineId)
  if (machine && machine.toolchange && typeof machine.toolchange === 'object') {
    const tc = machine.toolchange as Record<string, unknown>
    if ('magazineSlots' in tc) {
      tc.magazineSlots = slots
      await setConfig(config)
    }
  }
  return { path: 'config', set: stripAuthUsers(config) as unknown as Record<string, unknown> }
}

export async function setTolBaseline(machineId: string, value: number): Promise<PatchOp> {
  const config = await getConfig()
  const machines = (config.machines ?? []) as Array<Record<string, unknown>>
  const machine = machines.find((m) => m.id === machineId)
  if (machine && machine.toolchange && typeof machine.toolchange === 'object') {
    const tc = machine.toolchange as Record<string, unknown>
    if (tc.strategy === 'manual-toolsetter' && tc.position && typeof tc.position === 'object') {
      (tc.position as Record<string, unknown>).tolBaseline = value
      await setConfig(config)
    }
  }
  return { path: 'config', set: stripAuthUsers(config) as unknown as Record<string, unknown> }
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

export function setMacroRunState(state: MacroRunState | null): PatchOp {
  ui.macroRun = state
  return { path: 'macroRun', set: { macroRun: state } }
}

export function getProbingState(): ProbingState {
  return ui.probingState
}

export function setProbingState(patch: Partial<ProbingState>): PatchOp {
  Object.assign(ui.probingState, patch)
  return { path: 'probingState', set: { ...ui.probingState } as unknown as Record<string, unknown> }
}

export async function setLoadedTool(machineId: string, toolNumber: number | null): Promise<PatchOp> {
  ui.loadedToolNumber = toolNumber
  const config = await getConfig()
  const loadedTools = (config.app?.loadedTools as Record<string, number> | undefined) ?? {}
  if (toolNumber === null) {
    Reflect.deleteProperty(loadedTools, machineId)
  } else {
    loadedTools[machineId] = toolNumber
  }
  config.app = { ...(config.app ?? {}), loadedTools }
  await setConfig(config)
  return { path: 'ui', set: { loadedToolNumber: toolNumber } }
}

export function clearLoadedToolDisplay(): PatchOp {
  ui.loadedToolNumber = null
  return { path: 'ui', set: { loadedToolNumber: null } }
}

export async function getLoadedToolForMachine(machineId: string): Promise<number | null> {
  const config = await getConfig()
  const loadedTools = config.app?.loadedTools as Record<string, number> | undefined
  return loadedTools?.[machineId] ?? null
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
  const savedAppUpdateCheck = cachedConfig.app?.appUpdateCheck as AppUpdateCheck | undefined
  if (savedAppUpdateCheck) appUpdateCheck = savedAppUpdateCheck
  const savedResults = cachedConfig.app?.probingResults as { rotation?: ProbingRotationResult | null; heightmap?: HeightmapResult | null } | undefined
  if (savedResults) {
    if (savedResults.rotation !== undefined) ui.probingState.rotation = savedResults.rotation ?? null
    if (savedResults.heightmap !== undefined) ui.probingState.heightmap = savedResults.heightmap ?? null
  }
  const savedMachineId = cachedConfig.app?.lastMachineId as string | undefined
  if (savedMachineId) ui.selection.activeMachineId = savedMachineId
  configLoaded = true
  return cachedConfig
}

export async function persistLastMachineId(machineId: string): Promise<void> {
  const config = await getConfig()
  config.app = { ...(config.app ?? {}), lastMachineId: machineId }
  await setConfig(config)
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
  return { config: stripAuthUsers(cachedConfig), connection: getConnection() }
}

// getMachineStatus is injected at startup to avoid a circular dependency with the poller
let _getMachineStatus: (() => MachineStatus | null) | null = null
let _getToolLibrary: ((machineId: string) => { machine: unknown[]; app: unknown[] }) | null = null

export function registerMachineStatusProvider(fn: () => MachineStatus | null) {
  _getMachineStatus = fn
}

export function registerToolLibraryProvider(fn: (machineId: string) => { machine: unknown[]; app: unknown[] }) {
  _getToolLibrary = fn
}

export function getSnapshot() {
  const machineId = ui.selection.activeMachineId
  return {
    config: stripAuthUsers(cachedConfig),
    connection: getConnection(),
    ui,
    job: getJobState(),
    machine: _getMachineStatus?.() ?? null,
    stock: stockDef,
    toolLibrary: _getToolLibrary ? _getToolLibrary(machineId) : { machine: [], app: [] },
    macroRun: ui.macroRun,
    probingState: ui.probingState,
    appUpdateCheck,
  }
}
