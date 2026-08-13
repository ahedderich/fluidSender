import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SendableLine } from '../../../server/utils/machine/types'

const sendRaw = vi.fn()
const sendByte = vi.fn()

vi.mock('../../../server/utils/machine/connection', () => ({
  machineConnection: {
    sendRaw: (...args: unknown[]) => sendRaw(...args),
    sendByte: (...args: unknown[]) => sendByte(...args),
  },
}))

vi.mock('../../../server/utils/appState', () => ({
  broadcastPatch: vi.fn(),
  pushConsole: vi.fn((entry: unknown) => ({ path: 'console', push: entry })),
  setConnection: vi.fn(() => ({})),
}))

const bufferReporting = { value: true }
vi.mock('../../../server/utils/machine/poller', () => ({
  hasBufferReporting: () => bufferReporting.value,
}))

const { startSend, onOk, onBufUpdate, onMachineDisconnected, getSenderStatus } =
  await import('../../../server/utils/machine/sender')
const { setMode } = await import('../../../server/utils/machine/machineMode')

function line(raw: string, category: SendableLine['category']): SendableLine {
  return { raw, isMotion: category === 'A', category }
}

beforeEach(() => {
  sendRaw.mockClear()
  sendByte.mockClear()
  bufferReporting.value = true
  onMachineDisconnected()  // clears all chunks + resets calibration state
  setMode('idle')
})

describe('character-counting dispatch (Category A/C)', () => {
  it('keeps multiple lines outstanding at once instead of waiting for each ok individually', () => {
    // 30 short moves — well under the 200-byte default budget as a batch, but more
    // than one line, which the old single-pendingAck gate could never send at once.
    const lines = Array.from({ length: 30 }, (_, i) => line(`G1 X${i} Y${i}`, 'A'))
    startSend(lines, undefined)

    expect(sendRaw.mock.calls.length).toBeGreaterThan(1)
  })

  it('stops dispatching once the outstanding byte budget is exhausted', () => {
    // ~12 bytes each; 30 lines = ~360 bytes, comfortably over the 200-byte default.
    const lines = Array.from({ length: 30 }, (_, i) => line(`G1 X${i} Y${i}`, 'A'))
    startSend(lines, undefined)

    expect(sendRaw.mock.calls.length).toBeLessThan(30)
  })

  it('always sends at least one line even if it alone exceeds the budget, and holds the next until acked', () => {
    const huge = line(`G1 X${'1'.repeat(250)}`, 'A')
    const small = line('G1 X1', 'A')
    startSend([huge, small], undefined)

    expect(sendRaw).toHaveBeenCalledTimes(1)
    expect(sendRaw).toHaveBeenCalledWith(huge.raw)

    onOk()  // ack the oversized line
    expect(sendRaw).toHaveBeenCalledTimes(2)
    expect(sendRaw).toHaveBeenLastCalledWith(small.raw)
  })

  it('advances sentPtr as real acks arrive, in order', () => {
    const lines = [line('G1 X1', 'A'), line('G1 X2', 'A'), line('G1 X3', 'A')]
    startSend(lines, undefined)

    expect(getSenderStatus()?.sent).toBe(0)
    onOk()
    expect(getSenderStatus()?.sent).toBe(1)
    onOk()
    expect(getSenderStatus()?.sent).toBe(2)
  })

  it('ignores a stale ok when nothing is outstanding', () => {
    expect(() => onOk()).not.toThrow()
    expect(getSenderStatus()).toBeNull()
  })
})

describe('comment/blank line ordering', () => {
  it('never sends comments to the wire, but still holds their credit behind an outstanding real line ahead of them', () => {
    const real1 = line('G1 X1', 'A')
    const comment = line('; a comment', 'comment')
    const real2 = line('G1 X2', 'A')
    startSend([real1, comment, real2], undefined)

    // Both real lines go out immediately (character counting) — the comment never does.
    expect(sendRaw).toHaveBeenCalledTimes(2)
    expect(sendRaw).toHaveBeenCalledWith(real1.raw)
    expect(sendRaw).toHaveBeenCalledWith(real2.raw)
    expect(sendRaw).not.toHaveBeenCalledWith(comment.raw)

    // Nothing is credited as "sent" yet — the comment must not jump ahead of real1
    // just because it was locally fast-pathed before real1's ok arrived.
    expect(getSenderStatus()?.sent).toBe(0)

    // real1's ok resolves it AND drains the comment behind it in the same step.
    onOk()
    expect(getSenderStatus()?.sent).toBe(2)

    onOk()
    expect(getSenderStatus()?.sent).toBe(3)
  })
})

