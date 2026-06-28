import { word, stripComments, dist3, rToIJ, arcLength } from './utils'
import type { GCodeLine, GCodeLineType, LineVector, GCodeModalState, ToolSection, AxisRanges } from './types'

const DEFAULT_MAX_RAPID_MM_PER_MIN = 3000

export interface AnalysisResult {
  lines: GCodeLine[]
  vectors: Array<LineVector | null>
  modalStates: GCodeModalState[]
  tools: ToolSection[]
  axisRanges: AxisRanges
  estimatedTotalMs: number
}

function resolvePos(
  clean: string,
  state: GCodeModalState,
): { tx: number; ty: number; tz: number } {
  const xw = word(clean, 'X')
  const yw = word(clean, 'Y')
  const zw = word(clean, 'Z')
  if (state.positionMode === 'G91') {
    return {
      tx: state.position.x + (xw ?? 0),
      ty: state.position.y + (yw ?? 0),
      tz: state.position.z + (zw ?? 0),
    }
  }
  return {
    tx: xw ?? state.position.x,
    ty: yw ?? state.position.y,
    tz: zw ?? state.position.z,
  }
}

function clampRanges(axisRanges: AxisRanges): void {
  if (!isFinite(axisRanges.x.min)) axisRanges.x = { min: 0, max: 0 }
  if (!isFinite(axisRanges.y.min)) axisRanges.y = { min: 0, max: 0 }
  if (!isFinite(axisRanges.z.min)) axisRanges.z = { min: 0, max: 0 }
}

/**
 * Single-pass GCode analysis. Produces all outputs needed by the job runner,
 * 3D viewport, and crash-recovery simulator in one O(N) traversal.
 */
