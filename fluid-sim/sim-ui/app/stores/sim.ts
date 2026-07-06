import { defineStore } from 'pinia'
import { ref, reactive, computed, watch } from 'vue'

export type MachineState = 'Idle' | 'Run' | 'Hold' | 'Alarm' | 'Homing' | 'Door'
export type StockShape = 'rect' | 'round'
export type LimitKey = 'xMin' | 'xMax' | 'yMin' | 'yMax' | 'zMin' | 'zMax' | 'door'

/** One line of FluidNC protocol traffic streamed from the sim (`/ws/console`). */
export interface ConsoleLine {
  /** "rx" = request received by the sim, "tx" = response sent by the sim. */
  dir: 'rx' | 'tx'
  source: string
  text: string
  ts: number
}

export const AXES = ['x', 'y', 'z', 'a', 'b', 'c'] as const
export type AxisKey = (typeof AXES)[number]

export interface Scenario {
  id: string
  name: string
  description?: string
  machineState: MachineState
  pos: Partial<Record<AxisKey, number>>
  wco: Partial<Record<AxisKey, number>>
  stock: {
    shape: StockShape
    width: number
    height: number
    depth: number
    ox: number
    oy: number
    oz: number
    diameter: number
    rotation: number
    hole?: { enabled: boolean; x: number; y: number; diameter: number; depth: number }
    point?: { enabled: boolean; x: number; y: number; label: string }
  }
}

