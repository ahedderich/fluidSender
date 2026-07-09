import { broadcastPatch, getProbingState, setProbingState } from '../appState'
import { getLastMachineStatus } from '../machine/poller'
import { sendGCode } from '../machine/sender'
import { getMode, setMode } from '../machine/machineMode'
import { machineConnection } from '../machine/connection'
import type { ConnectionEvent } from '../machine/connection'
import type { ProbeConfig, ProbeCompensation } from '../tool/types'
import { DEFAULT_PROBE_COMPENSATION } from '../tool/types'
import { runCenterOut, runCenterIn, runCorner, runRotation, runHeightmap, type WizardRunContext } from './probingWizards'

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

export async function _flush(lines: string[]): Promise<void> {
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
export const EDGE_RETREAT_MM = 5

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
export async function _moveThenZero(moveLines: string[], zeroLines: string[]): Promise<void> {
  await _flush(moveLines)
  await _flush(zeroLines)
}

// ─── Safe travel helper ───────────────────────────────────────────────────────

export async function _safeTravelTo(
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

  /** View onto this runner's abort/step-reporting state, handed to each wizard
   *  strategy function so they don't need the runner's full public surface. */
  private _wizardContext(): WizardRunContext {
    return {
      checkAbort: () => this._checkAbort(),
      isAborted: () => this._aborted,
      updateStep: (label, stepIndex) => this._updateStep(label, stepIndex),
      waitForContinue: () => this._waitForContinue(),
    }
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
      const ctx = this._wizardContext()
      switch (wizardKey) {
        case 'center-out':
          await runCenterOut(ctx, config, probeConfig, compensation, safeH, buf)
          break
        case 'center-in':
          await runCenterIn(ctx, config, probeConfig, compensation, safeH, buf)
          break
        case 'corner':
          await runCorner(ctx, config, probeConfig, compensation, safeH, buf)
          break
        case 'rotation':
          await runRotation(ctx, config, probeConfig, compensation, safeH, buf)
          break
        case 'heightmap':
          await runHeightmap(ctx, config, probeConfig, compensation, safeH, buf)
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
}

export const probingRunner = new ProbingRunner()
