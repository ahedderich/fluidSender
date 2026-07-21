import { defineStore } from 'pinia'
import type { Macro, MacroTrigger, MacroVariable } from '~/types/macro'
import { wsSend } from '~/composables/useWsSend'
import type { ToolchangeConfig, MagazineConfig, ToolsetterConfig, ToolchangeSpatialConfig } from '~/../../shared/toolchange'
import { DEFAULT_TOOLCHANGE_CONFIG } from '#shared/toolchange'
import type { WebcamConfig } from '~/types/webcam'
import type { FluidNCBootInfo } from '~~/server/utils/machine/bootInfoParser'

export type { Macro, MacroTrigger, MacroVariable }
export type { ToolchangeConfig, MagazineConfig, ToolsetterConfig, ToolchangeSpatialConfig }
export type { WebcamConfig }
export type { FluidNCBootInfo }

export type ConnectionType = 'usb' | 'tcp'
export type MachineType = 'router' | 'laser' | 'plasma'
export type ViewKey = 'iso' | 'top' | 'front' | 'right'
export type UnitSystem = 'mm' | 'inch'
export type UserRole = 'viewer' | 'operator' | 'admin'

// ─── FluidNC firmware config interfaces ──────────────────────────────────────

export interface FluidNCAxisConfig {
  steps_per_mm?: number
  max_rate_mm_per_min?: number
  acceleration_mm_per_sec2?: number
  max_travel_mm?: number
  soft_limits?: boolean
  homing?: {
    cycle?: number
    positive_direction?: boolean
    mpos?: number
    feed_rate?: number
    seek_rate?: number
    settle_ms?: number
  }
  motor0?: Record<string, unknown>
  motor1?: Record<string, unknown>
}

export interface MacroButton {
  id: string
  label: string
  command: string
}

export interface FluidNCConfig {
  /** Raw YAML string exactly as fetched from firmware filesystem */
  rawYaml: string
  /** Filename on the controller filesystem (e.g. "config.yaml") — used as upload target */
  configFilename: string
  /** Parsed top-level fields — subset used by UI */
  name?: string
  board?: string
  axes?: Record<string, FluidNCAxisConfig>
  /** Any other top-level YAML keys, stored as-is */
  [key: string]: unknown
}

// ─── FluidSender-owned machine settings ──────────────────────────────────────

export interface ConnectionConfig {
  type: ConnectionType
  serialPort: string
  baudRate: 115200 | 921600
  tcpHost: string
  tcpPort: number
}

export interface JogLevelSettings {
  speed: number
  xyStep: number
  zStep: number
}

export interface JogSettings {
  slow: JogLevelSettings
  medium: JogLevelSettings
  fast: JogLevelSettings
}

export interface MachineJogOverride {
  enabled: boolean
  slow: JogLevelSettings
  medium: JogLevelSettings
  fast: JogLevelSettings
}

export interface ParkPosition {
  x: number
  y: number
  z: number
}

export interface FirmwareUpdateCheck {
  latestVersion: string | null
  checkedAt: number | null
}

export interface MachineProfile {
  id: string
  name: string
  type: MachineType
  connection: ConnectionConfig
  macros: Macro[]
  toolchange: ToolchangeConfig
  /** null until first firmware connect — loaded fresh on each connect */
  fluidncConfig: FluidNCConfig | null
  /** IP of the FluidNC machine, populated from $SS on connect — null for USB connections */
  fluidncIp?: string | null
  /** Per-machine override of the global jog speed presets — falls back to app.jog when disabled/unset */
  jogOverride?: MachineJogOverride
  /** Safe parking position in work coordinates (G54); undefined until configured */
  parkPosition?: ParkPosition
  /** Webcam view config; undefined until configured in the Webcam settings tab */
  webcam?: WebcamConfig
  /** Last version reported by $I on any connect — a display cache, never treated as live truth while disconnected */
  lastKnownFirmwareVersion?: string | null
  /** Latest bdring/FluidNC release known as of the last check for this machine */
  firmwareUpdateCheck?: FirmwareUpdateCheck
  /** Config-validity/network/HTTP status parsed from $SS on the last connect — a display
   *  cache ("latest boot information"), never treated as live truth while disconnected. */
  bootInfo?: FluidNCBootInfo | null
}

