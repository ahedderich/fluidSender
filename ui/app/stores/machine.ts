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

export interface Job {
  filename: string
  totalLines: number
  currentLine: number
  progress: number
  estimatedRuntime: number
  startTime: number | null
}

export const useMachineStore = defineStore('machine', () => {
  const connected = ref(false)
  const firmwareVersion = ref('3.7.14')
  const selectedProfile = ref('My CNC Router')
  const profiles = ref(['My CNC Router', 'Laser Engraver', 'Plasma Cutter'])
  const status = ref<MachineStatus>('DISCONNECTED')

  const machinePos = ref<Position>({ x: -150.25, y: -80.0, z: -12.5 })
  const workPos = ref<Position>({ x: 50.5, y: 25.0, z: -5.25 })

  const feedOverride = ref(100)
  const spindleOverride = ref(100)

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
  })

  const tools = ref<Tool[]>([
    { number: 1, description: '6mm End Mill — Roughing', lineStart: 1, lineEnd: 847 },
    { number: 2, description: '3mm Ball Nose — Finishing', lineStart: 848, lineEnd: 2047 },
    { number: 3, description: '1mm Engraving Bit — Detail', lineStart: 2048, lineEnd: 2847 },
  ])

  function connect() {
    connected.value = true
    status.value = 'IDLE'
    addConsole('recv', `Grbl 3.7.14 [FluidNC v${firmwareVersion.value}] ready`)
    addConsole('recv', `[MSG: Machine: ${selectedProfile.value}]`)
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
    } else {
      addConsole('recv', 'ok')
    }
  }

  return {
    connected,
    firmwareVersion,
    selectedProfile,
    profiles,
    status,
    machinePos,
    workPos,
    feedOverride,
    spindleOverride,
    limitSwitches,
    consoleLog,
    job,
    tools,
    connect,
    disconnect,
    addConsole,
    sendCommand,
  }
})
