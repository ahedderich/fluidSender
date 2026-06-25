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
  const firmwareVersion = ref('')
  const status = ref<MachineStatus>('DISCONNECTED')

  const machinePos = ref<Position>({ x: 0, y: 0, z: 0 })
  const workPos = ref<Position>({ x: 0, y: 0, z: 0 })

  const feedOverride = ref(100)
  const spindleOverride = ref(100)

  const spindleOn = ref(false)
  const spindleRpm = ref(0)
  const spindleDir = ref<'cw' | 'ccw'>('cw')
  const coolant = ref<'off' | 'mist' | 'flood'>('off')

  const limitSwitches = ref<LimitSwitch[]>([])

  let _entryId = 0
  const consoleLog = ref<ConsoleEntry[]>([])

  const job = ref<Job | null>(null)

  const tools = ref<Tool[]>([])
  const toolLibrary = ref<ToolLibraryEntry[]>([])

  const magazineSlots = ref<(number | null)[]>([])

  function setToolLibrary(entries: ToolLibraryEntry[]) {
    toolLibrary.value = entries
  }

  function connect() {
    connected.value = true
    firmwareVersion.value = '3.7.14'
    status.value = 'IDLE'
    limitSwitches.value = [
      { name: 'X_MIN', triggered: false },
      { name: 'X_MAX', triggered: false },
      { name: 'Y_MIN', triggered: false },
      { name: 'Y_MAX', triggered: false },
      { name: 'Z_MIN', triggered: false },
      { name: 'Z_MAX', triggered: false },
      { name: 'PROBE', triggered: false },
    ]
    addConsole('recv', `Grbl 3.7.14 [FluidNC v${firmwareVersion.value}] ready`)
    addConsole('recv', `[MSG: Machine: Connected]`)
  }

  function disconnect() {
    connected.value = false
    firmwareVersion.value = ''
    status.value = 'DISCONNECTED'
    limitSwitches.value = []
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
