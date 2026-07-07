import { defineStore } from 'pinia'
import { useSettingsStore } from '~/stores/settings'
import { useSyncStore } from '~/stores/sync'
import { wsSend, wsConnected } from '~/composables/useWsSend'

// Re-export canonical types from server utils so client and server share the same shapes
export type { MachineStatus } from '~~/server/utils/machine/types'
import type { MachineStatus } from '~~/server/utils/machine/types'
export type { StockDef } from '~~/server/utils/appState'
import type { StockDef } from '~~/server/utils/appState'

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


export type { ToolLibraryEntry } from '~~/server/utils/tool/types'
import type { ToolLibraryEntry } from '~~/server/utils/tool/types'

export interface ServerConnectionState {
  machineId: string | null
  connected: boolean
  status: string
  firmwareVersion: string
  simulatorMode: boolean
}

export const useMachineStore = defineStore('machine', () => {
  const connected = ref(false)
  const connecting = ref(false)
  const connectionError = ref('')
  const connectedMachineId = ref<string | null>(null)
  const firmwareVersion = ref('')
  const simulatorMode = ref(false)
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
  const probe = ref(false)
  const toolsetter = ref(false)
  const door = ref(false)
  const buffer = ref({ planner: 0, rx: 0 })

  // Console is server-owned; this is a read alias so existing components work unchanged
  const sync = useSyncStore()
  const consoleLog = computed(() => sync.consoleLog)

  const tools = ref<Tool[]>([])
  const toolLibrary = reactive<{ machine: ToolLibraryEntry[]; app: ToolLibraryEntry[] }>({ machine: [], app: [] })
  const magazineSlots = ref<(number | null)[]>([])
  const stock = ref<StockDef | null>(null)
  const loadedToolNumber = ref<number | null>(null)

  function setToolLibrary(library: { machine: ToolLibraryEntry[]; app: ToolLibraryEntry[] }) {
    toolLibrary.machine.splice(0, toolLibrary.machine.length, ...library.machine)
    toolLibrary.app.splice(0, toolLibrary.app.length, ...library.app)
  }

  function setLoadedToolNumber(n: number | null) {
    loadedToolNumber.value = n
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
    simulatorMode.value = state.simulatorMode ?? false

    if (!state.connected) {
      limitSwitches.value = []
      probe.value = false
      toolsetter.value = false
      door.value = false
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
    probe.value = s.probe
    toolsetter.value = s.toolsetter
    door.value = s.door
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

  function sendOverride(bytes: number[]) {
    wsSend({ t: 'machine:override', payload: { bytes } })
  }

  function reloadFirmwareConfig() {
    wsSend({ t: 'machine:firmware:reload', payload: {} })
  }

  return {
    connected,
    connecting,
    connectionError,
    connectedMachineId,
    firmwareVersion,
    simulatorMode,
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
    probe,
    toolsetter,
    door,
    buffer,
    consoleLog,
    tools,
    toolLibrary,
    magazineSlots,
    stock,
    loadedToolNumber,
    setStock,
    clearStock,
    setLoadedToolNumber,
    applyServerStatus,
    applyMachineStatus,
    connect,
    disconnect,
    addConsole,
    clearConsole,
    sendCommand,
    sendOverride,
    setToolLibrary,
    reloadFirmwareConfig,
  }
})
