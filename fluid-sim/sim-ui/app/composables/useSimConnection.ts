import { useSimStore, type MachineState, type AxisKey, type ConsoleLine, AXES } from '~/stores/sim'

interface SimStateMsg {
  machineState: MachineState
  pos: Record<AxisKey, number>
  wco: Record<AxisKey, number>
  feed: number
  spindleSpeed: number
  spindleMode: string
  coolant: string
  limits: {
    xMin: boolean; xMax: boolean
    yMin: boolean; yMax: boolean
    zMin: boolean; zMax: boolean
  }
  probeTriggered: boolean
  probeDeviations: {
    xPlus: number; xMinus: number
    yPlus: number; yMinus: number
    zMinus: number
  }
  door: boolean
  simSpeed: number
  axisCount: number
  travel: Record<AxisKey, number>
  fluidConfig: Record<string, string>
}

export function useSimConnection() {
  const store = useSimStore()
  const config = useRuntimeConfig()

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = 1000

  let consoleWs: WebSocket | null = null
  let consoleReconnectTimer: ReturnType<typeof setTimeout> | null = null
  let consoleRetryDelay = 1000

  function applyState(msg: SimStateMsg) {
    store.connected = true
    store.machineState = msg.machineState
    store.axisCount = msg.axisCount
    store.simSpeed = msg.simSpeed
    store.probe.triggered = msg.probeTriggered
    if (msg.probeDeviations) Object.assign(store.probe.deviations, msg.probeDeviations)
    store.limits.xMin = msg.limits.xMin
    store.limits.xMax = msg.limits.xMax
    store.limits.yMin = msg.limits.yMin
    store.limits.yMax = msg.limits.yMax
    store.limits.zMin = msg.limits.zMin
    store.limits.zMax = msg.limits.zMax
    store.limits.door = msg.door
    for (const a of AXES) {
      store.pos[a] = msg.pos[a] ?? store.pos[a]
      store.wco[a] = msg.wco[a] ?? store.wco[a]
      store.travel[a] = msg.travel[a] ?? store.travel[a]
    }
    // Merge fluidConfig without losing keys not in the snapshot
    if (msg.fluidConfig) {
      for (const [k, v] of Object.entries(msg.fluidConfig)) {
        store.fluidConfig[k] = v
      }
    }
  }

  function connect() {
    if (ws) { ws.close(); ws = null }

    const wsUrl = `${config.public.simControlWsUrl}/ws/state`
    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      retryDelay = 1000
      store.applyDefaultScenario()
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as SimStateMsg
        applyState(msg)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onerror = () => {
      store.connected = false
    }

    ws.onclose = () => {
      store.connected = false
      ws = null
      // Exponential backoff, cap at 5 s
      reconnectTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, 5000)
        connect()
      }, retryDelay)
    }
  }

  // Separate WS for the display-only protocol console (`/ws/console`).
  function connectConsole() {
    if (consoleWs) { consoleWs.close(); consoleWs = null }

    consoleWs = new WebSocket(`${config.public.simControlWsUrl}/ws/console`)

    consoleWs.onopen = () => { consoleRetryDelay = 1000 }

    consoleWs.onmessage = (event: MessageEvent) => {
      try {
        store.pushConsoleLine(JSON.parse(event.data as string) as ConsoleLine)
      } catch {
        // ignore malformed messages
      }
    }

    consoleWs.onclose = () => {
      consoleWs = null
      consoleReconnectTimer = setTimeout(() => {
        consoleRetryDelay = Math.min(consoleRetryDelay * 2, 5000)
        connectConsole()
      }, consoleRetryDelay)
    }
  }

  function connectAll() {
    connect()
    connectConsole()
  }

  function disconnect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (ws) { ws.close(); ws = null }
    if (consoleReconnectTimer) { clearTimeout(consoleReconnectTimer); consoleReconnectTimer = null }
    if (consoleWs) { consoleWs.close(); consoleWs = null }
    store.connected = false
  }

  return { connect: connectAll, disconnect }
}
