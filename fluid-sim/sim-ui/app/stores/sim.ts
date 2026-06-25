import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'

export type MachineState = 'Idle' | 'Run' | 'Hold' | 'Alarm' | 'Homing' | 'Door'
export type StockShape = 'rect' | 'round'
export type LimitKey = 'xMin' | 'xMax' | 'yMin' | 'yMax' | 'zMin' | 'zMax'

export interface Scenario {
  id: string
  name: string
  description?: string
  machineState: MachineState
  pos: { x: number; y: number; z: number }
  wco: { x: number; y: number; z: number }
  stock: {
    shape: StockShape
    width: number
    height: number
    depth: number
    ox: number
    oy: number
    diameter: number
    rotation: number
  }
}

export const useSimStore = defineStore('sim', () => {
  const connected = ref(false)
  const machineState = ref<MachineState>('Idle')

  // Machine position in mm. Z is negative when the spindle descends from home.
  const pos = reactive({ x: 150.0, y: 100.0, z: 5.0 })

  // Work coordinate offset. WPos = MPos - WCO.
  const wco = reactive({ x: 0.0, y: 0.0, z: 0.0 })

  // Machine travel envelope in mm
  const travel = reactive({ x: 300, y: 200, z: 80 })

  // Stock definition
  const stock = reactive({
    shape: 'rect' as StockShape,
    width: 100,
    height: 80,
    depth: 20,
    ox: 100,
    oy: 60,
    diameter: 80,
    rotation: 0,
  })

  // Touch probe
  const probe = reactive({
    tipDiameter: 2.0,
    triggered: false,
  })

  // Limit switch momentary states
  const limits = reactive({
    xMin: false,
    xMax: false,
    yMin: false,
    yMax: false,
    zMin: false,
    zMax: false,
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

  // Derived work position
  const wpos = computed(() => ({
    x: pos.x - wco.x,
    y: pos.y - wco.y,
    z: pos.z - wco.z,
  }))

  function triggerProbe() {
    probe.triggered = true
    setTimeout(() => {
      probe.triggered = false
    }, 500)
  }

  function triggerLimit(key: LimitKey) {
    limits[key] = true
    setTimeout(() => {
      limits[key] = false
    }, 500)
  }

  function softReset() {
    machineState.value = 'Idle'
    limits.xMin = false
    limits.xMax = false
    limits.yMin = false
    limits.yMax = false
    limits.zMin = false
    limits.zMax = false
    probe.triggered = false
  }

  function applyScenario(s: Scenario) {
    machineState.value = s.machineState
    Object.assign(pos, s.pos)
    Object.assign(wco, s.wco)
    Object.assign(stock, s.stock)
  }

  return {
    connected,
    machineState,
    pos,
    wco,
    wpos,
    travel,
    stock,
    probe,
    limits,
    fluidConfig,
    triggerProbe,
    triggerLimit,
    softReset,
    applyScenario,
  }
})