// ─── App-level settings types ─────────────────────────────────────────────────

export type ShortcutActionId =
  | 'jogXPos'
  | 'jogXNeg'
  | 'jogYPos'
  | 'jogYNeg'
  | 'jogZPos'
  | 'jogZNeg'
  | 'feedHold'
  | 'cycleStart'
  | 'softReset'
  | 'home'
  | 'speedSlow'
  | 'speedMedium'
  | 'speedFast'
  | 'dialogCancel'
  | 'dialogConfirm'

export type SafetyKeyOption = 'shift' | 'ctrl' | 'alt' | 'none'

export interface KeyboardShortcuts {
  safetyKey: SafetyKeyOption
  requiresSafetyKey: Partial<Record<ShortcutActionId, boolean>>
  jogXPos: string
  jogXNeg: string
  jogYPos: string
  jogYNeg: string
  jogZPos: string
  jogZNeg: string
  feedHold: string
  cycleStart: string
  softReset: string
  home: string
  speedSlow: string
  speedMedium: string
  speedFast: string
  dialogCancel: string
  dialogConfirm: string
}

interface PersistedConfig {
  auth?: { enabled?: boolean }
  machines?: MachineProfile[]
  app?: {
    units?: UnitSystem
    macros?: Macro[]
    viewport?: { defaultView?: ViewKey; showGrid?: boolean; showAxes?: boolean }
    jog?: Partial<JogSettings>
    shortcuts?: Partial<KeyboardShortcuts>
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = defineStore('settings', () => {
  const initialized = ref(false)
  const saving = ref(false)

  const machines = ref<MachineProfile[]>([])
  const activeMachineId = ref('')

  const activeMachine = computed(() => machines.value.find((m) => m.id === activeMachineId.value) ?? null)
  const hasMachines = computed(() => machines.value.length > 0)

  function selectMachine(id: string) {
    activeMachineId.value = id
    wsSend({ t: 'ui:selection', payload: { activeMachineId: id } })
  }

  function setActiveMachineId(id: string) {
    activeMachineId.value = id
  }

  function addMachine() {
    const id = `machine-${Date.now()}`
    machines.value.push({
      id,
      name: 'New Machine',
      type: 'router',
      connection: { type: 'tcp', serialPort: '', baudRate: 115200, tcpHost: '', tcpPort: 23 },
      macros: [],
      toolchange: {
        ...DEFAULT_TOOLCHANGE_CONFIG,
        magazine: { ...DEFAULT_TOOLCHANGE_CONFIG.magazine },
        magazineSlots: [],
      },
      fluidncConfig: null,
    })
    activeMachineId.value = id
    wsSend({ t: 'ui:selection', payload: { activeMachineId: id } })
  }

  function removeMachine(id: string) {
    const idx = machines.value.findIndex((m) => m.id === id)
    if (idx === -1) return
    machines.value.splice(idx, 1)
    if (activeMachineId.value === id) {
      const newId = machines.value[0]?.id ?? ''
      activeMachineId.value = newId
      wsSend({ t: 'ui:selection', payload: { activeMachineId: newId } })
    }
  }

  // FluidSender app-level settings — authoritative on Bun server, pushed to all clients
  const app = reactive({
    units: 'mm' as UnitSystem,
    macros: [] as Macro[],
    viewport: {
      defaultView: 'iso' as ViewKey,
      showGrid: true,
      showAxes: true,
    },
    jog: {
      slow: { speed: 100, xyStep: 0.1, zStep: 0.05 },
      medium: { speed: 500, xyStep: 1.0, zStep: 0.5 },
      fast: { speed: 2000, xyStep: 5.0, zStep: 2.0 },
    } as JogSettings,
    shortcuts: {
      safetyKey: 'none' as SafetyKeyOption,
      requiresSafetyKey: {
        jogXPos: true, jogXNeg: true, jogYPos: true, jogYNeg: true,
        jogZPos: true, jogZNeg: true,
        feedHold: true, cycleStart: true, softReset: true, home: true,
        speedSlow: true, speedMedium: true, speedFast: true,
        dialogCancel: false, dialogConfirm: false,
      },
      jogXPos: 'ArrowRight',
      jogXNeg: 'ArrowLeft',
      jogYPos: 'ArrowUp',
      jogYNeg: 'ArrowDown',
      jogZPos: 'PageUp',
      jogZNeg: 'PageDown',
      feedHold: 'f',
      cycleStart: 'c',
      softReset: 'r',
      home: 'h',
      speedSlow: 'z',
      speedMedium: 'a',
      speedFast: 'q',
      dialogCancel: 'Escape',
      dialogConfirm: 'Enter',
    } as KeyboardShortcuts,
    auth: {
      enabled: false,
    },
  })

  function _migrateMacros(raw: unknown[]): Macro[] {
    return raw.map((m) => {
      const macro = m as Record<string, unknown>
      // Backward compat: old MacroButton shape { id, label, command }
      if ('command' in macro && !('gcode' in macro)) {
        return {
          id: macro['id'] as string,
          name: (macro['label'] as string) ?? '',
          trigger: { kind: 'direct' } as MacroTrigger,
          gcode: (macro['command'] as string) ?? '',
          requiresToolChange: false,
        } satisfies Macro
      }
      // New shape — fill in missing trigger with default
      return {
        ...macro,
        trigger: (macro['trigger'] as MacroTrigger) ?? { kind: 'direct' },
      } as Macro
    })
  }

  // Backward compat: pre-existing configs stored flat { slowSpeed, mediumSpeed, fastSpeed, xyStep, zStep }
  // with a single step size shared across all speed levels.
  function _migrateJog(raw: unknown): JogSettings {
    const j = raw as Record<string, unknown>
    if ('slow' in j) return j as unknown as JogSettings
    const xyStep = (j['xyStep'] as number) ?? 1.0
    const zStep = (j['zStep'] as number) ?? 0.5
    return {
      slow: { speed: (j['slowSpeed'] as number) ?? 100, xyStep, zStep },
      medium: { speed: (j['mediumSpeed'] as number) ?? 500, xyStep, zStep },
      fast: { speed: (j['fastSpeed'] as number) ?? 2000, xyStep, zStep },
    }
  }

  function applyServerState(data: PersistedConfig) {
    machines.value = (data.machines ?? []).map((m) => {
      // Migrate old shape: toolChangeMacro + magazine + probe → toolchange discriminated union
      if ('toolChangeMacro' in m && !('toolchange' in m)) {
        const macro = (m as Record<string, unknown>).toolChangeMacro as string
        ;(m as Record<string, unknown>).toolchange = macro?.trim()
          ? { strategy: 'custom-macro', macro, magazine: { enabled: false, size: 0 }, magazineSlots: [] }
          : { strategy: 'manual-basic' }
        delete (m as Record<string, unknown>).toolChangeMacro
        delete (m as Record<string, unknown>).probe
        delete (m as Record<string, unknown>).magazine
      }
      const toolchange = m.toolchange ?? { strategy: 'manual-basic' as const }
      const magazine = toolchange.magazine ?? { ...DEFAULT_TOOLCHANGE_CONFIG.magazine }
      // Backfill: `approach` was added to moving-magazine automation after some configs
      // may already have been saved without it.
      if (magazine.automation?.type === 'moving' && !magazine.automation.approach) {
        magazine.automation.approach = { axis: 'x', direction: 1, distance: 50 }
      }
      // Backfill: `safeZ` (fixed only) and `seatFeedMmPerMin` (both) were added after some
      // magazine automation configs may already have been saved without them.
      if (magazine.automation?.type === 'fixed' && magazine.automation.safeZ === undefined) {
        magazine.automation.safeZ = 0
      }
      if (magazine.automation && magazine.automation.seatFeedMmPerMin === undefined) {
        magazine.automation.seatFeedMmPerMin = 100
      }
      // Backfill: `translateToolNumberToSlot` was added after some atc-passthrough/
      // atc-managed/atc-rapidchange configs may already have been saved without it.
      if (
        (toolchange.strategy === 'atc-passthrough' || toolchange.strategy === 'atc-managed' || toolchange.strategy === 'atc-rapidchange')
        && toolchange.translateToolNumberToSlot === undefined
      ) {
        toolchange.translateToolNumberToSlot = false
      }
      return {
        ...m,
        toolchange: {
          ...toolchange,
          magazine,
          magazineSlots: toolchange.magazineSlots ?? [],
        } as ToolchangeConfig,
        macros: _migrateMacros(m.macros ?? []),
      }
    })
    if (data.auth) {
      app.auth.enabled = data.auth.enabled ?? false
    }
    if (data.app) {
      if (data.app.units) app.units = data.app.units
      if (data.app.macros) app.macros = _migrateMacros(data.app.macros as unknown[])
      if (data.app.viewport) Object.assign(app.viewport, data.app.viewport)
      if (data.app.jog) {
        const migrated = _migrateJog(data.app.jog)
        Object.assign(app.jog.slow, migrated.slow)
        Object.assign(app.jog.medium, migrated.medium)
        Object.assign(app.jog.fast, migrated.fast)
      }
      if (data.app.shortcuts) {
        const { requiresSafetyKey, ...shortcutRest } = data.app.shortcuts as Partial<KeyboardShortcuts>
        Object.assign(app.shortcuts, shortcutRest)
        if (requiresSafetyKey) Object.assign(app.shortcuts.requiresSafetyKey, requiresSafetyKey)
      }
    }
  }

  async function hydrate(fetchFn: typeof $fetch = $fetch) {
    if (initialized.value) return
    try {
      const data = await fetchFn<PersistedConfig>('/api/config')
      applyServerState(data)
    } finally {
      initialized.value = true
    }
  }

  async function save() {
    saving.value = true
    try {
      await $fetch('/api/config', {
        method: 'PUT',
        body: {
          auth: { enabled: app.auth.enabled },
          machines: machines.value,
          app: {
            units: app.units,
            macros: app.macros,
            viewport: app.viewport,
            jog: app.jog,
            shortcuts: app.shortcuts,
          },
        },
      })
    } finally {
      saving.value = false
    }
  }

  function addAppMacro(macro: Macro) {
    app.macros.push(macro)
  }
  function updateAppMacro(macro: Macro) {
    const idx = app.macros.findIndex((m) => m.id === macro.id)
    if (idx !== -1) app.macros.splice(idx, 1, macro)
  }
  function removeAppMacro(id: string) {
    const idx = app.macros.findIndex((m) => m.id === id)
    if (idx !== -1) app.macros.splice(idx, 1)
  }
  function addMachineMacro(machineId: string, macro: Macro) {
    const m = machines.value.find((mc) => mc.id === machineId)
    if (!m) return
    m.macros.push(macro)
  }
  function updateMachineMacro(machineId: string, macro: Macro) {
    const m = machines.value.find((mc) => mc.id === machineId)
    if (!m) return
    const idx = m.macros.findIndex((mc) => mc.id === macro.id)
    if (idx !== -1) m.macros.splice(idx, 1, macro)
  }
  function removeMachineMacro(machineId: string, macroId: string) {
    const m = machines.value.find((mc) => mc.id === machineId)
    if (!m) return
    const idx = m.macros.findIndex((mc) => mc.id === macroId)
    if (idx !== -1) m.macros.splice(idx, 1)
  }
  function runMacro(macroId: string, formValues: Record<string, string> = {}) {
    wsSend({ t: 'macro:run', payload: { macroId, formValues } })
  }

  function checkAppVersion(force = false) {
    wsSend({ t: 'app:checkVersion', payload: { force } })
  }

  return {
    initialized,
    saving,
    machines,
    activeMachineId,
    activeMachine,
    hasMachines,
    selectMachine,
    setActiveMachineId,
    addMachine,
    removeMachine,
    hydrate,
    applyServerState,
    save,
    addAppMacro,
    updateAppMacro,
    removeAppMacro,
    addMachineMacro,
    updateMachineMacro,
    removeMachineMacro,
    runMacro,
    checkAppVersion,
    app,
  }
})
