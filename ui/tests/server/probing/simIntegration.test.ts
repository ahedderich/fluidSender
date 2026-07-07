import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { machineConnection } from '../../../server/utils/machine/connection'
import type { ConnectionEvent } from '../../../server/utils/machine/connection'
import { sendGCode, onOk, onBufUpdate } from '../../../server/utils/machine/sender'
import { initPoller, startPoller, stopPoller, onStatusLine, getLastMachineStatus } from '../../../server/utils/machine/poller'
import { initMachineMode } from '../../../server/utils/machine/machineMode'
import { probingRunner } from '../../../server/utils/probing/probingRunner'
import { getProbingState } from '../../../server/utils/appState'
import type { ProbeConfig, ProbeCompensation } from '../../../server/utils/tool/types'

// Node 18 (the test:server target) has no global WebCrypto; the sender uses crypto.randomUUID.
if (!globalThis.crypto) (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto

// Probe-deviation round-trip against the Rust simulator (PROBE_DEVIATION_PLAN.md §8.3).
// Requires a running fluid-sim; gated so CI without a sim stays green:
//   SIM_HOST=127.0.0.1 [SIM_PORT=8765] [SIM_CONTROL_PORT=8766] npm run test:server
// The test forces sim_speed = 1 via the control API — trigger quantization scales
// with sim speed and would break the tolerances at higher speeds.

const SIM_HOST = process.env.SIM_HOST
const SIM_PORT = Number(process.env.SIM_PORT ?? 8765)
const SIM_CONTROL_PORT = Number(process.env.SIM_CONTROL_PORT ?? 8766)

const TIP_DIAMETER = 2.0
const TIP_RADIUS = TIP_DIAMETER / 2

// 40×40 stock centred on the sim's initial XY position (-150, -100), top z = -10
// → faces at x = -170/-130, y = -120/-80.
const STOCK = {
  shape: { type: 'rect', width: 40, height: 40, rotation: 0 },
  depth: 20,
  ox: -150,
  oy: -100,
  oz: -10,
  hole: null,
  point: null,
}
const LEFT_FACE_X = STOCK.ox - 40 / 2
const TOP_Z = STOCK.oz

const ZERO_COMP: ProbeCompensation = { xPlus: 0, xMinus: 0, yPlus: 0, yMinus: 0, zMinus: 0 }
const DEVIATIONS: ProbeCompensation = { xPlus: 0.15, xMinus: -0.08, yPlus: 0.05, yMinus: 0.12, zMinus: 0.2 }

// Low feeds keep the sim's per-tick trigger quantization well inside the ±0.05 tolerance.
const PROBE_CFG: ProbeConfig = {
  wiggleEnabled: true,
  fastFeedMmPerMin: 120,
  slowFeedMmPerMin: 30,
  cycles: 1,
  averageN: 2,
}

const TOLERANCE = 0.05

async function controlPost(path: string, body: unknown): Promise<void> {
  const res = await fetch(`http://${SIM_HOST}:${SIM_CONTROL_PORT}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert.ok(res.ok, `control API ${path} failed: ${res.status}`)
}

function gcode(lines: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    sendGCode(lines, (ev) => {
      if (ev.status === 'completed') {
        if (ev.completedMode === 'success') resolve()
        else reject(new Error(`send failed: ${ev.errorReason ?? ev.completedMode}`))
      }
    })
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`)
    await sleep(50)
  }
}

/** Waits for the poller to refresh, then returns the current WCO (the probes
 *  re-zero the WCS after every edge, so it must be re-read before each use). */
async function freshWco(): Promise<{ x: number; y: number; z: number }> {
  await sleep(600) // ≥ 2 poll intervals after any G10 WCS change
  const s = getLastMachineStatus()
  assert.ok(s, 'machine status available')
  return s.wco
}

/** Zeroes the WCS at the parked position and waits for the poller to report the
 *  new WCO. The probing runner (like real usage) assumes the work origin is near
 *  the probe site — _sendProbeCmd targets absolute work coordinates. */
