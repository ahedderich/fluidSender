import { defineStore } from 'pinia'
import { useSettingsStore } from '~/stores/settings'
import { useSyncStore } from '~/stores/sync'
import { wsSend, wsConnected } from '~/composables/useWsSend'

// Re-export the canonical MachineStatus type from the server utils so
// the client and server share the same shape
export type { MachineStatus } from '~~/server/utils/machine/types'
import type { MachineStatus } from '~~/server/utils/machine/types'

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

export interface StockDef {
  shape: 'rect' | 'round'
  // rect
  width?: number
  height?: number
  rotation?: number  // degrees
  // round
  diameter?: number
  // common
  depth: number
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

export interface ServerConnectionState {
  machineId: string | null
  connected: boolean
  status: string
  firmwareVersion: string
}

export const useMachineStore = defineStore('machine', () => {
  const connected = ref(false)
  const connecting = ref(false)
  const connectionError = ref('')
  const connectedMachineId = ref<string | null>(null)
  const firmwareVersion = ref('')
  const machineState = ref<MachineStatus['state']>('Disconnected')

  const machinePos = ref<Position>({ x: 0, y: 0, z: 0 })
  const workPos = ref<Position>({ x: 0, y: 0, z: 0 })

  const feedOverride = ref(100)
  const spindleOverride = ref(100)
  const feed = ref(0)

  const spindleOn = ref(false)
  const spindleRpm = ref(0)
  const spindleDir = ref<'cw' | 'ccw'>('cw')
  const coolant = ref<'off' | 'mist' | 'flood'>('off')

  const limitSwitches = ref<LimitSwitch[]>([])
  const buffer = ref({ planner: 0, rx: 0 })

  // Console is server-owned; this is a read alias so existing components work unchanged
  const sync = useSyncStore()
  const consoleLog = computed(() => sync.consoleLog)

  const tools = ref<Tool[]>([])
  const toolLibrary = ref<ToolLibraryEntry[]>([])
  const magazineSlots = ref<(number | null)[]>([])
  const stock = ref<StockDef | null>(null)

  function setToolLibrary(entries: ToolLibraryEntry[]) {
    toolLibrary.value = entries
  }

  function setStock(s: StockDef) { stock.value = s }
  function clearStock() { stock.value = null }

  let _connectTimeout: ReturnType<typeof setTimeout> | null = null

  function applyServerStatus(state: ServerConnectionState) {
    if (_connectTimeout) { clearTimeout(_connectTimeout); _connectTimeout = null }
    connecting.value = false
    connectionError.value = ''
    connected.value = state.connected
    connectedMachineId.value = state.machineId
    firmwareVersion.value = state.firmwareVersion ?? ''

    if (!state.connected) {
      limitSwitches.value = []
      machinePos.value = { x: 0, y: 0, z: 0 }
      workPos.value = { x: 0, y: 0, z: 0 }
      machineState.value = 'Disconnected'
    }
  }

  function applyMachineStatus(s: MachineStatus) {
    machineState.value = s.state
    machinePos.value = s.mpos
    workPos.value = s.wpos
    feed.value = s.feed
    spindleRpm.value = s.spindleSpeed
    spindleOn.value = s.spindleOn
    coolant.value = s.coolantFlood ? 'flood' : s.coolantMist ? 'mist' : 'off'
    limitSwitches.value = s.limitSwitches
    feedOverride.value = s.overrides.feed
    spindleOverride.value = s.overrides.spindle
    buffer.value = s.buffer
  }

  function connect() {
    const s = useSettingsStore()
    if (!s.activeMachineId) return
    if (!wsConnected.value) {
      connectionError.value = 'Server WebSocket offline — refresh or wait for reconnection.'
      return
    }
    connecting.value = true
    connectionError.value = ''
    wsSend({ t: 'machine:connect', payload: { machineId: s.activeMachineId } })
    _connectTimeout = setTimeout(() => {
      connecting.value = false
      connectionError.value = 'Connection timed out. Check the machine config and try again.'
    }, 8000)
  }

  function disconnect() {
    connectionError.value = ''
    wsSend({ t: 'machine:disconnect', payload: {} })
  }

  function addConsole(type: ConsoleEntry['type'], text: string) {
    wsSend({ t: 'ui:console:push', payload: { type, text, ts: Date.now() } })
  }

  function clearConsole() {
    wsSend({ t: 'ui:console:clear', payload: {} })
  }

  function sendCommand(cmd: string) {
    wsSend({ t: 'machine:command', payload: { cmd } })
  }

  return {
    connected,
    connecting,
    connectionError,
    connectedMachineId,
    firmwareVersion,
    machineState,
    machinePos,
    workPos,
    feed,
    feedOverride,
    spindleOverride,
    spindleOn,
    spindleRpm,
    spindleDir,
    coolant,
    limitSwitches,
    buffer,
    consoleLog,
    tools,
    toolLibrary,
    magazineSlots,
    stock,
    setStock,
    clearStock,
    applyServerStatus,
    applyMachineStatus,
    connect,
    disconnect,
    addConsole,
    clearConsole,
    sendCommand,
    setToolLibrary,
  }
})
