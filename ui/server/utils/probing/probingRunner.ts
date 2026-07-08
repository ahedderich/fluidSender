import { broadcastPatch, getProbingState, setProbingState, setStock, getStock, saveProbingResults } from '../appState'
import { getLastMachineStatus } from '../machine/poller'
import { sendGCode } from '../machine/sender'
import { getMode, setMode } from '../machine/machineMode'
import { machineConnection } from '../machine/connection'
import type { ConnectionEvent } from '../machine/connection'
import type { ProbeConfig, ProbeCompensation } from '../tool/types'
import { DEFAULT_PROBE_COMPENSATION } from '../tool/types'
import type { ProbingStepResult, HeightmapResult } from '../appState'

// ─── PRB event buffer ─────────────────────────────────────────────────────────

let _pendingPrb: { mpos: { x: number; y: number; z: number; a?: number }; contact: boolean } | null = null

machineConnection.on('event', (ev: ConnectionEvent) => {
  if (ev.type === 'probeLine') {
    _pendingPrb = { mpos: ev.mpos, contact: ev.contact }
  }
})

function _consumePrb() {
  const p = _pendingPrb
  _pendingPrb = null
  return p
}

// ─── Mode guard ──────────────────────────────────────────────────────────────

function _assertCanProbe(): void {
  const mode = getMode()
  if (mode === 'sending') throw new Error('Cannot probe while a job is running')
  if (mode === 'probing') throw new Error('A probing routine is already active')
}

// Real FluidNC firmware rejects every G-code line with an error while in Alarm
// (see execute_line() in ProcessSettings.cpp: "Block if in alarm or jog mode").
// The simulator always boots Idle, so a probe never used to hang here — against
// real hardware that hasn't been homed/unlocked, _flush() would otherwise wait
// forever for an Idle status that never arrives, leaving the wizard stuck on its
// first step with the machine never moving.
function _assertMachineIdle(): void {
  const status = getLastMachineStatus()
  if (!status || status.state !== 'Idle') {
    throw new Error(
      `Machine must be Idle to probe (currently: ${status?.state ?? 'disconnected'}). Home or unlock it first.`,
    )
  }
}

// ─── Flush helper (waits for send to complete) ───────────────────────────────

async function _flush(lines: string[]): Promise<void> {
  if (lines.length === 0) return
  await new Promise<void>((resolve, reject) => {
    sendGCode(lines, (ev) => {
      if (ev.status === 'completed') {
        if (ev.completedMode === 'success') resolve()
        else reject(new Error(`Send failed: ${ev.errorReason ?? ev.completedMode ?? 'unknown'}`))
      }
    })
  })
}

// ─── Core probe primitive ─────────────────────────────────────────────────────

async function _sendProbeCmd(
  axis: 'X' | 'Y' | 'Z',
  direction: '+' | '-',
  distance: number,
  feedMmPerMin: number,
): Promise<{ mpos: { x: number; y: number; z: number }; contact: boolean } | null> {
  _pendingPrb = null
  const sign = direction === '+' ? '' : '-'
  // The axis word is a travel distance, so the probe must run in G91 — and on a
  // separate line: G91/G90 in the same block as the motion is a FluidNC
  // modal-group violation.
  const cmd = `G38.3 F${feedMmPerMin} ${axis}${sign}${distance.toFixed(4)}`
  await _flush(['G91', cmd, 'G90'])
  const prb = _consumePrb()
  if (!prb) return null
  return { mpos: prb.mpos, contact: prb.contact }
}

// ─── Deviation blending ──────────────────────────────────────────────────────────

/**
 * Blend per-direction deviations for an arbitrary unit probe direction `dir`
 * (direction of motion into the surface): L1-normalized weights over |n_i|,
 * signed per-axis lookup; +Z probing has no defined deviation and contributes 0.
 * Returns r_eff: the distance between tool-centre and stock surface at trigger.
 */
export function blendDeviation(dir: [number, number, number], comp: ProbeCompensation): number {
  const [nx, ny, nz] = dir
  const l1 = Math.abs(nx) + Math.abs(ny) + Math.abs(nz)
  if (l1 < 1e-9) return 0
  const devX = nx > 0 ? comp.xPlus : comp.xMinus
  const devY = ny > 0 ? comp.yPlus : comp.yMinus
  const devZ = nz < 0 ? comp.zMinus : 0
  return (Math.abs(nx) * devX + Math.abs(ny) * devY + Math.abs(nz) * devZ) / l1
}

/** Axis-aligned wrapper over blendDeviation for the current wizards (§2.4 table). */
export function deviationFor(
  axis: 'X' | 'Y' | 'Z',
  direction: '+' | '-',
  comp: ProbeCompensation,
): number {
  const sign = direction === '+' ? 1 : -1
  const dir: [number, number, number] = [
    axis === 'X' ? sign : 0,
    axis === 'Y' ? sign : 0,
    axis === 'Z' ? sign : 0,
  ]
  return blendDeviation(dir, comp)
}

// ─── Edge / zero computation ─────────────────────────────────────────────────

