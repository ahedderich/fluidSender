import { defineStore } from 'pinia'

export type MachineStatus = 'DISCONNECTED' | 'IDLE' | 'RUN' | 'HOLD' | 'ALARM' | 'HOME' | 'DOOR' | 'SLEEP' | 'CHECK'

export interface LimitSwitch {
  name: string
  triggered: boolean
}

export interface ConsoleEntry {
  id: number
  type: 'sent' | 'recv' | 'info' | 'error'
  text: string
  ts: number
}

export interface Position {
  x: number
  y: number
  z: number
  a?: number
}

export interface Tool {
  number: number
  description: string
  lineStart: number
  lineEnd: number
}

export interface ToolLibraryEntry {
  id: string
  number?: number
  name: string
  type: string
  diameter: number
  fluteCount?: number
  fluteLength?: number
  overallLength?: number
  material?: string
  usageMinutes: number
  lastUsed?: number
  /** M = machine-specific tool, A = app-level shared tool */
  source: 'M' | 'A'
}

export interface AxisRange {
  min: number
  max: number
}

export interface Job {
  filename: string
  totalLines: number
  currentLine: number
  progress: number
  estimatedRuntime: number
  startTime: number | null
  axisRanges?: { x: AxisRange; y: AxisRange; z: AxisRange }
}

