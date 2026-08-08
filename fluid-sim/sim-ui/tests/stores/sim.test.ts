import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useSimStore, type Scenario } from '../../app/stores/sim'

// $fetch is a Nuxt auto-import bound at module-transform time under the Vite
// Module Runner (@nuxt/test-utils v4.1+) — vi.stubGlobal('$fetch', ...) no
// longer intercepts it since the store's reference isn't read off globalThis
// at call time. mockNuxtImport hooks the auto-import itself instead.
const fetchMock = vi.hoisted(() => vi.fn())
mockNuxtImport('$fetch', () => fetchMock)

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
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset().mockResolvedValue({})
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

  it('setMaxRate updates local state synchronously and posts the new rate', async () => {
    const store = useSimStore()

    const pending = store.setMaxRate({ x: 7500 })
    expect(store.maxRate.x).toBe(7500)
    await pending

    expect(fetchMock).toHaveBeenCalledWith('/api/sim/machine/config', {
      method: 'POST',
      body: { maxRate: { x: 7500 } },
    })
  })

  it('setFirmwareVersion updates local state synchronously and posts the new version', async () => {
    const store = useSimStore()

    const pending = store.setFirmwareVersion('9.9.9')
    expect(store.firmwareVersion).toBe('9.9.9')
    await pending

    expect(fetchMock).toHaveBeenCalledWith('/api/sim/machine/version', {
      method: 'POST',
      body: { version: '9.9.9' },
    })
  })
})