/** Retreat distance off the surface after an edge probe (mm). */
const EDGE_RETREAT_MM = 5

/**
 * Compute the corrected edge position and the zero value from raw probe readings
 * (all machine coordinates). `effective` = deviationFor(axis, dir, comp): the
 * distance between tool-centre and stock surface at trigger. '+' probes add
 * effective, '−' probes subtract it.
 *
 * `zeroAtSettle = settleRaw − edgeMach` is the `G10 L20` value that makes the
 * averaged, corrected edge read exactly 0 — valid only while the machine still
 * sits at `settleRaw`. Its `settleRaw − avgRaw` component is what carries the
 * wiggle average into the WCS; do not "simplify" it to ±effective.
 */
export function edgeZeroValues(
  readings: number[],
  settleRaw: number,
  direction: '+' | '-',
  effective: number,
  averageN: number,
): { edgeMach: number; zeroAtSettle: number } {
  const avgN = Math.min(averageN, readings.length)
  const subset = readings.slice(-avgN)
  const avgRaw = subset.reduce((s, v) => s + v, 0) / subset.length
  const correction = direction === '+' ? effective : -effective
  const edgeMach = avgRaw + correction
  return { edgeMach, zeroAtSettle: settleRaw - edgeMach }
}

// ─── Multi-speed wiggle probe ─────────────────────────────────────────────────

export interface EdgeProbeResult {
  /** Corrected edge position in work coords (WCS in effect when probing started). */
  edgeWpos: number
  /**
   * `G10 L20` value that zeroes the averaged, corrected edge — only valid while
   * the machine still sits at the settled probe position (see edgeZeroValues).
   */
  zeroAtSettle: number
}

// probeEdge is measurement-only: it returns with the machine settled at the probe
// site and never retreats. Two zeroing idioms exist on top of it:
//   • zero-at-site (single-axis touch-off): probe → `G10 L20 P0 {axis}{zeroAtSettle}`
//     in its own flush → retreat;
//   • move-then-zero (computed point, e.g. a center): move there → `G10 L20 P0 …`.
export async function probeEdge(
  axis: 'X' | 'Y' | 'Z',
  direction: '+' | '-',
  maxDistance: number,
  config: ProbeConfig,
  compensation: ProbeCompensation,
  wco: { x: number; y: number; z: number },
  abortCheck: () => boolean,
): Promise<EdgeProbeResult> {
  const readings: number[] = []
  const axisKey = axis.toLowerCase() as 'x' | 'y' | 'z'
  const effective = deviationFor(axis, direction, compensation)
  // Machine position of the last PRB consumed ≈ where the machine physically sits
  // when the cycle ends (probes stop at their trigger; final-step decel at slow
  // feed is negligible). Updated even for a missed retract — that PRB is not a
  // usable reading, but it is still the accurate stop position.
  let settleRaw = 0

  if (!config.wiggleEnabled) {
    const res = await _sendProbeCmd(axis, direction, maxDistance, config.slowFeedMmPerMin)
    if (!res || !res.contact) throw new Error(`No contact on ${axis}${direction} probe`)
    readings.push(res.mpos[axisKey])
    settleRaw = res.mpos[axisKey]
  } else {
    const N = config.cycles
    const totalSteps = 2 * N
    const feeds: number[] = Array.from({ length: totalSteps }, (_, i) =>
      config.fastFeedMmPerMin -
      (i / Math.max(1, totalSteps - 1)) * (config.fastFeedMmPerMin - config.slowFeedMmPerMin),
    )

    const opposite: '+' | '-' = direction === '+' ? '-' : '+'
    let lastRetractDist = 0

    for (let step = 0; step < totalSteps; step++) {
      if (abortCheck()) throw new Error('Probing aborted')
      const feed = Math.max(1, Math.round(feeds[step]!))
      const isApproach = step % 2 === 0

      if (isApproach) {
        const dist = step === 0 ? maxDistance : lastRetractDist * 1.15
        const res = await _sendProbeCmd(axis, direction, dist, feed)
        if (!res || !res.contact) {
          throw new Error(`No contact on ${axis}${direction} approach (step ${step + 1})`)
        }
        readings.push(res.mpos[axisKey])
        settleRaw = res.mpos[axisKey]
      } else {
        const retractDist = Math.max(0.3, Math.min(5.0, 5.0 * (feed / config.fastFeedMmPerMin)))
        lastRetractDist = retractDist
        const sign = opposite === '+' ? '' : '-'
        const cmd = `G38.5 F${feed} ${axis}${sign}${retractDist.toFixed(4)}`
        await _flush(['G91', cmd, 'G90'])
        const prb = _consumePrb()
        if (prb) {
          settleRaw = prb.mpos[axisKey]!
          if (prb.contact) readings.push(prb.mpos[axisKey]!)
        }
      }
    }
  }

  if (readings.length === 0) throw new Error(`No readings collected for ${axis}${direction} probe`)
  const { edgeMach, zeroAtSettle } = edgeZeroValues(
    readings,
    settleRaw,
    direction,
    effective,
    config.averageN,
  )
  return { edgeWpos: edgeMach - wco[axisKey], zeroAtSettle }
}

