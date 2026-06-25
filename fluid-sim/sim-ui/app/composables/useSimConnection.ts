import { useSimStore, type MachineState, type LimitKey, type AxisKey, AXES } from '~/stores/sim'

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
  probeTipDiameter: number
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

  function applyState(msg: SimStateMsg) {
    store.connected = true
    store.machineState = msg.machineState
    store.axisCount = msg.axisCount
    store.simSpeed = msg.simSpeed
    store.probe.tipDiameter = msg.probeTipDiameter
    store.probe.triggered = msg.probeTriggered
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

  function disconnect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (ws) { ws.close(); ws = null }
    store.connected = false
  }

  return { connect, disconnect }
}
