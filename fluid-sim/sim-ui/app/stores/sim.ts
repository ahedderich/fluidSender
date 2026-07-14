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

/** Simplified tool library entry — same Fusion 360 import schema as FluidSender's
 *  UI, trimmed to only what the tool-setter physics need. */
export interface SimTool {
  id: string
  number: number
  name: string
  diameter: number
  shoulderLength: number
}

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

  // Per-axis max rate (mm/min or °/min), reported in the sim's config.yaml/$Config output
  const maxRate = reactive<Record<AxisKey, number>>({ x: 5000, y: 5000, z: 1000, a: 1000, b: 1000, c: 1000 })

  // Firmware version reported in the greeting/$I/$SS banners — settable to exercise
  // FluidSender's update-check flow against an arbitrary version.
  const firmwareVersion = ref('4.0.3')

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

  // Tool library — the operator-swap stand-in. M6 never reaches the sim for
  // FluidSender's manual/toolsetter strategies (it's intercepted client-side there),
  // so "installing" a tool here is how a tester simulates the physical swap.
  const tools = ref<SimTool[]>([])
  const loadedToolNumber = ref<number | null>(null)

  // Tool-setter trigger geometry. X/Y should match FluidSender's toolchange settings
  // (the probe motion has to physically arrive there) — but triggerZ is sim-only
  // ground truth. Don't copy it into FluidSender's TOL baseline; the point is to
  // exercise FluidSender's own "measure + apply baseline" calibration flow against it.
  const toolsetter = reactive({
    enabled: false,
    x: 0,
    y: 0,
    radius: 4,
    triggerZ: -60,
  })

  // Read-only: the TLO the sim last received via G43.1 (Z axis). Display-only feedback
  // that FluidSender's probe sequence actually reached the firmware and took effect.
  const toolLengthOffset = ref(0)

  // Read-only: the tool number the sim firmware last received via T/M6. Display-only
  // feedback that FluidSender's atc-passthrough strategy actually sent the right T
  // value and the firmware applied it (unlike loadedToolNumber above, which is set
  // from the sim-ui as an operator stand-in for the manual/toolsetter strategies).
  const toolNumber = ref(0)

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

  async function setMaxRate(axes: Partial<Record<AxisKey, number>>) {
    for (const [k, v] of Object.entries(axes)) {
      maxRate[k as AxisKey] = v as number
    }
    await $fetch('/api/sim/machine/config', {
      method: 'POST',
      body: { maxRate: axes },
    }).catch(() => {})
  }

  async function setFirmwareVersion(version: string) {
    firmwareVersion.value = version
    await $fetch('/api/sim/machine/version', {
      method: 'POST',
      body: { version },
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

  // --- Tool library + tool-setter ---

  async function persistTools() {
    await $fetch('/api/tools', {
      method: 'POST',
      body: { loadedNumber: loadedToolNumber.value, tools: tools.value },
    }).catch(() => {})
  }

  function addTool() {
    tools.value.push({
      id: crypto.randomUUID(),
      number: (Math.max(0, ...tools.value.map((t) => t.number)) + 1),
      name: 'New Tool',
      diameter: 6,
      shoulderLength: 25,
    })
    persistTools()
  }

  function removeTool(id: string) {
    const removed = tools.value.find((t) => t.id === id)
    tools.value = tools.value.filter((t) => t.id !== id)
    if (removed && loadedToolNumber.value === removed.number) setLoadedTool(null)
    else persistTools()
  }

  async function pushLoadedToolToSim() {
    const tool = tools.value.find((t) => t.number === loadedToolNumber.value)
    await $fetch('/api/sim/tool/current', {
      method: 'POST',
      body: { length: tool?.shoulderLength ?? 0 },
    }).catch(() => {})
  }

  async function setLoadedTool(number: number | null) {
    loadedToolNumber.value = number
    await Promise.all([pushLoadedToolToSim(), persistTools()])
  }

  async function importTools(parsed: SimTool[]) {
    tools.value = parsed
    await persistTools()
  }

  async function pushToolsetterToSim() {
    await $fetch('/api/sim/machine/toolsetter', {
      method: 'POST',
      body: { ...toolsetter },
    }).catch(() => {})
  }

  async function persistToolsetter() {
    await $fetch('/api/toolsetter', {
      method: 'POST',
      body: { ...toolsetter },
    }).catch(() => {})
  }

  // Debounced push+persist of tool-setter edits, mirroring the probe-config watcher
  // below — without it, local edits never reach the sim or survive a page reload.
  let toolsetterPushTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => ({ ...toolsetter }),
    () => {
      if (toolsetterPushTimer) clearTimeout(toolsetterPushTimer)
      toolsetterPushTimer = setTimeout(() => {
        toolsetterPushTimer = null
        pushToolsetterToSim()
        persistToolsetter()
      }, 300)
    },
  )

  // Loads tool library + tool-setter config from the sim-ui's own persisted storage.
  // Must resolve (and be awaited) BEFORE the WS connects: connect-time re-pushes
  // (pushToolsetterToSim/pushLoadedToolToSim) would otherwise send whatever this
  // store's in-memory defaults happen to be, silently overwriting a previously
  // configured tool-setter in the Rust sim on every page reload.
  async function loadPersistedConfig() {
    const [toolsData, toolsetterData] = await Promise.all([
      $fetch<{ loadedNumber: number | null; tools: SimTool[] }>('/api/tools').catch(() => null),
      $fetch<{ enabled: boolean; x: number; y: number; radius: number; triggerZ: number }>('/api/toolsetter').catch(() => null),
    ])
    if (toolsData) {
      tools.value = toolsData.tools
      loadedToolNumber.value = toolsData.loadedNumber
    }
    if (toolsetterData) Object.assign(toolsetter, toolsetterData)
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
    pos, wco, wpos, travel, maxRate, firmwareVersion,
    stock, probe, limits, fluidConfig,
    consoleLog, pushConsoleLine, clearConsole,
    triggerProbe, triggerLimit, softReset, triggerAlarm,
    setSimSpeed, setPosition, setWco, setTravel, setMaxRate, setFirmwareVersion, pushProbeConfig, pushStockToSim,
    applyScenario, scenarios, defaultScenarioId, applyDefaultScenario,
    tools, loadedToolNumber, toolsetter, toolLengthOffset, toolNumber,
    persistTools, addTool, removeTool, setLoadedTool, importTools,
    pushToolsetterToSim, pushLoadedToolToSim, persistToolsetter, loadPersistedConfig,
  }
})