// ─── Move-then-zero helper ────────────────────────────────────────────────────

// The zeroing G10 must go in its own flush: a G0's ok arrives when it is queued,
// and the sim applies G10 L20 immediately on receipt (B1 drain divergence), so a
// batched G10 would zero at the pre-move position. _flush waits for Idle+drain.
async function _moveThenZero(moveLines: string[], zeroLines: string[]): Promise<void> {
  await _flush(moveLines)
  await _flush(zeroLines)
}

// ─── Safe travel helper ───────────────────────────────────────────────────────

async function _safeTravelTo(
  targetX: number,
  targetY: number,
  safeHeightWork: number,
  probeHeightWork: number,
): Promise<void> {
  await _flush([
    `G0 Z${safeHeightWork.toFixed(4)}`,
    `G0 X${targetX.toFixed(4)} Y${targetY.toFixed(4)}`,
    `G0 Z${probeHeightWork.toFixed(4)}`,
  ])
}

// ─── Wizard config types ─────────────────────────────────────────────────────

export interface WizardConfig {
  safeHeightMm: number
  buffer: number
  skipX: boolean
  skipY: boolean
  skipZ: boolean
  probeHeightMm?: number
  corner?: 'front-left' | 'front-right' | 'back-left' | 'back-right'
  edge?: 'top' | 'bottom' | 'left' | 'right'
  insideOffset?: number
  edgeOffset?: number
  resolution?: number
}

// ─── ProbingRunner class ─────────────────────────────────────────────────────

class ProbingRunner {
  private _aborted = false
  private _continueResolve: (() => void) | null = null

  onProbeLine(ev: { mpos: { x: number; y: number; z: number; a?: number }; contact: boolean }) {
    _pendingPrb = { mpos: ev.mpos, contact: ev.contact }
  }

  abort(): void {
    this._aborted = true
    this._continueResolve?.()
    this._continueResolve = null
    machineConnection.sendByte(0x21)
    setTimeout(() => machineConnection.sendByte(0x18), 200)
    setMode('idle')
  }

  continue(): void {
    const resolve = this._continueResolve
    this._continueResolve = null
    resolve?.()
  }

  private _checkAbort(): void {
    if (this._aborted) throw new Error('Probing aborted by user')
  }

  private _updateStep(label: string, stepIndex: number): void {
    broadcastPatch([setProbingState({ currentStepLabel: label, stepIndex })])
  }

  private async _waitForContinue(): Promise<void> {
    if (this._aborted) throw new Error('Probing aborted by user')
    await new Promise<void>((resolve) => {
      this._continueResolve = resolve
    })
    if (this._aborted) throw new Error('Probing aborted by user')
  }

  // ── Individual edge probe (Edges tab) ───────────────────────────────────────

  async probeIndividualEdge(
    axis: 'X' | 'Y' | 'Z',
    direction: '+' | '-',
    config: ProbeConfig,
    buffer: number,
    compensation: ProbeCompensation = DEFAULT_PROBE_COMPENSATION,
    noZero = false,
  ): Promise<void> {
    _assertCanProbe()
    this._aborted = false
    setMode('probing')
    broadcastPatch([setProbingState({
      phase: 'running',
      wizardKey: 'edge',
      currentStepLabel: `Probing ${axis}${direction}…`,
      stepIndex: 0,
      totalSteps: 1,
      stepResults: [],
      errorMessage: null,
    })])

    try {
      _assertMachineIdle()
      await _flush(['G90', 'G21'])
      const status = getLastMachineStatus()
      if (!status) throw new Error('No machine status available')
      const wco = status.wco

      const { edgeWpos, zeroAtSettle } = await probeEdge(axis, direction, 2 * buffer, config, compensation, wco, () => this._aborted)
      this._checkAbort()

      // Zero at the measurement site unless the caller suppresses it (e.g. the
      // probe calibration wizard, which needs all readings in the same WCS).
      if (!noZero) {
        await _flush([`G10 L20 P0 ${axis}${zeroAtSettle.toFixed(4)}`])
      }
      const backoffSign = direction === '+' ? '-' : ''
      await _flush(['G91', `G0 ${axis}${backoffSign}${EDGE_RETREAT_MM}`, 'G90'])

      // Update edge history (X/Y only): the corrected edge in machine coords, via
      // the pre-zero wco that edgeWpos refers to. Using the corrected edge (not the
      // parked mpos) makes setCenterAxis exact regardless of backoff distance and
      // per-direction deviation asymmetry.
      const axisKey = axis.toLowerCase() as 'x' | 'y' | 'z'
      const edgeMach = edgeWpos + wco[axisKey]
      const ps = getProbingState()
      if (axis === 'X') {
        const [prev1] = ps.edgeHistoryX
        broadcastPatch([setProbingState({ edgeHistoryX: [edgeMach, prev1] })])
      } else if (axis === 'Y') {
        const [prev1] = ps.edgeHistoryY
        broadcastPatch([setProbingState({ edgeHistoryY: [edgeMach, prev1] })])
      }

      broadcastPatch([setProbingState({
        phase: 'completed',
        stepResults: [{ axis, direction, edgeWpos }],
        currentStepLabel: `${axis}${direction} edge: ${edgeWpos.toFixed(3)} mm`,
      })])
    } catch (err) {
      broadcastPatch([setProbingState({
        phase: 'aborted',
        errorMessage: (err as Error).message,
      })])
    } finally {
      setMode('idle')
    }
  }

