import { broadcastPatch, setProbingState, setStock, getStock, saveProbingResults } from '../appState'
import { getLastMachineStatus } from '../machine/poller'
import { probeEdge, _flush, _safeTravelTo, _moveThenZero, EDGE_RETREAT_MM, type WizardConfig } from './probingRunner'
import type { ProbeConfig, ProbeCompensation } from '../tool/types'
import type { ProbingStepResult, HeightmapResult } from '../appState'

/** Narrow view of ProbingRunner's abort/step-reporting state — each wizard strategy
 *  only needs to observe/report through this, not the runner's full public surface. */
export interface WizardRunContext {
  checkAbort: () => void
  isAborted: () => boolean
  updateStep: (label: string, stepIndex: number) => void
  waitForContinue: () => Promise<void>
}

// ── Center Outside-In ────────────────────────────────────────────────────────

export async function runCenterOut(
  ctx: WizardRunContext,
  config: WizardConfig,
  probeConfig: ProbeConfig,
  compensation: ProbeCompensation,
  safeH: number,
  buf: number,
): Promise<void> {
  await _flush(['G90', 'G21'])
  ctx.checkAbort()

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
    ctx.updateStep('Probing Z surface', stepIdx++)
    const { zeroAtSettle: zZero } = await probeEdge('Z', '-', 2 * buf, probeConfig, compensation, wco, ctx.isAborted)
    // Zero at the measurement site: the averaged surface becomes Z0, then retreat
    // straight up. The dwell gives the poller a beat to pick up the new WCO.
    await _flush([`G10 L20 P0 Z${zZero.toFixed(4)}`, 'G4 P0.1'])
    const s2 = getLastMachineStatus()
    if (s2) wco = s2.wco
    await _flush([`G0 Z${safeH.toFixed(4)}`])
    stepResults.push({ axis: 'Z', direction: '-', edgeWpos: 0 })
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    ctx.checkAbort()
  }

  const probeHeight = config.probeHeightMm ?? -compensation.zMinus
  let leftEdgeWpos = 0
  let rightEdgeWpos = 0
  let bottomEdgeWpos = 0
  let topEdgeWpos = 0
  let centerX = roughCenter.x
  let centerY = roughCenter.y

  if (!config.skipX) {
    ctx.updateStep('Probing X- edge', stepIdx++)
    await _safeTravelTo(roughCenter.x - (stockWidth / 2 + buf), roughCenter.y, safeH, probeHeight)
    ctx.checkAbort()
    leftEdgeWpos = (await probeEdge('X', '+', 2 * buf, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
    // Clear the wall before raising Z — probeEdge leaves the tool touching it.
    await _flush(['G91', `G0 X-${EDGE_RETREAT_MM}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
    stepResults.push({ axis: 'X', direction: '-', edgeWpos: leftEdgeWpos })
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    ctx.checkAbort()

    ctx.updateStep('Probing X+ edge', stepIdx++)
    await _safeTravelTo(roughCenter.x + (stockWidth / 2 + buf), roughCenter.y, safeH, probeHeight)
    ctx.checkAbort()
    rightEdgeWpos = (await probeEdge('X', '-', 2 * buf, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
    await _flush(['G91', `G0 X${EDGE_RETREAT_MM}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
    stepResults.push({ axis: 'X', direction: '+', edgeWpos: rightEdgeWpos })
    centerX = (leftEdgeWpos + rightEdgeWpos) / 2
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    ctx.checkAbort()
  }

  if (!config.skipY) {
    ctx.updateStep('Probing Y- edge', stepIdx++)
    await _safeTravelTo(centerX, roughCenter.y - (stockHeight / 2 + buf), safeH, probeHeight)
    ctx.checkAbort()
    bottomEdgeWpos = (await probeEdge('Y', '+', 2 * buf, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
    await _flush(['G91', `G0 Y-${EDGE_RETREAT_MM}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
    stepResults.push({ axis: 'Y', direction: '-', edgeWpos: bottomEdgeWpos })
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    ctx.checkAbort()

    ctx.updateStep('Probing Y+ edge', stepIdx++)
    await _safeTravelTo(centerX, roughCenter.y + (stockHeight / 2 + buf), safeH, probeHeight)
    ctx.checkAbort()
    topEdgeWpos = (await probeEdge('Y', '-', 2 * buf, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
    await _flush(['G91', `G0 Y${EDGE_RETREAT_MM}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
    stepResults.push({ axis: 'Y', direction: '+', edgeWpos: topEdgeWpos })
    centerY = (topEdgeWpos + bottomEdgeWpos) / 2
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    ctx.checkAbort()
  }

  ctx.updateStep('Zeroing origin', stepIdx)
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

export async function runCenterIn(
  ctx: WizardRunContext,
  _config: WizardConfig,
  probeConfig: ProbeConfig,
  compensation: ProbeCompensation,
  _safeH: number,
  buf: number,
): Promise<void> {
  await _flush(['G90', 'G21'])
  ctx.checkAbort()

  const status = getLastMachineStatus()
  if (!status) throw new Error('No machine status available')
  const wco = status.wco
  const stepResults: ProbingStepResult[] = []

  broadcastPatch([setProbingState({ totalSteps: 4 })])

  ctx.updateStep('Jog probe inside pocket/bore, then click Continue', 0)
  await ctx.waitForContinue()
  ctx.checkAbort()

  const status2 = getLastMachineStatus()
  if (!status2) throw new Error('No machine status after repositioning')
  const roughCenter = { x: status2.wpos.x, y: status2.wpos.y }

  ctx.updateStep('Probing X- wall', 0)
  // The return-to-center moves after each wall probe are the retreat off the wall.
  const leftEdgeWpos = (await probeEdge('X', '-', buf * 2, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
  await _flush([`G0 X${roughCenter.x.toFixed(4)}`])
  stepResults.push({ axis: 'X', direction: '-', edgeWpos: leftEdgeWpos })
  broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
  ctx.checkAbort()

  ctx.updateStep('Probing X+ wall', 1)
  const rightEdgeWpos = (await probeEdge('X', '+', buf * 2, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
  const centerX = (leftEdgeWpos + rightEdgeWpos) / 2
  const measuredWidth = Math.abs(rightEdgeWpos - leftEdgeWpos)
  await _flush([`G0 X${centerX.toFixed(4)}`])
  stepResults.push({ axis: 'X', direction: '+', edgeWpos: rightEdgeWpos })
  broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
  ctx.checkAbort()

  ctx.updateStep('Probing Y- wall', 2)
  const bottomEdgeWpos = (await probeEdge('Y', '-', buf * 2, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
  await _flush([`G0 Y${roughCenter.y.toFixed(4)}`])
  stepResults.push({ axis: 'Y', direction: '-', edgeWpos: bottomEdgeWpos })
  broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
  ctx.checkAbort()

  ctx.updateStep('Probing Y+ wall', 3)
  const topEdgeWpos = (await probeEdge('Y', '+', buf * 2, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
  const centerY = (topEdgeWpos + bottomEdgeWpos) / 2
  const measuredHeight = Math.abs(topEdgeWpos - bottomEdgeWpos)
  stepResults.push({ axis: 'Y', direction: '+', edgeWpos: topEdgeWpos })
  broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
  ctx.checkAbort()

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

export async function runCorner(
  ctx: WizardRunContext,
  config: WizardConfig,
  probeConfig: ProbeConfig,
  compensation: ProbeCompensation,
  safeH: number,
  buf: number,
): Promise<void> {
  await _flush(['G90', 'G21'])
  ctx.checkAbort()

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
    ctx.updateStep('Probing Z surface', stepIdx++)
    const { zeroAtSettle: zZero } = await probeEdge('Z', '-', 2 * buf, probeConfig, compensation, wco, ctx.isAborted)
    // Zero at the measurement site: the averaged surface becomes Z0, then retreat
    // straight up. The dwell gives the poller a beat to pick up the new WCO.
    await _flush([`G10 L20 P0 Z${zZero.toFixed(4)}`, 'G4 P0.1'])
    const s2 = getLastMachineStatus()
    if (s2) wco = s2.wco
    await _flush([`G0 Z${safeH.toFixed(4)}`])
    stepResults.push({ axis: 'Z', direction: '-', edgeWpos: 0 })
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    ctx.checkAbort()
  }

  const probeHeight = config.probeHeightMm ?? -compensation.zMinus
  let xEdgeWpos = 0
  let yEdgeWpos = 0

  if (!config.skipX) {
    ctx.updateStep(`Probing X${xDir === '+' ? '-' : '+'} edge`, stepIdx++)
    await _safeTravelTo(roughPos.x, roughPos.y, safeH, probeHeight)
    ctx.checkAbort()
    xEdgeWpos = (await probeEdge('X', xDir, 2 * buf, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
    const retractSign = xDir === '+' ? '-' : ''
    await _flush(['G91', `G0 X${retractSign}${buf}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
    stepResults.push({ axis: 'X', direction: (xDir === '+' ? '-' : '+') as '+' | '-', edgeWpos: xEdgeWpos })
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    ctx.checkAbort()
  }

  if (!config.skipY) {
    ctx.updateStep(`Probing Y${yDir === '+' ? '-' : '+'} edge`, stepIdx)
    await _safeTravelTo(roughPos.x, roughPos.y, safeH, probeHeight)
    ctx.checkAbort()
    yEdgeWpos = (await probeEdge('Y', yDir, 2 * buf, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
    const retractSign = yDir === '+' ? '-' : ''
    await _flush(['G91', `G0 Y${retractSign}${buf}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
    stepResults.push({ axis: 'Y', direction: (yDir === '+' ? '-' : '+') as '+' | '-', edgeWpos: yEdgeWpos })
    broadcastPatch([setProbingState({ stepResults: [...stepResults] })])
    ctx.checkAbort()
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

export async function runRotation(
  ctx: WizardRunContext,
  config: WizardConfig,
  probeConfig: ProbeConfig,
  compensation: ProbeCompensation,
  safeH: number,
  buf: number,
): Promise<void> {
  await _flush(['G90', 'G21'])
  ctx.checkAbort()

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

  ctx.updateStep('Probing point P1', 0)
  const startP1 = probeAxis === 'Y' ? { x: p1.x, y: approachStartOffset } : { x: approachStartOffset, y: p1.y }
  await _safeTravelTo(startP1.x, startP1.y, safeH, probeHeight)
  ctx.checkAbort()
  const p1Wpos = (await probeEdge(probeAxis, approachDir, 2 * buf, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
  await _flush(['G91', `G0 ${probeAxis}${retractSign}${buf}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
  ctx.checkAbort()

  ctx.updateStep('Probing center point Pc', 1)
  const startPc = probeAxis === 'Y' ? { x: pc.x, y: approachStartOffset } : { x: approachStartOffset, y: pc.y }
  await _safeTravelTo(startPc.x, startPc.y, safeH, probeHeight)
  ctx.checkAbort()
  const pcWpos = (await probeEdge(probeAxis, approachDir, 2 * buf, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
  await _flush(['G91', `G0 ${probeAxis}${retractSign}${buf}`, 'G90', `G0 Z${safeH.toFixed(4)}`])
  ctx.checkAbort()

  ctx.updateStep('Probing point P3', 2)
  const startP3 = probeAxis === 'Y' ? { x: p3.x, y: approachStartOffset } : { x: approachStartOffset, y: p3.y }
  await _safeTravelTo(startP3.x, startP3.y, safeH, probeHeight)
  ctx.checkAbort()
  const p3Wpos = (await probeEdge(probeAxis, approachDir, 2 * buf, probeConfig, compensation, wco, ctx.isAborted)).edgeWpos
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

export async function runHeightmap(
  ctx: WizardRunContext,
  config: WizardConfig,
  probeConfig: ProbeConfig,
  compensation: ProbeCompensation,
  safeH: number,
  buf: number,
): Promise<void> {
  await _flush(['G90', 'G21'])
  ctx.checkAbort()

  const status = getLastMachineStatus()
  if (!status) throw new Error('No machine status available')
  const wco = status.wco

  const stock = getStock()
  const stockWidth = stock?.shape === 'round' ? (stock.diameter ?? 100) : (stock?.width ?? 100)
  const stockHeight = stock?.shape === 'round' ? (stock.diameter ?? 100) : (stock?.height ?? 100)

  const edgeOffset = Math.max(0, config.edgeOffset ?? 5)
  const resolution = Math.max(1, config.resolution ?? 10)

  const effectiveW = stockWidth - 2 * edgeOffset
  const effectiveH = stockHeight - 2 * edgeOffset
  if (effectiveW <= 0 || effectiveH <= 0) {
    throw new Error('Edge offset leaves no probing area within the stock')
  }
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

      ctx.checkAbort()
      ctx.updateStep(`Probing point ${probeSeq + 1} / ${totalPoints}`, probeSeq)
      probeSeq++

      await _flush([
        `G0 Z${safeH.toFixed(4)}`,
        `G0 X${targetX.toFixed(4)} Y${targetY.toFixed(4)}`,
        `G0 Z${buf.toFixed(4)}`,
      ])
      ctx.checkAbort()

      try {
        const { edgeWpos } = await probeEdge('Z', '-', 2 * buf, probeConfig, compensation, wco, ctx.isAborted)
        values[idx] = edgeWpos
      } catch (err) {
        if (ctx.isAborted()) throw err
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
