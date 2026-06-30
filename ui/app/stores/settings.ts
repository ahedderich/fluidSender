import { defineStore } from 'pinia'
import type { Macro, MacroTrigger, MacroVariable } from '~/types/macro'
import { wsSend } from '~/composables/useWsSend'

export type { Macro, MacroTrigger, MacroVariable }

export type ConnectionType = 'usb' | 'tcp'
export type MachineType = 'router' | 'laser' | 'plasma'
export type ViewKey = 'iso' | 'top' | 'front' | 'right'
export type UnitSystem = 'mm' | 'inch'
export type UserRole = 'viewer' | 'operator' | 'admin'

// ─── FluidNC firmware config interfaces ──────────────────────────────────────

export interface FluidNCHomingConfig {
  cycle: number
  allowSingleAxis: boolean
  positiveDirection: boolean
  mpos: number
  feedRate: number
  seekRate: number
  settleMs: number
  seekScaler: number
  feedScaler: number
}

export interface FluidNCMotorConfig {
  limitNegPin: string
  limitPosPin: string
  hardLimits: boolean
  pulloffMm: number
}

export interface FluidNCAxisConfig {
  stepsPerMm: number
  maxRateMmPerMin: number
  accelerationMmPerSec2: number
  maxTravelMm: number
  softLimits: boolean
  idleDisable: boolean
  homing: FluidNCHomingConfig
  motor0: FluidNCMotorConfig
}

export interface FluidNCSpindleConfig {
  type: 'PWMSpindle' | 'Laser' | 'NoSpindle' | 'BESC' | '10V' | 'DAC'
  outputPin: string
  enablePin: string
  directionPin: string
  pwmFreq: number
  spinupMs: number
  spindownMs: number
  minRpm: number
  maxRpm: number
  disableWithZeroSpeed: boolean
}

export interface FluidNCProbeConfig {
  pin: string
  toolsetterPin: string
  checkModeStart: boolean
  hardStop: boolean
}

export interface FluidNCCoolantConfig {
  floodPin: string
  mistPin: string
  delayMs: number
}

export interface FluidNCControlConfig {
  safetyDoorPin: string
  resetPin: string
  feedHoldPin: string
  cycleStartPin: string
}

export interface FluidNCSteppingConfig {
  engine: 'RMT' | 'I2S_STREAM' | 'I2S_STATIC' | 'STEPSTICK' | 'NONE'
  idleMs: number
  pulseUs: number
  dirDelayUs: number
  disableDelayUs: number
}

export interface FluidNCStartConfig {
  mustHome: boolean
  checkLimits: boolean
}

export interface FluidNCMacrosConfig {
  startupLine0: string
  startupLine1: string
  afterHoming: string
  afterReset: string
  afterUnlock: string
}

export interface MacroButton {
  id: string
  label: string
  command: string
}

export interface FluidNCConfig {
  name: string
  board: string
  reportInches: boolean
  arcToleranceMm: number
  junctionDeviationMm: number
  plannerBlocks: number
  stepping: FluidNCSteppingConfig
  axes: Record<string, FluidNCAxisConfig>
  spindle: FluidNCSpindleConfig
  probe: FluidNCProbeConfig
  coolant: FluidNCCoolantConfig
  control: FluidNCControlConfig
  start: FluidNCStartConfig
  macros: FluidNCMacrosConfig
}

// ─── FluidSender-owned machine settings ──────────────────────────────────────

export interface MagazineConfig {
  enabled: boolean
  size: number
}

export interface ProbeConfig {
  plateThickness: number
  toolSetterHeight: number
  tipDiameter: number
  xyFeed: number
  zFeed: number
}

export interface ConnectionConfig {
  type: ConnectionType
  serialPort: string
  baudRate: 115200 | 921600
  tcpHost: string
  tcpPort: number
}

export interface MachineProfile {
  id: string
  name: string
  type: MachineType
  connection: ConnectionConfig
  probe: ProbeConfig
  macros: Macro[]
  magazine: MagazineConfig
  /** null until first firmware connect — loaded fresh on each connect */
  fluidncConfig: FluidNCConfig | null
  /** GCode to run automatically before each tool change. Empty string = no automatic macro. */
  toolChangeMacro: string
}

// ─── App-level settings types ─────────────────────────────────────────────────

export interface UserAccount {
  id: string
  username: string
  role: UserRole
}

export interface JogSettings {
  slowSpeed: number
  mediumSpeed: number
  fastSpeed: number
  xyStep: number
  zStep: number
}

export interface KeyboardShortcuts {
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
  }

  function addMachine() {
    const id = `machine-${Date.now()}`
    machines.value.push({
      id,
      name: 'New Machine',
      type: 'router',
      connection: { type: 'tcp', serialPort: '', baudRate: 115200, tcpHost: '', tcpPort: 23 },
      probe: { plateThickness: 0, toolSetterHeight: 0, tipDiameter: 3.0, xyFeed: 200, zFeed: 100 },
      macros: [],
      magazine: { enabled: false, size: 0 },
      fluidncConfig: null,
      toolChangeMacro: '',
    })
    activeMachineId.value = id
  }

  function removeMachine(id: string) {
    const idx = machines.value.findIndex((m) => m.id === id)
    if (idx === -1) return
    machines.value.splice(idx, 1)
    if (activeMachineId.value === id) {
      activeMachineId.value = machines.value[0]?.id ?? ''
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
      slowSpeed: 100,
      mediumSpeed: 500,
      fastSpeed: 2000,
      xyStep: 1.0,
      zStep: 0.5,
    } as JogSettings,
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
    } as KeyboardShortcuts,
    auth: {
      enabled: false,
      users: [] as UserAccount[],
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

  function applyServerState(data: PersistedConfig) {
    machines.value = (data.machines ?? []).map((m) => ({
      toolChangeMacro: '',
      ...m,
      macros: _migrateMacros(m.macros ?? []),
    }))
    // Keep current selection if still valid; otherwise fall back to first machine
    if (!machines.value.find((m) => m.id === activeMachineId.value)) {
      activeMachineId.value = machines.value[0]?.id ?? ''
    }
    if (data.auth) {
      app.auth.enabled = data.auth.enabled ?? false
    }
    if (data.app) {
      if (data.app.units) app.units = data.app.units
      if (data.app.macros) app.macros = _migrateMacros(data.app.macros as unknown[])
      if (data.app.viewport) Object.assign(app.viewport, data.app.viewport)
      if (data.app.jog) Object.assign(app.jog, data.app.jog)
      if (data.app.shortcuts) Object.assign(app.shortcuts, data.app.shortcuts)
    }
  }

  async function hydrate() {
    if (initialized.value) return
    try {
      const data = await $fetch<PersistedConfig>('/api/config')
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

  function addUser(username: string, role: UserRole) {
    app.auth.users.push({ id: `user-${Date.now()}`, username, role })
  }

  function removeUser(id: string) {
    const idx = app.auth.users.findIndex((u) => u.id === id)
    if (idx !== -1) app.auth.users.splice(idx, 1)
  }

  return {
    initialized,
    saving,
    machines,
    activeMachineId,
    activeMachine,
    hasMachines,
    selectMachine,
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
    addUser,
    removeUser,
    app,
  }
})