  async setCenterAxis(axis: 'X' | 'Y'): Promise<void> {
    const ps = getProbingState()
    const history = axis === 'X' ? ps.edgeHistoryX : ps.edgeHistoryY
    const [m1, m2] = history
    if (m1 === null || m2 === null) return
    const centerMach = (m1 + m2) / 2
    const status = getLastMachineStatus()
    if (!status) return
    const mposVal = axis === 'X' ? status.mpos.x : status.mpos.y
    _assertCanProbe()
    _assertMachineIdle()
    setMode('probing')
    try {
      // Zero mathematically at the current (unmoved) position rather than driving
      // there: G10 L20 sets the WCS offset so the current mpos reads as the given
      // value, which pins the offset to centerMach exactly as a move-then-zero-at-0
      // would, without a rapid traverse across the stock at probe height.
      await _flush(['G90', 'G21', `G10 L20 P0 ${axis}${(mposVal - centerMach).toFixed(4)}`])
    } finally {
      setMode('idle')
    }
  }

  // ── Wizard entry point ───────────────────────────────────────────────────────

  async startWizard(
    wizardKey: string,
    config: WizardConfig,
    probeConfig: ProbeConfig,
    compensation: ProbeCompensation = DEFAULT_PROBE_COMPENSATION,
  ): Promise<void> {
    _assertCanProbe()
    this._aborted = false
    setMode('probing')

    const safeH = config.safeHeightMm ?? 20
    const buf = config.buffer ?? 10

    // Only clear result fields that this specific wizard will produce —
    // rotation and heightmap must coexist across sequential runs.
    const runReset: Partial<Parameters<typeof setProbingState>[0]> = {
      phase: 'running',
      wizardKey,
      currentStepLabel: 'Starting…',
      stepIndex: 0,
      totalSteps: 0,
      stepResults: [],
      errorMessage: null,
    }
    if (wizardKey === 'rotation') {
      runReset.rotation = null
    } else if (wizardKey === 'heightmap') {
      runReset.heightmap = null
    } else {
      runReset.measuredCenterX = null
      runReset.measuredCenterY = null
      runReset.measuredWidth = null
      runReset.measuredHeight = null
      runReset.measuredDiameter = null
    }
    broadcastPatch([setProbingState(runReset)])

    try {
      _assertMachineIdle()
      switch (wizardKey) {
        case 'center-out':
          await this._runCenterOut(config, probeConfig, compensation, safeH, buf)
          break
        case 'center-in':
          await this._runCenterIn(config, probeConfig, compensation, safeH, buf)
          break
        case 'corner':
          await this._runCorner(config, probeConfig, compensation, safeH, buf)
          break
        case 'rotation':
          await this._runRotation(config, probeConfig, compensation, safeH, buf)
          break
        case 'heightmap':
          await this._runHeightmap(config, probeConfig, compensation, safeH, buf)
          break
        default:
          throw new Error(`Unknown wizard: ${wizardKey}`)
      }
    } catch (err) {
      broadcastPatch([setProbingState({
        phase: 'aborted',
        errorMessage: this._aborted ? null : (err as Error).message,
      })])
    } finally {
      setMode('idle')
    }
  }

  // ── Center Outside-In ────────────────────────────────────────────────────────