export function analyzeGCode(
  content: string,
  maxRapidMmPerMin = DEFAULT_MAX_RAPID_MM_PER_MIN,
): AnalysisResult {
  const rawLines = content.split(/\r?\n/)

  const state: GCodeModalState = {
    position: { x: 0, y: 0, z: 0 },
    positionMode: 'G90',
    workCoordinate: 'G54',
    feedRate: 0,
    spindleSpeed: 0,
    spindleMode: 'M5',
    coolant: 'off',
    units: 'G21',
    plane: 'G17',
    toolNumber: 0,
  }

  const axisRanges: AxisRanges = {
    x: { min: Infinity, max: -Infinity },
    y: { min: Infinity, max: -Infinity },
    z: { min: Infinity, max: -Infinity },
  }

  const tools: ToolSection[] = [
    { toolNumber: 0, toolChangeCmd: null, startLine: 0, endLine: rawLines.length - 1 },
  ]
  let pendingTool = 0
  let sIdx = 0

  let cumulativeMs = 0
  const lines: GCodeLine[] = []
  const vectors: Array<LineVector | null> = []
  const modalStates: GCodeModalState[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]!
    const clean = stripComments(raw).toUpperCase()

    if (!clean) {
      lines.push({ index: i, raw, type: 'comment', isMotion: false, estimatedDurationMs: 0, cumulativeDurationMs: cumulativeMs })
      vectors.push(null)
      modalStates.push(structuredClone(state))
      continue
    }

    const toMm = state.units === 'G20' ? 25.4 : 1

    // ── Modal state updates (applied before classification) ──────────────────

    const fWord = word(clean, 'F')
    if (fWord !== undefined) state.feedRate = fWord

    if (/\bG20\b/.test(clean)) state.units = 'G20'
    if (/\bG21\b/.test(clean)) state.units = 'G21'

    if (/\bG90\b/.test(clean)) state.positionMode = 'G90'
    if (/\bG91\b/.test(clean)) state.positionMode = 'G91'

    if (/\bG54\b/.test(clean)) state.workCoordinate = 'G54'
    if (/\bG55\b/.test(clean)) state.workCoordinate = 'G55'
    if (/\bG56\b/.test(clean)) state.workCoordinate = 'G56'
    if (/\bG57\b/.test(clean)) state.workCoordinate = 'G57'
    if (/\bG58\b/.test(clean)) state.workCoordinate = 'G58'
    if (/\bG59\b/.test(clean)) state.workCoordinate = 'G59'

    if (/\bG17\b/.test(clean)) state.plane = 'G17'
    if (/\bG18\b/.test(clean)) state.plane = 'G18'
    if (/\bG19\b/.test(clean)) state.plane = 'G19'

    const sWord = word(clean, 'S')
    if (sWord !== undefined) state.spindleSpeed = sWord

    if (/\bM0?3\b/.test(clean)) state.spindleMode = 'M3'
    if (/\bM0?4\b/.test(clean)) state.spindleMode = 'M4'
    if (/\bM0?5\b/.test(clean)) state.spindleMode = 'M5'

    if (/\bM0?7\b/.test(clean)) state.coolant = 'M7'
    if (/\bM0?8\b/.test(clean)) state.coolant = 'M8'
    if (/\bM0?9\b/.test(clean)) state.coolant = 'off'

    const tWord = word(clean, 'T')
    if (tWord !== undefined) {
      pendingTool = tWord
      state.toolNumber = tWord
    }

    if (/\bM0?6\b/.test(clean)) {
      state.toolNumber = pendingTool
      tools[tools.length - 1].endLine = i > 0 ? i - 1 : 0
      sIdx = tools.length
      tools.push({ toolNumber: pendingTool, toolChangeCmd: raw.trim(), startLine: i, endLine: rawLines.length - 1 })
    }

    // ── Line classification + geometry ───────────────────────────────────────

    let type: GCodeLineType = 'modal'
    let durationMs = 0
    let vec: LineVector | null = null

    if (/\bG0\b/.test(clean) || /\bG00\b/.test(clean)) {
      const { tx, ty, tz } = resolvePos(clean, state)
      const d = dist3(state.position.x, state.position.y, state.position.z, tx, ty, tz) * toMm
      durationMs = (d / maxRapidMmPerMin) * 60_000
      axisRanges.x.min = Math.min(axisRanges.x.min, tx); axisRanges.x.max = Math.max(axisRanges.x.max, tx)
      axisRanges.y.min = Math.min(axisRanges.y.min, ty); axisRanges.y.max = Math.max(axisRanges.y.max, ty)
      axisRanges.z.min = Math.min(axisRanges.z.min, tz); axisRanges.z.max = Math.max(axisRanges.z.max, tz)
      if (tx !== state.position.x || ty !== state.position.y || tz !== state.position.z)
        vec = { t: 'R', x0: state.position.x, y0: state.position.y, z0: state.position.z, x1: tx, y1: ty, z1: tz, s: sIdx }
      state.position = { x: tx, y: ty, z: tz }
      type = 'rapid'
    }
    else if (/\bG1\b/.test(clean) || /\bG01\b/.test(clean)) {
      const { tx, ty, tz } = resolvePos(clean, state)
      const feedMmPerMin = state.feedRate * toMm
      if (feedMmPerMin > 0) {
        const d = dist3(state.position.x, state.position.y, state.position.z, tx, ty, tz) * toMm
        durationMs = (d / feedMmPerMin) * 60_000
      }
      axisRanges.x.min = Math.min(axisRanges.x.min, tx); axisRanges.x.max = Math.max(axisRanges.x.max, tx)
      axisRanges.y.min = Math.min(axisRanges.y.min, ty); axisRanges.y.max = Math.max(axisRanges.y.max, ty)
      axisRanges.z.min = Math.min(axisRanges.z.min, tz); axisRanges.z.max = Math.max(axisRanges.z.max, tz)
      if (tx !== state.position.x || ty !== state.position.y || tz !== state.position.z)
        vec = { t: 'F', x0: state.position.x, y0: state.position.y, z0: state.position.z, x1: tx, y1: ty, z1: tz, s: sIdx }
      state.position = { x: tx, y: ty, z: tz }
      type = 'feed'
    }
    else if (/\bG0?[23]\b/.test(clean)) {
      const cw = /\bG0?2\b/.test(clean)
      const { tx, ty, tz } = resolvePos(clean, state)
      const iw = word(clean, 'I')
      const jw = word(clean, 'J')
      const rw = word(clean, 'R')
      const arcIJ = rw !== undefined && iw === undefined && jw === undefined
        ? rToIJ(state.position.x, state.position.y, tx, ty, rw, !cw)
        : { i: iw ?? 0, j: jw ?? 0 }
      const len = arcLength(state.position.x, state.position.y, tx, ty, arcIJ.i, arcIJ.j, undefined, cw) * toMm
      const totalLen = Math.sqrt(len * len + ((tz - state.position.z) * toMm) ** 2)
      const feedMmPerMin = state.feedRate * toMm
      if (feedMmPerMin > 0) durationMs = (totalLen / feedMmPerMin) * 60_000
      if (durationMs === 0) durationMs = 1
      axisRanges.x.min = Math.min(axisRanges.x.min, tx); axisRanges.x.max = Math.max(axisRanges.x.max, tx)
      axisRanges.y.min = Math.min(axisRanges.y.min, ty); axisRanges.y.max = Math.max(axisRanges.y.max, ty)
      axisRanges.z.min = Math.min(axisRanges.z.min, tz); axisRanges.z.max = Math.max(axisRanges.z.max, tz)
      vec = { t: 'A', x0: state.position.x, y0: state.position.y, z0: state.position.z, x1: tx, y1: ty, z1: tz, i: arcIJ.i, j: arcIJ.j, cw, s: sIdx }
      state.position = { x: tx, y: ty, z: tz }
      type = 'arc'
    }
    else if (/\bG0?4\b/.test(clean)) {
      const pSec = word(clean, 'P')
      durationMs = pSec !== undefined ? pSec * 1000 : 0
      type = 'dwell'
    }
    // G28/G30 — move to stored position; target unknown so duration = 0
    else if (/\bG28\b/.test(clean) || /\bG30\b/.test(clean)) {
      type = 'rapid'
    }
    // G38.x probe — interpreter-blocking (drains planner, ok arrives after probe completes)
    else if (/\bG38\.[2-5]\b/.test(clean)) {
      type = 'probe'
    }
    else if (/\bG[78]\d\b/.test(clean)) {
      type = 'unsupported'
      console.warn(`[analysis] Canned cycle on line ${i + 1}: "${raw.trim()}" — duration estimated as 0`)
    }
    else if (/\bM0?[345]\b/.test(clean)) {
      type = 'spindle'
    }
    else if (/\bM0?[789]\b/.test(clean)) {
      type = 'coolant'
    }
    else if (/\bM0?6\b/.test(clean) || /\bT\d/.test(clean)) {
      type = 'tool'
    }
    else if (/\bG5[4-9]\b/.test(clean) || /\bG10\b/.test(clean) || /\bG92\b/.test(clean)) {
      type = 'coord'
    }

    if (durationMs === 0) durationMs = 1

    // G4 dwell and G38.x probe are interpreter-blocking (Category B2) — no planner slot
    const isMotion = type === 'rapid' || type === 'feed' || type === 'arc'

    cumulativeMs += durationMs
    lines.push({ index: i, raw, type, isMotion, estimatedDurationMs: durationMs, cumulativeDurationMs: cumulativeMs })
    vectors.push(vec)
    modalStates.push(structuredClone(state))
  }

  clampRanges(axisRanges)

  return { lines, vectors, modalStates, tools, axisRanges, estimatedTotalMs: cumulativeMs }
}
