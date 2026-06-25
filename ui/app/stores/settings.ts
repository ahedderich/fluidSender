import { defineStore } from 'pinia'

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
  macros: MacroButton[]
  magazine: MagazineConfig
  /** null until first firmware connect — loaded fresh on each connect */
  fluidncConfig: FluidNCConfig | null
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
    macros?: MacroButton[]
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
    macros: [] as MacroButton[],
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

  async function hydrate() {
    if (initialized.value) return
    try {
      const data = await $fetch<PersistedConfig>('/api/config')
      machines.value = data.machines ?? []
      activeMachineId.value = machines.value[0]?.id ?? ''
      if (data.auth) {
        app.auth.enabled = data.auth.enabled ?? false
      }
      if (data.app) {
        if (data.app.units) app.units = data.app.units
        if (data.app.macros) app.macros = data.app.macros
        if (data.app.viewport) Object.assign(app.viewport, data.app.viewport)
        if (data.app.jog) Object.assign(app.jog, data.app.jog)
        if (data.app.shortcuts) Object.assign(app.shortcuts, data.app.shortcuts)
      }
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

  function addAppMacro(label: string, command: string) {
    app.macros.push({ id: `macro-${Date.now()}`, label, command })
  }
  function removeAppMacro(id: string) {
    const idx = app.macros.findIndex((m) => m.id === id)
    if (idx !== -1) app.macros.splice(idx, 1)
  }
  function addMachineMacro(machineId: string, label: string, command: string) {
    const m = machines.value.find((mc) => mc.id === machineId)
    if (!m) return
    m.macros.push({ id: `macro-${Date.now()}`, label, command })
  }
  function removeMachineMacro(machineId: string, macroId: string) {
    const m = machines.value.find((mc) => mc.id === machineId)
    if (!m) return
    const idx = m.macros.findIndex((mc) => mc.id === macroId)
    if (idx !== -1) m.macros.splice(idx, 1)
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
    save,
    addAppMacro,
    removeAppMacro,
    addMachineMacro,
    removeMachineMacro,
    addUser,
    removeUser,
    app,
  }
})