  private async _runCenterOut(
    config: WizardConfig,
    probeConfig: ProbeConfig,
    compensation: ProbeCompensation,
    safeH: number,
    buf: number,
  ): Promise<void> {
    await _flush(['G90', 'G21'])
    this._checkAbort()

    const status = getLastMachineStatus()
    if (!status) throw new Error('No machine status available')

    const roughCenter = { x: status.wpos.x, y: status.wpos.y }
    let wco = status.wco

    const stock = getStock()
    const stockWidth = stock?.shape === 'round' ? (stock.diameter ?? 50) : (stock?.width ?? 50)
    const stockHeight = stock?.shape === 'round' ? (stock.diameter ?? 50) : (stock?.height ?? 50)

    const stepResults: ProbingStepResult[] = []
    let stepIdx = 0
    const totalSteps = (config.skipZ ? 0 : 1) + (config.skipX ? 0 : 2) + (config.skipY ? 0 : 2)
    broadcastPatch([setProbingState({ totalSteps })])

    if (!config.skipZ) {
      this._updateStep('Probing Z surface', stepIdx++)
      const { zeroAtSettle: zZero } = await probeEdge('Z', '-', 2 * buf, probeConfig, compensation, wco, () => this._aborted)
      // Zero at the measurement site: the averaged surface becomes Z0, then retreat
      // straight up. The dwell gives the poller a beat to pick up the new WCO.
      await _flush([`G10 L20 P0 Z${zZero.toFixed(4)}`, 'G4 P0.1'])
      const s2 = getLastMachineStatus()
      if (s2) wco = s2.wco
      await _flush([`G0 Z${safeH.toFixed(4)}`])
      stepResults.push({ axis: 'Z', direction: '-', edgeWpos: 0 })
      broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
      this._checkAbort()
    }

    const probeHeight = config.probeHeightMm ?? -compensation.zMinus
    let leftEdgeWpos = 0
    let rightEdgeWpos = 0
    let bottomEdgeWpos = 0
    let topEdgeWpos = 0
    let centerX = roughCenter.x
    let centerY = roughCenter.y

    if (!config.skipX) {
      this._updateStep('Probing X- edge', stepIdx++)
      await _safeTravelTo(roughCenter.x - (stockWidth / 2 + buf), roughCenter.y, safeH, probeHeight)
      this._checkAbort()
      leftEdgeWpos = (await probeEdge('X', '+', 2 * buf, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
      // Clear the wall before raising Z — probeEdge leaves the tool touching it.
      await _flush(['G91', `G0 X-${EDGE_RETREAT_MM}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
      stepResults.push({ axis: 'X', direction: '-', edgeWpos: leftEdgeWpos })
      broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
      this._checkAbort()

      this._updateStep('Probing X+ edge', stepIdx++)
      await _safeTravelTo(roughCenter.x + (stockWidth / 2 + buf), roughCenter.y, safeH, probeHeight)
      this._checkAbort()
      rightEdgeWpos = (await probeEdge('X', '-', 2 * buf, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
      await _flush(['G91', `G0 X${EDGE_RETREAT_MM}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
      stepResults.push({ axis: 'X', direction: '+', edgeWpos: rightEdgeWpos })
      centerX = (leftEdgeWpos + rightEdgeWpos) / 2
      broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
      this._checkAbort()
    }

    if (!config.skipY) {
      this._updateStep('Probing Y- edge', stepIdx++)
      await _safeTravelTo(centerX, roughCenter.y - (stockHeight / 2 + buf), safeH, probeHeight)
      this._checkAbort()
      bottomEdgeWpos = (await probeEdge('Y', '+', 2 * buf, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
      await _flush(['G91', `G0 Y-${EDGE_RETREAT_MM}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
      stepResults.push({ axis: 'Y', direction: '-', edgeWpos: bottomEdgeWpos })
      broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
      this._checkAbort()

      this._updateStep('Probing Y+ edge', stepIdx++)
      await _safeTravelTo(centerX, roughCenter.y + (stockHeight / 2 + buf), safeH, probeHeight)
      this._checkAbort()
      topEdgeWpos = (await probeEdge('Y', '-', 2 * buf, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
      await _flush(['G91', `G0 Y${EDGE_RETREAT_MM}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
      stepResults.push({ axis: 'Y', direction: '+', edgeWpos: topEdgeWpos })
      centerY = (topEdgeWpos + bottomEdgeWpos) / 2
      broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
      this._checkAbort()
    }

    this._updateStep('Zeroing origin', stepIdx)
    if (!config.skipX && !config.skipY) {
      await _moveThenZero([`G0 X${centerX.toFixed(4)} Y${centerY.toFixed(4)}`], ['G10 L20 P0 X0 Y0'])
    } else if (!config.skipX) {
      await _moveThenZero([`G0 X${centerX.toFixed(4)}`], ['G10 L20 P0 X0'])
    } else if (!config.skipY) {
      await _moveThenZero([`G0 Y${centerY.toFixed(4)}`], ['G10 L20 P0 Y0'])
    }
    await _flush([`G0 Z${safeH.toFixed(4)}`])

    const measuredWidth = config.skipX ? null : Math.abs(rightEdgeWpos - leftEdgeWpos)
    const measuredHeight = config.skipY ? null : Math.abs(topEdgeWpos - bottomEdgeWpos)
    let measuredDiameter: number | null = null
    if (stock?.shape === 'round' && measuredWidth !== null && measuredHeight !== null) {
      measuredDiameter = (measuredWidth + measuredHeight) / 2
    }

    if (stock && (measuredWidth !== null || measuredHeight !== null || measuredDiameter !== null)) {
      setStock({
        ...stock,
        measuredWidth: measuredWidth ?? undefined,
        measuredHeight: measuredHeight ?? undefined,
        measuredDiameter: measuredDiameter ?? undefined,
      }).catch(() => {})
    }

    broadcastPatch([setProbingState({
      phase: 'completed',
      stepResults,
      measuredCenterX: 0,
      measuredCenterY: 0,
      measuredWidth,
      measuredHeight,
      measuredDiameter,
    })])
  }

  // ── Center Inside-Out ────────────────────────────────────────────────────────

  private async _runCenterIn(
    config: WizardConfig,
    probeConfig: ProbeConfig,
    compensation: ProbeCompensation,
    _safeH: number,
    buf: number,
  ): Promise<void> {
    await _flush(['G90', 'G21'])
    this._checkAbort()

    const status = getLastMachineStatus()
    if (!status) throw new Error('No machine status available')
    const wco = status.wco
    const stepResults: ProbingStepResult[] = []

    broadcastPatch([setProbingState({ totalSteps: 4 })])

    this._updateStep('Jog probe inside pocket/bore, then click Continue', 0)
    await this._waitForContinue()
    this._checkAbort()

    const status2 = getLastMachineStatus()
    if (!status2) throw new Error('No machine status after repositioning')
    const roughCenter = { x: status2.wpos.x, y: status2.wpos.y }

    this._updateStep('Probing X- wall', 0)
    // The return-to-center moves after each wall probe are the retreat off the wall.
    const leftEdgeWpos = (await probeEdge('X', '-', buf * 2, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
    await _flush([`G0 X${roughCenter.x.toFixed(4)}`])
    stepResults.push({ axis: 'X', direction: '-', edgeWpos: leftEdgeWpos })
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    this._checkAbort()

    this._updateStep('Probing X+ wall', 1)
    const rightEdgeWpos = (await probeEdge('X', '+', buf * 2, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
    const centerX = (leftEdgeWpos + rightEdgeWpos) / 2
    const measuredWidth = Math.abs(rightEdgeWpos - leftEdgeWpos)
    await _flush([`G0 X${centerX.toFixed(4)}`])
    stepResults.push({ axis: 'X', direction: '+', edgeWpos: rightEdgeWpos })
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    this._checkAbort()

    this._updateStep('Probing Y- wall', 2)
    const bottomEdgeWpos = (await probeEdge('Y', '-', buf * 2, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
    await _flush([`G0 Y${roughCenter.y.toFixed(4)}`])
    stepResults.push({ axis: 'Y', direction: '-', edgeWpos: bottomEdgeWpos })
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    this._checkAbort()

    this._updateStep('Probing Y+ wall', 3)
    const topEdgeWpos = (await probeEdge('Y', '+', buf * 2, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
    const centerY = (topEdgeWpos + bottomEdgeWpos) / 2
    const measuredHeight = Math.abs(topEdgeWpos - bottomEdgeWpos)
    stepResults.push({ axis: 'Y', direction: '+', edgeWpos: topEdgeWpos })
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    this._checkAbort()

    await _moveThenZero(
      [`G0 X${centerX.toFixed(4)} Y${centerY.toFixed(4)}`],
      ['G10 L20 P0 X0 Y0'],
    )

    broadcastPatch([setProbingState({
      phase: 'completed',
      stepResults,
      measuredCenterX: 0,
      measuredCenterY: 0,
      measuredWidth,
      measuredHeight,
    })])
  }

  // ── Corner probing ────────────────────────────────────────────────────────────

  private async _runCorner(
    config: WizardConfig,
    probeConfig: ProbeConfig,
    compensation: ProbeCompensation,
    safeH: number,
    buf: number,
  ): Promise<void> {
    await _flush(['G90', 'G21'])
    this._checkAbort()

    const corner = config.corner ?? 'front-left'
    const xDir: '+' | '-' = corner.includes('left') ? '+' : '-'
    const yDir: '+' | '-' = corner.includes('front') ? '+' : '-'

    const status = getLastMachineStatus()
    if (!status) throw new Error('No machine status available')
    let wco = status.wco
    const roughPos = { x: status.wpos.x, y: status.wpos.y }

    const stepResults: ProbingStepResult[] = []
    const totalSteps = (config.skipZ ? 0 : 1) + (config.skipX ? 0 : 1) + (config.skipY ? 0 : 1)
    let stepIdx = 0
    broadcastPatch([setProbingState({ totalSteps })])

    if (!config.skipZ) {
      this._updateStep('Probing Z surface', stepIdx++)
      const { zeroAtSettle: zZero } = await probeEdge('Z', '-', 2 * buf, probeConfig, compensation, wco, () => this._aborted)
      // Zero at the measurement site: the averaged surface becomes Z0, then retreat
      // straight up. The dwell gives the poller a beat to pick up the new WCO.
      await _flush([`G10 L20 P0 Z${zZero.toFixed(4)}`, 'G4 P0.1'])
      const s2 = getLastMachineStatus()
      if (s2) wco = s2.wco
      await _flush([`G0 Z${safeH.toFixed(4)}`])
      stepResults.push({ axis: 'Z', direction: '-', edgeWpos: 0 })
      broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
      this._checkAbort()
    }

    const probeHeight = config.probeHeightMm ?? -compensation.zMinus
    let xEdgeWpos = 0
    let yEdgeWpos = 0

    if (!config.skipX) {
      this._updateStep(`Probing X${xDir === '+' ? '-' : '+'} edge`, stepIdx++)
      await _safeTravelTo(roughPos.x, roughPos.y, safeH, probeHeight)
      this._checkAbort()
      xEdgeWpos = (await probeEdge('X', xDir, 2 * buf, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
      const retractSign = xDir === '+' ? '-' : ''
      await _flush(['G91', `G0 X${retractSign}${buf}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
      stepResults.push({ axis: 'X', direction: (xDir === '+' ? '-' : '+') as '+' | '-', edgeWpos: xEdgeWpos })
      broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
      this._checkAbort()
    }

    if (!config.skipY) {
      this._updateStep(`Probing Y${yDir === '+' ? '-' : '+'} edge`, stepIdx)
      await _safeTravelTo(roughPos.x, roughPos.y, safeH, probeHeight)
      this._checkAbort()
      yEdgeWpos = (await probeEdge('Y', yDir, 2 * buf, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
      const retractSign = yDir === '+' ? '-' : ''
      await _flush(['G91', `G0 Y${retractSign}${buf}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
      stepResults.push({ axis: 'Y', direction: (yDir === '+' ? '-' : '+') as '+' | '-', edgeWpos: yEdgeWpos })
      broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
      this._checkAbort()
    }

    if (!config.skipX && !config.skipY) {
      await _moveThenZero([`G0 X${xEdgeWpos.toFixed(4)} Y${yEdgeWpos.toFixed(4)}`], ['G10 L20 P0 X0 Y0'])
    } else if (!config.skipX) {
      await _moveThenZero([`G0 X${xEdgeWpos.toFixed(4)}`], ['G10 L20 P0 X0'])
    } else if (!config.skipY) {
      await _moveThenZero([`G0 Y${yEdgeWpos.toFixed(4)}`], ['G10 L20 P0 Y0'])
    }
    await _flush([`G0 Z${safeH.toFixed(4)}`])

    broadcastPatch([setProbingState({ phase: 'completed', stepResults })])
  }

  // ── Rotation probing ──────────────────────────────────────────────────────────

  private async _runRotation(
    config: WizardConfig,
    probeConfig: ProbeConfig,
    compensation: ProbeCompensation,
    safeH: number,
    buf: number,
  ): Promise<void> {
    await _flush(['G90', 'G21'])
    this._checkAbort()

    const edge = config.edge ?? 'top'
    const insideOffset = config.insideOffset ?? 20
    const stock = getStock()
    const measuredWidth = stock?.measuredWidth ?? stock?.width ?? 100
    const measuredHeight = stock?.measuredHeight ?? stock?.height ?? 100
    const status = getLastMachineStatus()
    if (!status) throw new Error('No machine status available')
    const wco = status.wco

    let p1: { x: number; y: number }
    let pc: { x: number; y: number }
    let p3: { x: number; y: number }
    let probeAxis: 'X' | 'Y'
    let approachDir: '+' | '-'
    let approachStartOffset: number

    if (edge === 'top') {
      p1 = { x: -(measuredWidth / 2 - insideOffset), y: measuredHeight / 2 }
      pc = { x: 0, y: measuredHeight / 2 }
      p3 = { x: measuredWidth / 2 - insideOffset, y: measuredHeight / 2 }
      probeAxis = 'Y'; approachDir = '-'; approachStartOffset = measuredHeight / 2 + buf
    } else if (edge === 'bottom') {
      p1 = { x: -(measuredWidth / 2 - insideOffset), y: -measuredHeight / 2 }
      pc = { x: 0, y: -measuredHeight / 2 }
      p3 = { x: measuredWidth / 2 - insideOffset, y: -measuredHeight / 2 }
      probeAxis = 'Y'; approachDir = '+'; approachStartOffset = -(measuredHeight / 2 + buf)
    } else if (edge === 'left') {
      p1 = { x: -measuredWidth / 2, y: -(measuredHeight / 2 - insideOffset) }
      pc = { x: -measuredWidth / 2, y: 0 }
      p3 = { x: -measuredWidth / 2, y: measuredHeight / 2 - insideOffset }
      probeAxis = 'X'; approachDir = '+'; approachStartOffset = -(measuredWidth / 2 + buf)
    } else {
      p1 = { x: measuredWidth / 2, y: -(measuredHeight / 2 - insideOffset) }
      pc = { x: measuredWidth / 2, y: 0 }
      p3 = { x: measuredWidth / 2, y: measuredHeight / 2 - insideOffset }
      probeAxis = 'X'; approachDir = '-'; approachStartOffset = measuredWidth / 2 + buf
    }

    const probeHeight = -compensation.zMinus
    const retractSign = approachDir === '+' ? '-' : ''
    broadcastPatch([setProbingState({ totalSteps: 3 })])

    this._updateStep('Probing point P1', 0)
    const startP1 = probeAxis === 'Y' ? { x: p1.x, y: approachStartOffset } : { x: approachStartOffset, y: p1.y }
    await _safeTravelTo(startP1.x, startP1.y, safeH, probeHeight)
    this._checkAbort()
    const p1Wpos = (await probeEdge(probeAxis, approachDir, 2 * buf, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
    await _flush(['G91', `G0 ${probeAxis}${retractSign}${buf}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
    this._checkAbort()

    this._updateStep('Probing center point Pc', 1)
    const startPc = probeAxis === 'Y' ? { x: pc.x, y: approachStartOffset } : { x: approachStartOffset, y: pc.y }
    await _safeTravelTo(startPc.x, startPc.y, safeH, probeHeight)
    this._checkAbort()
    const pcWpos = (await probeEdge(probeAxis, approachDir, 2 * buf, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
    await _flush(['G91', `G0 ${probeAxis}${retractSign}${buf}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
    this._checkAbort()

    this._updateStep('Probing point P3', 2)
    const startP3 = probeAxis === 'Y' ? { x: p3.x, y: approachStartOffset } : { x: approachStartOffset, y: p3.y }
    await _safeTravelTo(startP3.x, startP3.y, safeH, probeHeight)
    this._checkAbort()
    const p3Wpos = (await probeEdge(probeAxis, approachDir, 2 * buf, probeConfig, compensation, wco, () => this._aborted)).edgeWpos
    await _flush(['G91', `G0 ${probeAxis}${retractSign}${buf}`, 'G90', `G0 Z${safeH.toFixed(4)}`])

    let rotationDeg: number
    let bowMm: number

    if (probeAxis === 'Y') {
      const dxTotal = p3.x - p1.x
      const dyTotal = p3Wpos - p1Wpos
      rotationDeg = Math.atan2(dyTotal, dxTotal) * (180 / Math.PI)
      const lineLen = Math.sqrt(dxTotal * dxTotal + dyTotal * dyTotal)
      const cross = dxTotal * (pcWpos - p1Wpos) - dyTotal * (pc.x - p1.x)
      bowMm = lineLen > 0 ? cross / lineLen : 0
    } else {
      const dyTotal = p3.y - p1.y
      const dxTotal = p3Wpos - p1Wpos
      rotationDeg = Math.atan2(dxTotal, dyTotal) * (180 / Math.PI)
      const lineLen = Math.sqrt(dyTotal * dyTotal + dxTotal * dxTotal)
      const cross = dyTotal * (pcWpos - p1Wpos) - dxTotal * (pc.y - p1.y)
      bowMm = lineLen > 0 ? cross / lineLen : 0
    }

    broadcastPatch([setProbingState({
      phase: 'completed',
      rotation: { rotationDeg, bowMm, edge },
    })])
    void saveProbingResults()
  }

  // ── Surface heightmap ──────────────────────────────────────────────────────────

  private async _runHeightmap(
    config: WizardConfig,
    probeConfig: ProbeConfig,
    compensation: ProbeCompensation,
    safeH: number,
    buf: number,
  ): Promise<void> {
    await _flush(['G90', 'G21'])
    this._checkAbort()

    const status = getLastMachineStatus()
    if (!status) throw new Error('No machine status available')
    const wco = status.wco

    const stock = getStock()
    const stockWidth = stock?.shape === 'round' ? (stock.diameter ?? 100) : (stock?.width ?? 100)
    const stockHeight = stock?.shape === 'round' ? (stock.diameter ?? 100) : (stock?.height ?? 100)

    const edgeOffset = config.edgeOffset ?? 5
    const resolution = config.resolution ?? 10

    const effectiveW = stockWidth - 2 * edgeOffset
    const effectiveH = stockHeight - 2 * edgeOffset
    const colCount = Math.max(2, Math.floor(effectiveW / resolution) + 1)
    const rowCount = Math.max(2, Math.floor(effectiveH / resolution) + 1)
    const spacingX = effectiveW / (colCount - 1)
    const spacingY = effectiveH / (rowCount - 1)
    const originX = -effectiveW / 2
    const originY = -effectiveH / 2

    const totalPoints = colCount * rowCount
    const values: (number | null)[] = new Array(totalPoints).fill(null)
    const heightmap: HeightmapResult = { colCount, rowCount, spacingX, spacingY, originX, originY, values }
    broadcastPatch([setProbingState({ totalSteps: totalPoints, heightmap: { ...heightmap, values: [...values] } })])

    let probeSeq = 0
    for (let r = 0; r < rowCount; r++) {
      const targetY = originY + r * spacingY
      for (let ci = 0; ci < colCount; ci++) {
        const col = r % 2 === 0 ? ci : (colCount - 1 - ci)
        const targetX = originX + col * spacingX
        const idx = r * colCount + col

        this._checkAbort()
        this._updateStep(`Probing point ${probeSeq + 1} / ${totalPoints}`, probeSeq)
        probeSeq++

        await _flush([
          `G0 Z${safeH.toFixed(4)}`,
          `G0 X${targetX.toFixed(4)} Y${targetY.toFixed(4)}`,
          `G0 Z${buf.toFixed(4)}`,
        ])
        this._checkAbort()

        try {
          const { edgeWpos } = await probeEdge('Z', '-', 2 * buf, probeConfig, compensation, wco, () => this._aborted)
          values[idx] = edgeWpos
        } catch (err) {
          if (this._aborted) throw err
          values[idx] = null
        }
        broadcastPatch([setProbingState({ heightmap: { ...heightmap, values: [...values] } })])
        await _flush([`G0 Z${safeH.toFixed(4)}`])
      }
    }

    broadcastPatch([setProbingState({
      phase: 'completed',
      heightmap: { ...heightmap, values: [...values] },
    })])
    void saveProbingResults()
  }
}

export const probingRunner = new ProbingRunner()
