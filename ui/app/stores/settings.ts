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

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = defineStore('settings', () => {
  const machines = ref<MachineProfile[]>([
    {
      id: 'machine-1',
      name: 'My CNC Router',
      type: 'router',
      connection: { type: 'usb', serialPort: '/dev/ttyUSB0', baudRate: 115200, tcpHost: '192.168.1.100', tcpPort: 23 },
      probe: { plateThickness: 15.0, toolSetterHeight: 50.0, tipDiameter: 3.0, xyFeed: 200, zFeed: 100 },
      macros: [
        { id: 'mm1', label: 'Park Z', command: 'G0 Z0' },
        { id: 'mm2', label: 'Goto XY0', command: 'G0 G54 X0 Y0' },
      ],
      magazine: { enabled: true, size: 8 },
      fluidncConfig: {
        name: 'My CNC Router',
        board: 'ESP32 Dev',
        reportInches: false,
        arcToleranceMm: 0.002,
        junctionDeviationMm: 0.01,
        plannerBlocks: 16,
        stepping: {
          engine: 'RMT',
          idleMs: 255,
          pulseUs: 4,
          dirDelayUs: 0,
          disableDelayUs: 0,
        },
        axes: {
          x: {
            stepsPerMm: 80,
            maxRateMmPerMin: 5000,
            accelerationMmPerSec2: 200,
            maxTravelMm: 400,
            softLimits: false,
            idleDisable: false,
            homing: { cycle: 2, allowSingleAxis: true, positiveDirection: false, mpos: 0, feedRate: 200, seekRate: 1000, settleMs: 250, seekScaler: 1.1, feedScaler: 1.1 },
            motor0: { limitNegPin: 'gpio.34', limitPosPin: 'NO_PIN', hardLimits: false, pulloffMm: 1.0 },
          },
          y: {
            stepsPerMm: 80,
            maxRateMmPerMin: 5000,
            accelerationMmPerSec2: 200,
            maxTravelMm: 300,
            softLimits: false,
            idleDisable: false,
            homing: { cycle: 2, allowSingleAxis: true, positiveDirection: false, mpos: 0, feedRate: 200, seekRate: 1000, settleMs: 250, seekScaler: 1.1, feedScaler: 1.1 },
            motor0: { limitNegPin: 'gpio.35', limitPosPin: 'NO_PIN', hardLimits: false, pulloffMm: 1.0 },
          },
          z: {
            stepsPerMm: 80,
            maxRateMmPerMin: 3000,
            accelerationMmPerSec2: 100,
            maxTravelMm: 100,
            softLimits: false,
            idleDisable: false,
            homing: { cycle: 1, allowSingleAxis: true, positiveDirection: true, mpos: 0, feedRate: 100, seekRate: 500, settleMs: 250, seekScaler: 1.1, feedScaler: 1.1 },
            motor0: { limitNegPin: 'NO_PIN', limitPosPin: 'gpio.36', hardLimits: false, pulloffMm: 1.0 },
          },
        },
        spindle: {
          type: 'PWMSpindle',
          outputPin: 'gpio.22',
          enablePin: 'gpio.21:low',
          directionPin: 'NO_PIN',
          pwmFreq: 5000,
          spinupMs: 0,
          spindownMs: 0,
          minRpm: 0,
          maxRpm: 24000,
          disableWithZeroSpeed: true,
        },
        probe: { pin: 'gpio.35:low', toolsetterPin: 'NO_PIN', checkModeStart: true, hardStop: false },
        coolant: { floodPin: 'gpio.26', mistPin: 'NO_PIN', delayMs: 0 },
        control: { safetyDoorPin: 'NO_PIN', resetPin: 'NO_PIN', feedHoldPin: 'NO_PIN', cycleStartPin: 'NO_PIN' },
        start: { mustHome: false, checkLimits: true },
        macros: { startupLine0: '', startupLine1: '', afterHoming: '', afterReset: '', afterUnlock: '' },
      },
    },
    {
      id: 'machine-2',
      name: 'Laser Engraver',
      type: 'laser',
      connection: { type: 'tcp', serialPort: '', baudRate: 115200, tcpHost: '192.168.1.101', tcpPort: 23 },
      probe: { plateThickness: 0, toolSetterHeight: 0, tipDiameter: 0, xyFeed: 100, zFeed: 50 },
      macros: [],
      magazine: { enabled: false, size: 0 },
      fluidncConfig: null,
    },
  ])

  const activeMachineId = ref('machine-1')

  const activeMachine = computed(() => machines.value.find((m) => m.id === activeMachineId.value) ?? null)

  function selectMachine(id: string) {
    activeMachineId.value = id
  }

  function addMachine() {
    const id = `machine-${Date.now()}`
    machines.value.push({
      id,
      name: 'New Machine',
      type: 'router',
      connection: { type: 'usb', serialPort: '', baudRate: 115200, tcpHost: '', tcpPort: 23 },
      probe: { plateThickness: 0, toolSetterHeight: 0, tipDiameter: 3.0, xyFeed: 200, zFeed: 100 },
      macros: [],
      magazine: { enabled: false, size: 0 },
      fluidncConfig: null,
    })
    activeMachineId.value = id
  }

  function removeMachine(id: string) {
    if (machines.value.length <= 1) return
    const idx = machines.value.findIndex((m) => m.id === id)
    if (idx === -1) return
    machines.value.splice(idx, 1)
    if (activeMachineId.value === id) activeMachineId.value = machines.value[0].id
  }

  // FluidSender app-level settings — authoritative on Bun server, pushed to all clients
  const app = reactive({
    units: 'mm' as UnitSystem,
    macros: [
      { id: 'app-m1', label: 'Spindle On', command: 'M3 S8000' },
      { id: 'app-m2', label: 'Spindle Off', command: 'M5' },
      { id: 'app-m3', label: 'Coolant On', command: 'M8' },
      { id: 'app-m4', label: 'Coolant Off', command: 'M9' },
    ] as MacroButton[],
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
      users: [{ id: 'user-1', username: 'admin', role: 'admin' as UserRole }] as UserAccount[],
    },
  })

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
    machines,
    activeMachineId,
    activeMachine,
    selectMachine,
    addMachine,
    removeMachine,
    addAppMacro,
    removeAppMacro,
    addMachineMacro,
    removeMachineMacro,
    addUser,
    removeUser,
    app,
  }
})
