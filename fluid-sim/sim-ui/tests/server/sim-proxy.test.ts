import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', fetchMock)
vi.stubGlobal('defineEventHandler', (fn: (event: unknown) => unknown) => fn)
vi.stubGlobal('getRouterParam', (event: { path?: string }) => event.path)
vi.stubGlobal('readBody', (event: { body?: unknown }) => Promise.resolve(event.body))
vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

const proxyHandler = (await import('../../server/api/sim/[...path].ts')).default
// useRuntimeConfig() is a real Nuxt composable in this test environment; the sim
// proxy target comes from its default (unset SIM_CONTROL_URL -> localhost:8766).
const SIM_CONTROL_URL = 'http://localhost:8766'

describe('sim proxy route', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('forwards GET requests to the sim control URL and returns the upstream body', async () => {
    fetchMock.mockResolvedValue({ ok: true, value: 42 })

    const result = await proxyHandler({ method: 'GET', path: 'machine/state' } as never)

    expect(fetchMock).toHaveBeenCalledWith(`${SIM_CONTROL_URL}/api/machine/state`, { method: 'GET' })
    expect(result).toEqual({ ok: true, value: 42 })
  })

  it('forwards POST requests with the parsed body as JSON', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const body = { speed: 5 }

    const result = await proxyHandler({ method: 'POST', path: 'machine/speed', body } as never)

    expect(fetchMock).toHaveBeenCalledWith(`${SIM_CONTROL_URL}/api/machine/speed`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(result).toEqual({ ok: true })
  })

  it('throws a 502 when the upstream sim is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))

    await expect(proxyHandler({ method: 'GET', path: 'machine/state' } as never)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('Sim unreachable'),
    })
  })
})