async function zeroWcsAt(machinePos: { x: number; y: number; z: number }): Promise<void> {
  await gcode(['G10 L20 P0 X0 Y0 Z0'])
  await waitFor(() => {
    const s = getLastMachineStatus()
    return !!s
      && Math.abs(s.wco.x - machinePos.x) < 0.01
      && Math.abs(s.wco.y - machinePos.y) < 0.01
      && Math.abs(s.wco.z - machinePos.z) < 0.01
  }, 5000, 'WCO to settle at park position')
}

/** Parks 5 mm outside the stock's left face, below the top surface, and zeroes
 *  the WCS there (moves converted through the live WCO; XY first — the XY path
 *  stays outside the stock footprint before plunging). */
async function parkForXProbe(): Promise<void> {
  const wco = await freshWco()
  const park = { x: LEFT_FACE_X - 5, y: STOCK.oy, z: -12 }
  await gcode([
    `G0 X${(park.x - wco.x).toFixed(4)} Y${(park.y - wco.y).toFixed(4)}`,
    `G0 Z${(park.z - wco.z).toFixed(4)}`,
  ])
  await zeroWcsAt(park)
}

/** Parks 8 mm above the stock top, over its centre (Z up first), and zeroes the WCS. */
async function parkForZProbe(): Promise<void> {
  const wco = await freshWco()
  const park = { x: STOCK.ox, y: STOCK.oy, z: TOP_Z + 8 }
  await gcode([
    `G0 Z${(park.z - wco.z).toFixed(4)}`,
    `G0 X${(park.x - wco.x).toFixed(4)} Y${(park.y - wco.y).toFixed(4)}`,
  ])
  await zeroWcsAt(park)
}

/** Runs one edge probe through the real runner and returns the corrected surface
 *  position in machine coordinates (edgeWpos + wco at call time). */
async function probeEdgeMachine(
  axis: 'X' | 'Y' | 'Z',
  direction: '+' | '-',
  comp: ProbeCompensation,
): Promise<number> {
  const status = getLastMachineStatus()
  assert.ok(status, 'machine status available')
  const wco = status.wco[axis.toLowerCase() as 'x' | 'y' | 'z']
  await probingRunner.probeIndividualEdge(axis, direction, TIP_RADIUS, PROBE_CFG, 5, comp)
  const ps = getProbingState()
  assert.equal(ps.phase, 'completed', `probe failed: ${ps.errorMessage}`)
  const result = ps.stepResults[0]
  assert.ok(result, 'probe produced a step result')
  return result.edgeWpos + wco
}

