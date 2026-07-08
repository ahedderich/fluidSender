import { describe, it, expect, vi, beforeEach } from 'vitest'

const { readFile, writeFile } = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('fs/promises', () => ({ readFile, writeFile, default: { readFile, writeFile } }))

vi.stubGlobal('defineEventHandler', (fn: (event: unknown) => unknown) => fn)
const readBodyMock = vi.fn()
vi.stubGlobal('readBody', readBodyMock)

const getHandler = (await import('../../server/api/scenarios.get')).default
const postHandler = (await import('../../server/api/scenarios.post')).default

describe('GET /api/scenarios', () => {
  beforeEach(() => {
    readFile.mockReset()
    writeFile.mockReset()
  })

  it('returns DEFAULTS and persists them when the file read fails', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'))
    const result = await getHandler({} as never)
    expect(result.defaultId).toBeNull()
    expect(result.scenarios).toHaveLength(5)
    expect(writeFile).toHaveBeenCalledTimes(1)
  })

  it('migrates the old plain-array format and persists the migration', async () => {
    const oldFormat = [{ id: 'a' }, { id: 'b' }]
    readFile.mockResolvedValue(JSON.stringify(oldFormat))
    const result = await getHandler({} as never)
    expect(result).toEqual({ defaultId: null, scenarios: oldFormat })
    expect(writeFile).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ defaultId: null, scenarios: oldFormat }, null, 2),
    )
  })

  it('returns the new-shape file verbatim without writing', async () => {
    const current = { defaultId: 'rect-outer-edge', scenarios: [{ id: 'rect-outer-edge' }] }
    readFile.mockResolvedValue(JSON.stringify(current))
    const result = await getHandler({} as never)
    expect(result).toEqual(current)
    expect(writeFile).not.toHaveBeenCalled()
  })
})

describe('POST /api/scenarios', () => {
  beforeEach(() => {
    writeFile.mockReset()
    readBodyMock.mockReset()
  })

  it('writes the body to the scenarios file and returns ok', async () => {
    writeFile.mockResolvedValue(undefined)
    const body = { defaultId: 'x', scenarios: [{ id: 'x' }] }
    readBodyMock.mockResolvedValue(body)

    const result = await postHandler({} as never)
    expect(result).toEqual({ ok: true })
    expect(writeFile).toHaveBeenCalledWith(expect.any(String), JSON.stringify(body, null, 2))
  })
})
