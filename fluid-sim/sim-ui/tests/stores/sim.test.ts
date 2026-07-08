import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSimStore, type Scenario } from '../../app/stores/sim'

const scenario: Scenario = {
  id: 'test-scenario',
  name: 'Test Scenario',
  machineState: 'Idle',
  pos: { x: -10, y: -20, z: 3 },
  wco: { x: 1, y: 2, z: 0 },
  stock: {
    shape: 'rect',
    width: 50,
    height: 40,
    depth: 10,
    ox: -10,
    oy: -20,
    oz: -10,
    diameter: 40,
    rotation: 0,
  },
}

describe('useSimStore', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock = vi.fn().mockResolvedValue({})
    vi.stubGlobal('$fetch', fetchMock)
  })

  it('applyScenario applies local state and pushes position/wco/stock to the sim', async () => {
    const store = useSimStore()

    await store.applyScenario(scenario)

    expect(store.machineState).toBe('Idle')
    expect(store.pos.x).toBe(-10)
    expect(store.pos.y).toBe(-20)
    expect(store.pos.z).toBe(3)
    expect(store.wco.x).toBe(1)
    expect(store.wco.y).toBe(2)
    expect(store.stock.width).toBe(50)
    expect(store.stock.ox).toBe(-10)

    expect(fetchMock).toHaveBeenCalledWith('/api/sim/machine/position', {
      method: 'POST',
      body: scenario.pos,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/sim/machine/wco', {
      method: 'POST',
      body: scenario.wco,
    })
  })

  it('setSimSpeed updates local state synchronously and posts the new speed', async () => {
    const store = useSimStore()

    const pending = store.setSimSpeed(5)
    expect(store.simSpeed).toBe(5)
    await pending

    expect(fetchMock).toHaveBeenCalledWith('/api/sim/machine/speed', {
      method: 'POST',
      body: { speed: 5 },
    })
  })

  it('swallows fetch errors from setSimSpeed and applyScenario without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('unreachable'))
    const store = useSimStore()

    await expect(store.setSimSpeed(3)).resolves.toBeUndefined()
    await expect(store.applyScenario(scenario)).resolves.toBeUndefined()
  })
})