describe('B1/B2 isolation boundary', () => {
  it('does not dispatch a B1/B2 line until every prior outstanding line has acked', () => {
    const lines = [line('G1 X1', 'A'), line('G1 X2', 'A'), line('M3 S1000', 'B1'), line('G1 X3', 'A')]
    startSend(lines, undefined)

    expect(sendRaw).toHaveBeenCalledTimes(2)
    expect(sendRaw).not.toHaveBeenCalledWith('M3 S1000')

    onOk()  // ack G1 X1
    expect(sendRaw).toHaveBeenCalledTimes(2)  // still waiting on G1 X2

    onOk()  // ack G1 X2 — M3 can now be isolated and sent
    expect(sendRaw).toHaveBeenCalledTimes(3)
    expect(sendRaw).toHaveBeenLastCalledWith('M3 S1000')
  })

  it('blocks all dispatch after a B1/B2 line until its own ok arrives, then collapses executedPtr', () => {
    const lines = [line('M3 S1000', 'B1'), line('G1 X1', 'A')]
    startSend(lines, undefined)

    expect(sendRaw).toHaveBeenCalledTimes(1)
    expect(getSenderStatus()?.executed).toBe(0)

    onOk()  // M3's ok — planner guaranteed drained per FluidNC semantics
    expect(getSenderStatus()?.sent).toBe(1)
    expect(getSenderStatus()?.executed).toBe(1)  // collapses immediately, not via Bf: drain walk

    expect(sendRaw).toHaveBeenCalledTimes(2)
    expect(sendRaw).toHaveBeenLastCalledWith('G1 X1')
  })
})

describe('executedPtr is recomputed from the last-known occupied count (absolute, not delta)', () => {
  it('does not advance executed on ok alone before any Bf: reading has ever been received', () => {
    const lines = Array.from({ length: 5 }, (_, i) => line(`G1 X${i}`, 'A'))
    startSend(lines, undefined)

    for (let i = 0; i < 5; i++) onOk()
    expect(getSenderStatus()?.sent).toBe(5)
    expect(getSenderStatus()?.executed).toBe(0)  // occupied is still unknown — no reading yet

    // Planner goes from full (15 free) down to 10 free — 5 slots occupied, none of the
    // 5 acked lines confirmed done yet.
    onBufUpdate(10, 256, 'Run', null)
    expect(getSenderStatus()?.executed).toBe(0)

    // Planner reports fully free again — 0 occupied, everything sent is done.
    onBufUpdate(15, 256, 'Run', null)
    expect(getSenderStatus()?.executed).toBe(5)
  })

  it('advances executed immediately on new acks using the last-known occupied count, with no fresh poll required', () => {
    // This is the steady-state case that used to stall: occupied holds constant across
    // a run of acks, so a delta-based drain walk would never see drained > 0 again.
    const lines = Array.from({ length: 10 }, (_, i) => line(`G1 X${i}`, 'A'))
    startSend(lines, undefined)

    for (let i = 0; i < 5; i++) onOk()
    expect(getSenderStatus()?.executed).toBe(0)  // no reading yet

    // First (and only) reading: 3 slots occupied out of 5 sent.
    onBufUpdate(12, 256, 'Run', null)
    expect(getSenderStatus()?.executed).toBe(2)

    // Three more acks land with NO further onBufUpdate call — executed must still climb,
    // recomputed from the same cached occupied=3 against the new sentPtr=8.
    for (let i = 0; i < 3; i++) onOk()
    expect(getSenderStatus()?.sent).toBe(8)
    expect(getSenderStatus()?.executed).toBe(5)
  })
})

describe('dispatch is gated on bytes-in-flight alone, not a separate planner-slot cap', () => {
  it('sends far more Category A lines outstanding at once than the old planner-slot fallback (3) allowed', () => {
    // ~9 bytes each; 10 lines = ~90 bytes, comfortably under the 200-byte default budget,
    // and no Idle report has calibrated _maxPlannerSlots — the old gate would have
    // stopped dispatch at its uncalibrated fallback of 3.
    const lines = Array.from({ length: 10 }, (_, i) => line(`G1 X${i}`, 'A'))
    startSend(lines, undefined)

    expect(sendRaw).toHaveBeenCalledTimes(10)
  })
})

describe('RX budget calibration', () => {
  it('self-calibrates upward from an Idle status report and resets on disconnect', () => {
    // 25 lines totalling 255 bytes — over the 200-byte default budget, under a
    // ~268-byte calibrated one (300 - 32 margin).
    const makeLines = () => Array.from({ length: 25 }, (_, i) => line(`G1 X${i} Y${i}`, 'A'))

    // No active chunk — calibrate purely from an Idle poll before any job starts.
    onBufUpdate(15, 300, 'Idle', null)
    startSend(makeLines(), undefined)
    expect(sendRaw.mock.calls.length).toBe(25)

    onMachineDisconnected()
    setMode('idle')

    // Fresh connection (no calibration) — same 255-byte batch must now stop short
    // of the default 200-byte budget.
    sendRaw.mockClear()
    startSend(makeLines(), undefined)
    expect(sendRaw.mock.calls.length).toBeLessThan(25)
  })
})