export const useSimStore = defineStore('sim', () => {
  const connected = ref(false)
  const machineState = ref<MachineState>('Idle')
  const axisCount = ref(3)

  // Machine position in mm (linear) or ° (rotary A/B/C).
  // X and Y home at 0; work area is negative. Z home at 0; descends negative.
  const pos = reactive<Record<AxisKey, number>>({ x: -150.0, y: -100.0, z: 5.0, a: 0.0, b: 0.0, c: 0.0 })

  // Work coordinate offset. WPos = MPos - WCO.
  const wco = reactive<Record<AxisKey, number>>({ x: 0.0, y: 0.0, z: 0.0, a: 0.0, b: 0.0, c: 0.0 })

  // Machine travel envelope (mm for linear, ° for rotary)
  const travel = reactive<Record<AxisKey, number>>({ x: 300, y: 200, z: 80, a: 360, b: 360, c: 360 })

  // Stock definition in signed machine coords, matching the sim's collision math:
  // ox/oy is the stock CENTRE, oz its top surface. The work area is in the negative
  // XY quadrant and Z descends negative from home, so all three are normally negative.
  // Hole x/y are offsets from the stock centre.
  const stock = reactive({
    shape: 'rect' as StockShape,
    width: 100,
    height: 80,
    depth: 20,
    ox: -150,
    oy: -100,
    oz: -20,
    diameter: 80,
    rotation: 0,
    hole: {
      enabled: false,
      x: 0,
      y: 0,
      diameter: 20,
      depth: 20,
    },
    point: {
      enabled: false,
      x: 0,
      y: 0,
      label: 'Datum',
    },
  })

  // Simulation speed multiplier (1–10×)
  const simSpeed = ref(1)

  // Touch probe. Deviation sign convention: positive = trigger fires before centre
  // reaches the surface (normal; ≈ ball radius); negative = trigger fires after centre
  // has passed the surface.
  const probe = reactive({
    triggered: false,
    deviations: { xPlus: 0, xMinus: 0, yPlus: 0, yMinus: 0, zMinus: 0 },
  })

  // Limit switches + door sensor
  const limits = reactive<Record<LimitKey, boolean>>({
    xMin: false, xMax: false,
    yMin: false, yMax: false,
    zMin: false, zMax: false,
    door: false,
  })

  // FluidNC config key-value pairs
  const fluidConfig = reactive<Record<string, string>>({
    'board': 'BlackBox X32',
    'name': 'CNC Router',
    'stepping/engine': 'RMT',
    'axes/x/steps_per_mm': '80.000',
    'axes/y/steps_per_mm': '80.000',
    'axes/z/steps_per_mm': '400.000',
    'axes/x/max_rate_mm_per_min': '5000',
    'axes/y/max_rate_mm_per_min': '5000',
    'axes/z/max_rate_mm_per_min': '1000',
    'axes/x/acceleration': '200',
    'axes/y/acceleration': '200',
    'axes/z/acceleration': '100',
    'axes/x/homing/cycle': '2',
    'axes/y/homing/cycle': '2',
    'axes/z/homing/cycle': '1',
  })

  // FluidNC protocol traffic streamed from the sim (display-only console)
  const CONSOLE_LIMIT = 500
  const consoleLog = ref<ConsoleLine[]>([])

  function pushConsoleLine(line: ConsoleLine) {
    consoleLog.value.push(line)
    if (consoleLog.value.length > CONSOLE_LIMIT) {
      consoleLog.value.splice(0, consoleLog.value.length - CONSOLE_LIMIT)
    }
  }

  function clearConsole() {
    consoleLog.value = []
  }

  // Derived work position for all axes
  const wpos = computed(() =>
    Object.fromEntries(AXES.map((a) => [a, pos[a] - wco[a]])) as Record<AxisKey, number>,
  )

  // --- API-backed actions ---

  async function triggerProbe() {
    await $fetch('/api/sim/control/trigger-probe', { method: 'POST', body: {} }).catch(() => {
      // fallback: local mock if sim not connected
      probe.triggered = true
      setTimeout(() => { probe.triggered = false }, 500)
    })
  }

  async function triggerLimit(key: LimitKey) {
    await $fetch('/api/sim/control/trigger-limit', {
      method: 'POST',
      body: { axis: key },
    }).catch(() => {
      limits[key] = true
      setTimeout(() => { limits[key] = false }, 500)
    })
  }

  async function softReset() {
    await $fetch('/api/sim/control/soft-reset', { method: 'POST' }).catch(() => {
      machineState.value = 'Idle'
      for (const k of Object.keys(limits) as LimitKey[]) limits[k] = false
      probe.triggered = false
    })
  }

  async function triggerAlarm() {
    await $fetch('/api/sim/control/trigger-alarm', { method: 'POST' }).catch(() => {
      machineState.value = 'Alarm'
    })
  }

  async function setSimSpeed(speed: number) {
    simSpeed.value = speed
    await $fetch('/api/sim/machine/speed', {
      method: 'POST',
      body: { speed },
    }).catch(() => {})
  }

  async function setPosition(axes: Partial<Record<AxisKey, number>>) {
    await $fetch('/api/sim/machine/position', {
      method: 'POST',
      body: axes,
    }).catch(() => {
      for (const [k, v] of Object.entries(axes)) {
        pos[k as AxisKey] = v as number
      }
    })
  }

  async function setWco(axes: Partial<Record<AxisKey, number>>) {
    await $fetch('/api/sim/machine/wco', {
      method: 'POST',
      body: axes,
    }).catch(() => {
      for (const [k, v] of Object.entries(axes)) {
        wco[k as AxisKey] = v as number
      }
    })
  }

  async function setTravel(axes: Partial<Record<AxisKey, number>>) {
    for (const [k, v] of Object.entries(axes)) {
      travel[k as AxisKey] = v as number
    }
    await $fetch('/api/sim/machine/config', {
      method: 'POST',
      body: { travel: axes },
    }).catch(() => {})
  }

  async function pushProbeConfig() {
    await $fetch('/api/sim/machine/config', {
      method: 'POST',
      body: {
        probeDeviations: { ...probe.deviations },
      },
    }).catch(() => {})
  }

  // Debounced push of probe edits to the sim — without it, local edits never reach
  // the sim and the next WS state message silently reverts them.
  let probePushTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => [{ ...probe.deviations }],
    () => {
      if (probePushTimer) clearTimeout(probePushTimer)
      probePushTimer = setTimeout(() => {
        probePushTimer = null
        pushProbeConfig()
      }, 300)
    },
  )

  async function pushStockToSim() {
    const shape = stock.shape === 'rect'
      ? { type: 'rect', width: stock.width, height: stock.height, rotation: stock.rotation }
      : { type: 'round', diameter: stock.diameter }

    await $fetch('/api/sim/stock', {
      method: 'POST',
      body: {
        shape,
        depth: stock.depth,
        ox: stock.ox,
        oy: stock.oy,
        oz: stock.oz,
        hole: stock.hole.enabled ? {
          x: stock.hole.x,
          y: stock.hole.y,
          diameter: stock.hole.diameter,
          depth: stock.hole.depth,
        } : null,
        point: stock.point.enabled ? {
          x: stock.point.x,
          y: stock.point.y,
          label: stock.point.label,
        } : null,
      },
    }).catch(() => {})
  }

  async function applyScenario(scenario: Scenario) {
    machineState.value = scenario.machineState
    for (const a of AXES) {
      pos[a] = scenario.pos[a] ?? 0
      wco[a] = scenario.wco[a] ?? 0
    }
    const { hole, point, ...stockBase } = scenario.stock
    Object.assign(stock, stockBase)
    if (hole) Object.assign(stock.hole, hole)
    if (point) Object.assign(stock.point, point)

    // Push position and stock to simulator
    await Promise.all([
      $fetch('/api/sim/machine/position', {
        method: 'POST',
        body: scenario.pos,
      }).catch(() => {}),
      $fetch('/api/sim/machine/wco', {
        method: 'POST',
        body: scenario.wco,
      }).catch(() => {}),
      pushStockToSim(),
    ])
  }

  // Scenario list and default — owned here so useSimConnection can apply on WS connect
  const scenarios = ref<Scenario[]>([])
  const defaultScenarioId = ref<string | null>(null)

  async function applyDefaultScenario() {
    if (!defaultScenarioId.value) return
    const def = scenarios.value.find(s => s.id === defaultScenarioId.value)
    if (def) await applyScenario(def)
  }

  return {
    connected, machineState, axisCount, simSpeed,
    pos, wco, wpos, travel,
    stock, probe, limits, fluidConfig,
    consoleLog, pushConsoleLine, clearConsole,
    triggerProbe, triggerLimit, softReset, triggerAlarm,
    setSimSpeed, setPosition, setWco, setTravel, pushProbeConfig, pushStockToSim,
    applyScenario, scenarios, defaultScenarioId, applyDefaultScenario,
  }
})
