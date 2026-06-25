import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'

export type MachineState = 'Idle' | 'Run' | 'Hold' | 'Alarm' | 'Homing' | 'Door'
export type StockShape = 'rect' | 'round'
export type LimitKey = 'xMin' | 'xMax' | 'yMin' | 'yMax' | 'zMin' | 'zMax' | 'door'

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
  // Z is negative when the spindle descends from home.
  const pos = reactive<Record<AxisKey, number>>({ x: 150.0, y: 100.0, z: 5.0, a: 0.0, b: 0.0, c: 0.0 })

  // Work coordinate offset. WPos = MPos - WCO.
  const wco = reactive<Record<AxisKey, number>>({ x: 0.0, y: 0.0, z: 0.0, a: 0.0, b: 0.0, c: 0.0 })

  // Machine travel envelope (mm for linear, ° for rotary)
  const travel = reactive<Record<AxisKey, number>>({ x: 300, y: 200, z: 80, a: 360, b: 360, c: 360 })

  // Stock definition
  const stock = reactive({
    shape: 'rect' as StockShape,
    width: 100,
    height: 80,
    depth: 20,
    ox: 100,
    oy: 60,
    oz: 5,
    diameter: 80,
    rotation: 0,
    hole: {
      enabled: false,
      x: 50,       // center X relative to stock origin (ox)
      y: 40,       // center Y relative to stock origin (oy)
      diameter: 20,
      depth: 20,
    },
    point: {
      enabled: false,
      x: 0,        // relative to stock origin (ox)
      y: 0,        // relative to stock origin (oy)
      label: 'Datum',
    },
  })

  // Simulation speed multiplier (1–10×) sent to the Rust sim backend.
  const simSpeed = ref(1)

  // Touch probe
  const probe = reactive({ tipDiameter: 2.0, triggered: false })

  // Limit switches + door sensor — all momentary
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

  // Derived work position for all axes
  const wpos = computed(() =>
    Object.fromEntries(AXES.map((a) => [a, pos[a] - wco[a]])) as Record<AxisKey, number>,
  )

  function triggerProbe() {
    probe.triggered = true
    setTimeout(() => { probe.triggered = false }, 500)
  }

  function triggerLimit(key: LimitKey) {
    limits[key] = true
    setTimeout(() => { limits[key] = false }, 500)
  }

  function softReset() {
    machineState.value = 'Idle'
    for (const k of Object.keys(limits) as LimitKey[]) limits[k] = false
    probe.triggered = false
  }

  function applyScenario(scenario: Scenario) {
    machineState.value = scenario.machineState
    for (const a of AXES) {
      pos[a] = scenario.pos[a] ?? 0
      wco[a] = scenario.wco[a] ?? 0
    }
    const { hole, point, ...stockBase } = scenario.stock
    Object.assign(stock, stockBase)
    if (hole) Object.assign(stock.hole, hole)
    if (point) Object.assign(stock.point, point)
  }

  return {
    connected, machineState, axisCount, simSpeed,
    pos, wco, wpos, travel,
    stock, probe, limits, fluidConfig,
    triggerProbe, triggerLimit, softReset, applyScenario,
  }
})