export const useMachineStore = defineStore('machine', () => {
  const connected = ref(false)
  const firmwareVersion = ref('3.7.14')
  const status = ref<MachineStatus>('DISCONNECTED')

  const machinePos = ref<Position>({ x: -150.25, y: -80.0, z: -12.5 })
  const workPos = ref<Position>({ x: 50.5, y: 25.0, z: -5.25 })

  const feedOverride = ref(100)
  const spindleOverride = ref(100)

  const spindleOn = ref(false)
  const spindleRpm = ref(8000)
  const spindleDir = ref<'cw' | 'ccw'>('cw')
  const coolant = ref<'off' | 'mist' | 'flood'>('off')

  const limitSwitches = ref<LimitSwitch[]>([
    { name: 'X_MIN', triggered: false },
    { name: 'X_MAX', triggered: false },
    { name: 'Y_MIN', triggered: false },
    { name: 'Y_MAX', triggered: false },
    { name: 'Z_MIN', triggered: true },
    { name: 'Z_MAX', triggered: false },
    { name: 'PROBE', triggered: false },
  ])

  let _entryId = 0
  const consoleLog = ref<ConsoleEntry[]>([
    { id: _entryId++, type: 'info', text: 'FluidSender v0.0.1 ready', ts: Date.now() - 8000 },
  ])

  const job = ref<Job | null>({
    filename: 'bracket_v3.nc',
    totalLines: 2847,
    currentLine: 0,
    progress: 0,
    estimatedRuntime: 3240,
    startTime: null,
    axisRanges: {
      x: { min: 0.0, max: 200.0 },
      y: { min: 0.0, max: 150.0 },
      z: { min: -25.0, max: 0.0 },
    },
  })

  const tools = ref<Tool[]>([
    { number: 1, description: '6mm End Mill — Roughing', lineStart: 1, lineEnd: 847 },
    { number: 2, description: '3mm Ball Nose — Finishing', lineStart: 848, lineEnd: 2047 },
    { number: 3, description: '1mm Engraving Bit — Detail', lineStart: 2048, lineEnd: 2847 },
  ])

  const _now = Date.now()
  const toolLibrary = ref<ToolLibraryEntry[]>([
    { id: 'lib-1', number: 1, name: '6mm Flat End Mill', type: 'flat end mill', diameter: 6, fluteCount: 4, fluteLength: 19, overallLength: 63, material: 'carbide', usageMinutes: 272, lastUsed: _now - 2 * 86_400_000, source: 'M' },
    { id: 'lib-2', number: 2, name: '3mm Ball Nose', type: 'ball end mill', diameter: 3, fluteCount: 2, fluteLength: 10, overallLength: 50, material: 'carbide', usageMinutes: 138, lastUsed: _now - 2 * 86_400_000, source: 'M' },
    { id: 'lib-3', number: 3, name: '1mm Engraving Bit', type: 'v-cutter', diameter: 1, fluteCount: 1, fluteLength: 4, overallLength: 38, material: 'carbide', usageMinutes: 45, lastUsed: _now - 5 * 86_400_000, source: 'M' },
    { id: 'lib-4', number: 4, name: '10mm Flat End Mill', type: 'flat end mill', diameter: 10, fluteCount: 4, fluteLength: 30, overallLength: 80, material: 'carbide', usageMinutes: 735, lastUsed: _now - 10 * 86_400_000, source: 'A' },
    { id: 'lib-5', number: 5, name: '6mm Ball Nose', type: 'ball end mill', diameter: 6, fluteCount: 2, fluteLength: 20, overallLength: 65, material: 'carbide', usageMinutes: 192, lastUsed: _now - 7 * 86_400_000, source: 'A' },
    { id: 'lib-6', number: 6, name: '8mm Roughing End Mill', type: 'flat end mill', diameter: 8, fluteCount: 3, fluteLength: 25, overallLength: 75, material: 'carbide', usageMinutes: 525, lastUsed: _now - 14 * 86_400_000, source: 'A' },
    { id: 'lib-7', number: 7, name: '2mm Drill', type: 'drill', diameter: 2, fluteCount: 2, fluteLength: 15, overallLength: 45, material: 'hss', usageMinutes: 80, lastUsed: _now - 30 * 86_400_000, source: 'A' },
    { id: 'lib-8', number: 8, name: '45° V-Cutter', type: 'v-cutter', diameter: 6, fluteCount: 2, fluteLength: 8, overallLength: 55, material: 'carbide', usageMinutes: 30, lastUsed: _now - 60 * 86_400_000, source: 'A' },
    { id: 'lib-9', number: 9, name: '12mm Face Mill', type: 'face mill', diameter: 12, fluteCount: 3, fluteLength: 15, overallLength: 70, material: 'carbide', usageMinutes: 410, lastUsed: _now - 20 * 86_400_000, source: 'A' },
    { id: 'lib-10', number: 10, name: 'M3 Tap', type: 'tap', diameter: 3, fluteCount: 3, overallLength: 45, material: 'hss', usageMinutes: 15, lastUsed: _now - 90 * 86_400_000, source: 'A' },
  ])

  // magazine slot assignments: index = slot (0-based), value = tool number or null
  const magazineSlots = ref<(number | null)[]>([1, 2, 3, null, null, null, null, null])

  function setToolLibrary(entries: ToolLibraryEntry[]) {
    toolLibrary.value = entries
  }

  function connect() {
    connected.value = true
    status.value = 'IDLE'
    addConsole('recv', `Grbl 3.7.14 [FluidNC v${firmwareVersion.value}] ready`)
    addConsole('recv', `[MSG: Machine: Connected]`)
  }

  function disconnect() {
    connected.value = false
    status.value = 'DISCONNECTED'
    addConsole('info', 'Disconnected')
  }

  function addConsole(type: ConsoleEntry['type'], text: string) {
    consoleLog.value.push({ id: _entryId++, type, text, ts: Date.now() })
    if (consoleLog.value.length > 500) consoleLog.value.splice(0, 100)
  }

  function sendCommand(cmd: string) {
    addConsole('sent', cmd)
    if (cmd === '?') {
      const m = machinePos.value
      const w = workPos.value
      addConsole(
        'recv',
        `<${status.value}|MPos:${m.x.toFixed(3)},${m.y.toFixed(3)},${m.z.toFixed(3)}|WPos:${w.x.toFixed(3)},${w.y.toFixed(3)},${w.z.toFixed(3)}>`,
      )
    } else if (cmd === '$H') {
      status.value = 'HOME'
      addConsole('recv', 'ok')
      setTimeout(() => {
        status.value = 'IDLE'
        machinePos.value = { x: 0, y: 0, z: 0 }
      }, 2000)
    } else if (cmd.startsWith('$RS')) {
      addConsole('info', 'Restarting firmware...')
      setTimeout(() => {
        addConsole('recv', `Grbl 3.7.14 [FluidNC v${firmwareVersion.value}] ready`)
        status.value = 'IDLE'
      }, 1500)
    } else if (cmd === '$X') {
      status.value = 'IDLE'
      addConsole('recv', '[MSG:Caution: Unlocked]')
      addConsole('recv', 'ok')
    } else if (cmd === 'M5') {
      spindleOn.value = false
      addConsole('recv', 'ok')
    } else if (cmd.startsWith('M3') || cmd.startsWith('M4')) {
      spindleOn.value = true
      spindleDir.value = cmd.startsWith('M3') ? 'cw' : 'ccw'
      const m = cmd.match(/S(\d+)/)
      if (m) spindleRpm.value = parseInt(m[1])
      addConsole('recv', 'ok')
    } else if (cmd === 'M9') {
      coolant.value = 'off'
      addConsole('recv', 'ok')
    } else if (cmd === 'M7') {
      coolant.value = 'mist'
      addConsole('recv', 'ok')
    } else if (cmd === 'M8') {
      coolant.value = 'flood'
      addConsole('recv', 'ok')
    } else {
      addConsole('recv', 'ok')
    }
  }

  return {
    connected,
    firmwareVersion,
    status,
    machinePos,
    workPos,
    feedOverride,
    spindleOverride,
    spindleOn,
    spindleRpm,
    spindleDir,
    coolant,
    limitSwitches,
    consoleLog,
    job,
    tools,
    toolLibrary,
    magazineSlots,
    connect,
    disconnect,
    addConsole,
    sendCommand,
    setToolLibrary,
  }
})
