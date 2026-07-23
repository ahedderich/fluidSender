import { defineStore } from 'pinia'
import type { JobState } from '~/types/job'
import type { MacroRunState } from '~/types/macro'
import type { ProbingState } from '~~/server/utils/appState'

export type { ProbingState }

export interface ModalEntry {
  id: string
  kind: string
  props?: Record<string, unknown>
}

export interface Toast {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
  timeout: number
}

export interface SyncConsoleEntry {
  id: number
  type: 'sent' | 'recv' | 'info' | 'error'
  text: string
  ts: number
}

export interface AppUpdateCheck {
  latestVersion: string | null
  checkedAt: number | null
}

export interface UiSnapshot {
  nav: {
    probingTab: string
    route: string
    wizard: { key: string | null; step: number }
  }
  selection: { activeMachineId: string; selectedToolId: string | null; selectedFile: string | null }
  jogActive: boolean
  calibrationActive?: boolean
  modals: ModalEntry[]
  toasts: Toast[]
  console: SyncConsoleEntry[]
  loadedToolNumber: number | null
  macroRun?: MacroRunState | null
  probingState?: ProbingState
}

export type PatchOp =
  | { path: string; set: Record<string, unknown> }
  | { path: string; push: unknown }
  | { path: string; removeId: string; meta?: Record<string, unknown> }
  | { path: string; clear: true }

const CONSOLE_LIMIT = 300

export const useSyncStore = defineStore('sync', () => {
  const nav = reactive({
    probingTab: 'stock',
    route: '/',
    wizard: { key: null as string | null, step: 0 },
  })
  const selection = reactive({
    activeMachineId: '',
    selectedToolId: null as string | null,
    selectedFile: null as string | null,
  })
  const jogActive = ref(false)
  const calibrationActive = ref(false)
  const modals = ref<ModalEntry[]>([])
  const toasts = ref<Toast[]>([])
  const consoleLog = ref<SyncConsoleEntry[]>([])
  const job = ref<JobState | null>(null)
  const macroRun = ref<MacroRunState | null>(null)
  const session = ref<{ username: string; role: 'viewer' | 'operator' | 'admin' } | null>(null)
  const probingState = reactive<ProbingState>({
    phase: 'idle', wizardKey: null, currentStepLabel: '',
    stepIndex: 0, totalSteps: 0, stepResults: [],
    measuredCenterX: null, measuredCenterY: null,
    measuredWidth: null, measuredHeight: null, measuredDiameter: null,
    rotation: null, heightmap: null, errorMessage: null,
    edgeHistoryX: [null, null], edgeHistoryY: [null, null],
  })
  const appUpdateCheck = reactive<AppUpdateCheck>({ latestVersion: null, checkedAt: null })

  // Always mutate the array refs in place (never reassign), so references held by
  // useModals()/useToast() stay valid across snapshots and patches.
  function applySnapshot(ui: UiSnapshot & { session?: { username: string; role: 'viewer' | 'operator' | 'admin' } | null }) {
    Object.assign(nav, ui.nav)
    Object.assign(selection, ui.selection)
    jogActive.value = ui.jogActive
    calibrationActive.value = ui.calibrationActive ?? false
    modals.value.splice(0, modals.value.length, ...ui.modals)
    toasts.value.splice(0, toasts.value.length, ...ui.toasts)
    consoleLog.value.splice(0, consoleLog.value.length, ...ui.console)
    macroRun.value = ui.macroRun ?? null
    if (ui.probingState) Object.assign(probingState, ui.probingState)
    if ('session' in ui) session.value = ui.session ?? null
  }

  // Apply a single patch op to the precise reactive slice it targets, so only
  // components depending on that slice re-render.
  function applyOp(op: PatchOp) {
    switch (op.path) {
      case 'nav':
        if ('set' in op) Object.assign(nav, op.set)
        break
      case 'selection':
        if ('set' in op) Object.assign(selection, op.set)
        break
      case 'jogActive':
        if ('set' in op) jogActive.value = (op.set as { jogActive: boolean }).jogActive
        break
      case 'calibrationActive':
        if ('set' in op) calibrationActive.value = (op.set as { calibrationActive: boolean }).calibrationActive
        break
      case 'modals':
        if ('push' in op) modals.value.push(op.push as ModalEntry)
        else if ('removeId' in op) {
          const i = modals.value.findIndex((m) => m.id === op.removeId)
          if (i !== -1) modals.value.splice(i, 1)
        }
        break
      case 'toasts':
        if ('push' in op) toasts.value.push(op.push as Toast)
        else if ('removeId' in op) {
          const i = toasts.value.findIndex((t) => t.id === op.removeId)
          if (i !== -1) toasts.value.splice(i, 1)
        }
        break
      case 'console':
        if ('push' in op) {
          consoleLog.value.push(op.push as SyncConsoleEntry)
          if (consoleLog.value.length > CONSOLE_LIMIT) {
            consoleLog.value.splice(0, consoleLog.value.length - CONSOLE_LIMIT)
          }
        } else if ('clear' in op) {
          consoleLog.value.splice(0)
        }
        break
      case 'macroRun':
        if ('set' in op) macroRun.value = (op.set as { macroRun: MacroRunState | null }).macroRun
        break
      case 'probingState':
        if ('set' in op) Object.assign(probingState, op.set)
        break
      case 'appUpdateCheck':
        if ('set' in op) Object.assign(appUpdateCheck, op.set)
        break
      case 'session':
        if ('set' in op) session.value = (op.set as { session: typeof session.value }).session
        break
    }
  }

  function applyJobState(state: JobState) {
    job.value = { ...state }
  }

  return { nav, selection, jogActive, calibrationActive, modals, toasts, consoleLog, job, macroRun, probingState, appUpdateCheck, session, applySnapshot, applyOp, applyJobState }
})