describe('probe deviation round-trip (sim)', { skip: !SIM_HOST, timeout: 300_000 }, () => {
  before(async () => {
    initPoller(() => {})
    initMachineMode(() => {})

    machineConnection.on('event', (ev: ConnectionEvent) => {
      if (ev.type === 'ok') onOk()
      else if (ev.type === 'statusLine') {
        onStatusLine(ev.line)
        const s = getLastMachineStatus()
        if (s) onBufUpdate(s.buffer.planner, s.state, s.holdPhase)
      } else if (ev.type === 'responseLine' && ev.line.startsWith('error:')) {
        onOk()
      }
    })

    await controlPost('/api/machine/speed', { speed: 1 })
    await controlPost('/api/machine/config', {
      probeTipDiameter: TIP_DIAMETER,
      probeDeviations: ZERO_COMP,
    })
    await controlPost('/api/stock', STOCK)

    await machineConnection.connect('sim', [{
      id: 'sim',
      connection: { type: 'tcp', tcpHost: SIM_HOST, tcpPort: SIM_PORT, serialPort: '', baudRate: 115200 },
    }])
    await waitFor(() => machineConnection.isConnected, 5000, 'TCP connection')
    startPoller()
    await waitFor(() => getLastMachineStatus() !== null, 5000, 'first machine status')
  })

  after(() => {
    stopPoller()
    machineConnection.disconnect()
  })

  it('zero deviation: computed surfaces match the stock geometry (§2.4 sign fix)', async () => {
    await parkForXProbe()
    const xSurface = await probeEdgeMachine('X', '+', ZERO_COMP)
    assert.ok(Math.abs(xSurface - LEFT_FACE_X) <= TOLERANCE,
      `X surface ${xSurface.toFixed(3)} expected ${LEFT_FACE_X} ±${TOLERANCE}`)

    // The probe re-zeroed the WCS at the measurement site: the edge is work X0,
    // so wco.x equals the edge's machine position.
    const xWco = await freshWco()
    assert.ok(Math.abs(xWco.x - LEFT_FACE_X) <= TOLERANCE,
      `wco.x ${xWco.x.toFixed(3)} expected ${LEFT_FACE_X} ±${TOLERANCE} (edge = work X0)`)
    const xStatus = getLastMachineStatus()
    assert.ok(xStatus, 'status after X probe')
    assert.ok(xStatus.mpos.x < LEFT_FACE_X - 4,
      `mpos.x ${xStatus.mpos.x.toFixed(3)} should be backed off the edge at ${LEFT_FACE_X}`)

    await parkForZProbe()
    const zSurface = await probeEdgeMachine('Z', '-', ZERO_COMP)
    assert.ok(Math.abs(zSurface - TOP_Z) <= TOLERANCE,
      `Z surface ${zSurface.toFixed(3)} expected ${TOP_Z} ±${TOLERANCE}`)

    const zWco = await freshWco()
    assert.ok(Math.abs(zWco.z - TOP_Z) <= TOLERANCE,
      `wco.z ${zWco.z.toFixed(3)} expected ${TOP_Z} ±${TOLERANCE} (surface = work Z0)`)
    const zStatus = getLastMachineStatus()
    assert.ok(zStatus, 'status after Z probe')
    assert.ok(zStatus.mpos.z > TOP_Z + 4,
      `mpos.z ${zStatus.mpos.z.toFixed(3)} should be backed off above the surface at ${TOP_Z}`)
  })

  it('asymmetric deviations with matching compensation cancel exactly', async () => {
    await controlPost('/api/machine/config', { probeDeviations: DEVIATIONS })

    await parkForXProbe()
    const xSurface = await probeEdgeMachine('X', '+', DEVIATIONS)
    assert.ok(Math.abs(xSurface - LEFT_FACE_X) <= TOLERANCE,
      `compensated X surface ${xSurface.toFixed(3)} expected ${LEFT_FACE_X} ±${TOLERANCE}`)

    const xWco = await freshWco()
    assert.ok(Math.abs(xWco.x - LEFT_FACE_X) <= TOLERANCE,
      `compensated wco.x ${xWco.x.toFixed(3)} expected ${LEFT_FACE_X} ±${TOLERANCE}`)

    await parkForZProbe()
    const zSurface = await probeEdgeMachine('Z', '-', DEVIATIONS)
    assert.ok(Math.abs(zSurface - TOP_Z) <= TOLERANCE,
      `compensated Z surface ${zSurface.toFixed(3)} expected ${TOP_Z} ±${TOLERANCE}`)

    const zWco = await freshWco()
    assert.ok(Math.abs(zWco.z - TOP_Z) <= TOLERANCE,
      `compensated wco.z ${zWco.z.toFixed(3)} expected ${TOP_Z} ±${TOLERANCE}`)
  })

  it('deviation without compensation shifts the result by exactly the deviation', async () => {
    await controlPost('/api/machine/config', { probeDeviations: DEVIATIONS })

    await parkForXProbe()
    const xSurface = await probeEdgeMachine('X', '+', ZERO_COMP)
    // Sim triggers late by xPlus, so the uncompensated result over-reports by the same amount.
    const expected = LEFT_FACE_X + DEVIATIONS.xPlus
    assert.ok(Math.abs(xSurface - expected) <= TOLERANCE,
      `uncompensated X surface ${xSurface.toFixed(3)} expected ${expected.toFixed(3)} ±${TOLERANCE}`)
  })
})
