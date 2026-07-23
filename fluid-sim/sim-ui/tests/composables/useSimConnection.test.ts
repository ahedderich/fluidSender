import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSimStore } from '../../app/stores/sim'
import { useSimConnection } from '../../app/composables/useSimConnection'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  close() {}
}

describe('useSimConnection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({}))
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  it('connect() opens a WebSocket at the sim control state endpoint', () => {
    const { connect } = useSimConnection()
    connect()

    const stateSocket = MockWebSocket.instances.find((ws) => ws.url.endsWith('/ws/state'))
    expect(stateSocket).toBeDefined()
    expect(stateSocket?.url).toBe('ws://localhost:8766/ws/state')
  })

  it('applies an incoming state message onto the store', () => {
    const store = useSimStore()
    const { connect } = useSimConnection()
    connect()

    const stateSocket = MockWebSocket.instances.find((ws) => ws.url.endsWith('/ws/state'))!
    stateSocket.onmessage?.({
      data: JSON.stringify({
        machineState: 'Run',
        pos: { x: 1, y: 2, z: 3, a: 0, b: 0, c: 0 },
        wco: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 },
        feed: 100,
        spindleSpeed: 0,
        spindleMode: 'off',
        coolant: 'off',
        limits: { xMin: false, xMax: false, yMin: false, yMax: false, zMin: false, zMax: false },
        probeTriggered: false,
        probeDeviations: { xPlus: 0, xMinus: 0, yPlus: 0, yMinus: 0, zMinus: 0 },
        door: false,
        simSpeed: 2,
        axisCount: 3,
        travel: { x: 300, y: 200, z: 80, a: 360, b: 360, c: 360 },
        maxRate: { x: 5000, y: 5000, z: 1000, a: 1000, b: 1000, c: 1000 },
        fluidConfig: {},
        toolLengthOffset: 0,
        toolNumber: 0,
        firmwareVersion: '4.0.3',
      }),
    })

    expect(store.connected).toBe(true)
    expect(store.machineState).toBe('Run')
    expect(store.pos.x).toBe(1)
    expect(store.simSpeed).toBe(2)
    expect(store.firmwareVersion).toBe('4.0.3')
  })

  it('applies the default scenario when the socket opens', () => {
    const store = useSimStore()
    store.scenarios = [
      {
        id: 'default-one',
        name: 'Default',
        machineState: 'Idle',
        pos: { x: -5, y: -6, z: 7 },
        wco: { x: 0, y: 0, z: 0 },
        stock: { shape: 'rect', width: 10, height: 10, depth: 10, ox: -5, oy: -6, oz: -10, diameter: 10, rotation: 0 },
      },
    ]
    store.defaultScenarioId = 'default-one'

    const { connect } = useSimConnection()
    connect()

    const stateSocket = MockWebSocket.instances.find((ws) => ws.url.endsWith('/ws/state'))!
    stateSocket.onopen?.()

    expect(store.pos.x).toBe(-5)
    expect(store.pos.y).toBe(-6)
    expect(store.pos.z).toBe(7)
  })
})
