import { word, stripComments, dist3, rToIJ, arcLength } from './utils'
import { classifyLine, getActiveFirmwareVersion } from './classifier'
import { detectGenerator, extractGeneratorInfo } from './generator'
import type { GcodeGeneratorId, GeneratorExtraInfo } from './generator'
import type { GCodeLine, GCodeLineType, LineVector, GCodeModalState, ModalStateCheckpoint, ToolSection, AxisRanges } from './types'
import { DEFAULT_MACHINE_KINEMATICS, computeKinematicDurations, limitAccelByAxisMaximum, nominalSpeedForSegment } from './kinematics'
import type { MachineKinematics, KinematicSegment } from './kinematics'

type Vec3 = readonly [number, number, number]

// Default granularity used when serializing modal-states.json for a full job analysis
// (see analyzer.ts). analyzeGCode() itself defaults to interval=1 (dense) so existing
// small-scale callers (simulateToLine, tests) are unaffected unless they opt in.
export const MODAL_CHECKPOINT_INTERVAL = 50

const MANUAL_TOOL_CHANGE_RE = /^\(MANUAL TOOL CHANGE TO T(\d+)\)/i

export interface AnalysisResult {
  lines: GCodeLine[]
  vectors: Array<LineVector | null>
  modalStates: ModalStateCheckpoint[]
  tools: ToolSection[]
  axisRanges: AxisRanges
  estimatedTotalMs: number
  noToolDefinitions: boolean
  generator: GcodeGeneratorId
  generatorInfo: GeneratorExtraInfo
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

// Manual clone avoids structuredClone's much heavier structured-clone-algorithm
// overhead for this flat, plain-data shape — measured at ~35% of total analyzeGCode
// time on a 668k-line file since it runs once per source line.
function cloneModalState(state: GCodeModalState): GCodeModalState {
  return {
    position: { x: state.position.x, y: state.position.y, z: state.position.z },
    positionMode: state.positionMode,
    workCoordinate: state.workCoordinate,
    feedRate: state.feedRate,
    spindleSpeed: state.spindleSpeed,
    spindleMode: state.spindleMode,
    coolant: state.coolant,
    units: state.units,
    plane: state.plane,
    motionMode: state.motionMode,
    toolNumber: state.toolNumber,
  }
}

function clampRanges(axisRanges: AxisRanges): void {
  if (!isFinite(axisRanges.x.min)) axisRanges.x = { min: 0, max: 0 }
  if (!isFinite(axisRanges.y.min)) axisRanges.y = { min: 0, max: 0 }
  if (!isFinite(axisRanges.z.min)) axisRanges.z = { min: 0, max: 0 }
}

function normalize3(v: Vec3): Vec3 {
  const m = Math.hypot(v[0], v[1], v[2])
  return m > 1e-9 ? [v[0] / m, v[1] / m, v[2] / m] : [0, 0, 0]
}

/** Unit tangent direction (in-plane) at point (px,py) on a circle centered at (cx,cy). */
function inPlaneTangentUnit(cx: number, cy: number, px: number, py: number, cw: boolean): [number, number] {
  const rx = px - cx
  const ry = py - cy
  const rmag = Math.hypot(rx, ry)
  if (rmag < 1e-9) return [0, 0]
  const ux = rx / rmag
  const uy = ry / rmag
  // CCW tangent = radius unit vector rotated +90°: (-uy, ux). CW = rotated -90°: (uy, -ux).
  return cw ? [uy, -ux] : [-uy, ux]
}

/**
 * True start/end tangent unit vectors for an arc, approximated as a single kinematic
 * segment (see kinematics.ts doc comment — no internal subdivision). For a helical arc,
 * the ratio of the helical axis's contribution to the in-plane tangential contribution is
 * constant along the whole arc (both are linear in the sweep angle), and equals
 * helicalDelta / arcLen — so both endpoints share the same third-axis ratio and differ
 * only in their in-plane heading.
 */
function arcTangents(
  planeCx: number, planeCy: number,
  startA: number, startB: number, endA: number, endB: number,
  cwLocal: boolean, arcLen: number, helicalDelta: number,
  build: (a: number, b: number, helical: number) => Vec3,
): { dirIn: Vec3; dirOut: Vec3 } {
  const helicalRatio = arcLen > 1e-9 ? helicalDelta / arcLen : 0
  const [a0, b0] = inPlaneTangentUnit(planeCx, planeCy, startA, startB, cwLocal)
  const [a1, b1] = inPlaneTangentUnit(planeCx, planeCy, endA, endB, cwLocal)
  return {
    dirIn: normalize3(build(a0, b0, helicalRatio)),
    dirOut: normalize3(build(a1, b1, helicalRatio)),
  }
}

/**
 * GCode analysis. Produces all outputs needed by the job runner, 3D viewport, and
 * crash-recovery simulator. Geometry, classification, tool sections and modal states
 * are all built in one O(N) forward traversal, same as before. Duration estimation is
 * a second phase: the forward pass collects a KinematicSegment per motion line, then
 * (when estimateDurations) computeKinematicDurations() reverse+forward-solves realistic
 * accel/junction-deviation-aware times over the whole file, and a final O(N) pass
 * writes them onto each line — this can't be done in a single forward pass because a
 * segment's duration depends on the segments both before and after it.
 *
 * initialState seeds the starting modal state instead of the machine defaults —
 * used by getModalStateAtLine() to replay forward from a checkpoint over just the
 * handful of lines between it and a target line, instead of re-analysing whole file.
 * modalCheckpointInterval controls how often a modal-state snapshot is recorded
 * (default 1 = every line, dense — required by simulateToLine()'s positional lookup
 * and existing tests); analyzeGCodeFile() passes MODAL_CHECKPOINT_INTERVAL for the
 * real on-disk artefact, since a dense snapshot-per-line is unnecessary and expensive
 * at file scale (149MB for a 668k-line file) when only sparse point lookups are ever
 * needed from it.
 * estimateDurations defaults to true; callers that only need modalStates (simulator.ts)
 * pass false to skip building segments and the duration solve entirely.
 */
export function analyzeGCode(
  content: string,
  kinematics: MachineKinematics = DEFAULT_MACHINE_KINEMATICS,
  onProgress?: (pct: number) => void,
  initialState?: GCodeModalState,
  modalCheckpointInterval = 1,
  estimateDurations = true,
): AnalysisResult {
  const rawLines = content.split(/\r?\n/)

  const state: GCodeModalState = initialState ? cloneModalState(initialState) : {
    position: { x: 0, y: 0, z: 0 },
    positionMode: 'G90',
    workCoordinate: 'G54',
    feedRate: 0,
    spindleSpeed: 0,
    spindleMode: 'M5',
    coolant: 'off',
    units: 'G21',
    plane: 'G17',
    motionMode: 'G0',
    toolNumber: 0,
  }

  const axisRanges: AxisRanges = {
    x: { min: Infinity, max: -Infinity },
    y: { min: Infinity, max: -Infinity },
    z: { min: Infinity, max: -Infinity },
  }

  const tools: ToolSection[] = [
    {
      toolNumber: 0,
      toolChangeCmd: null,
      toolChangeType: null,
      startLine: 0,
      endLine: rawLines.length - 1,
      lineCount: rawLines.length,
    },
  ]
  let pendingTool = 0
  let firstToolKnown = false
  let sIdx = 0

  const generator = detectGenerator(rawLines)
  const generatorInfo = extractGeneratorInfo(generator, rawLines)

  let cumulativeMs = 0
  const lines: GCodeLine[] = []
  const vectors: Array<LineVector | null> = []
  const modalStates: ModalStateCheckpoint[] = []
  const lastLineIdx = Math.max(1, rawLines.length - 1)
  let lastReportedPct = -1

  // Kinematic duration modelling (see doc comment above). A run starts from rest
  // (Planner.cpp:364-368), same as the very first segment of the file.
  const kinematicSegments: KinematicSegment[] = []
  const segmentLineIndices: number[] = []
  let pendingHardStop = true

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]!
    const clean = stripComments(raw).toUpperCase()

    if (!clean) {
      lines.push({ index: i, raw, type: 'comment', isMotion: false, category: 'comment', estimatedDurationMs: 0, cumulativeDurationMs: cumulativeMs })
      vectors.push(null)
      if (i % modalCheckpointInterval === 0) modalStates.push({ lineIndex: i, state: cloneModalState(state) })
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
    const hasM6 = /\bM0?6\b/.test(clean)
    const isM0 = clean === 'M0' || clean === 'M00'

    if (tWord !== undefined) {
      pendingTool = tWord
      state.toolNumber = tWord
    }

    // ── Tool section boundary logic ──────────────────────────────────────────

    if (isM0) {
      // Check if next non-empty line is a "MANUAL TOOL CHANGE TO T{n}" comment
      const nextRaw = rawLines[i + 1]?.trim() ?? ''
      const tcMatch = nextRaw.match(MANUAL_TOOL_CHANGE_RE)
      if (tcMatch && !firstToolKnown) {
        const tcNum = parseInt(tcMatch[1]!, 10)
        tools[0]!.toolNumber = tcNum
        firstToolKnown = true
      }
      // M0 is not a chunk boundary — do not create a new section
    } else if (hasM6) {
      if (!firstToolKnown) {
        // First T M6 — update section 0 in-place
        tools[0]!.toolNumber = pendingTool
        tools[0]!.toolChangeCmd = raw.trim()
        tools[0]!.toolChangeType = 'M6'
        firstToolKnown = true
      } else {
        // Subsequent T M6 — close current section, open a new one
        const prev = tools[tools.length - 1]!
        prev.endLine = i - 1
        prev.lineCount = prev.endLine - prev.startLine + 1
        sIdx = tools.length
        tools.push({
          toolNumber: pendingTool,
          toolChangeCmd: raw.trim(),
          toolChangeType: 'M6',
          startLine: i,
          endLine: rawLines.length - 1,
          lineCount: rawLines.length - i,
        })
      }
      state.toolNumber = pendingTool
    } else if (tWord !== undefined && !hasM6) {
      // Standalone T word (no M6)
      if (!firstToolKnown) {
        // First standalone T — update section 0 in-place
        tools[0]!.toolNumber = tWord
        tools[0]!.toolChangeCmd = raw.trim()
        tools[0]!.toolChangeType = 'T'
        firstToolKnown = true
      } else {
        // Subsequent standalone T — close current section, open a new one
        const prev = tools[tools.length - 1]!
        prev.endLine = i - 1
        prev.lineCount = prev.endLine - prev.startLine + 1
        sIdx = tools.length
        tools.push({
          toolNumber: tWord,
          toolChangeCmd: raw.trim(),
          toolChangeType: 'T',
          startLine: i,
          endLine: rawLines.length - 1,
          lineCount: rawLines.length - i,
        })
      }
    }

    // ── Line classification + geometry ───────────────────────────────────────

    // Detect explicit motion commands and update the persistent motion mode.
    const hasExplicitG0 = /\bG0\b/.test(clean) || /\bG00\b/.test(clean)
    const hasExplicitG1 = /\bG1\b/.test(clean) || /\bG01\b/.test(clean)
    const hasExplicitG2 = /\bG0?2\b/.test(clean)
    const hasExplicitG3 = /\bG0?3\b/.test(clean)
    const hasExplicitMotion = hasExplicitG0 || hasExplicitG1 || hasExplicitG2 || hasExplicitG3

    if (hasExplicitG0) state.motionMode = 'G0'
    else if (hasExplicitG1) state.motionMode = 'G1'
    else if (hasExplicitG2) state.motionMode = 'G2'
    else if (hasExplicitG3) state.motionMode = 'G3'

    // A modal motion line has axis words but no explicit G motion command and no
    // G28/G30/G38/canned-cycle that would claim those words for their own purposes.
    const hasG28or30 = /\bG28\b/.test(clean) || /\bG30\b/.test(clean)
    const hasG38 = /\bG38\.[2-5]\b/.test(clean)
    const hasCannedCycle = /\bG[78]\d\b/.test(clean)
    const hasAxisWords = /[XYZ][+-]?\d/.test(clean)
    const isModalMotion = !hasExplicitMotion && !hasG28or30 && !hasG38 && !hasCannedCycle && hasAxisWords

    // Planner-draining commands (CLAUDE.md Category B1/B2) force the next motion
    // segment to start from rest — same as the very first segment of the file.
    // G28/G30 are Category A (planner-buffered, no drain); G80 (cancel canned cycle,
    // caught by hasCannedCycle below) is Category C (immediate, modal-only) — neither
    // belongs here.
    if (estimateDurations && (
      /\bM0?[345]\b/.test(clean) ||
      /\bM0?[789]\b/.test(clean) ||
      hasM6 ||
      /\bG10\b/.test(clean) ||
      /\bG5[4-9]\b/.test(clean) ||
      /\bG92\b/.test(clean) ||
      /\bM0?2\b/.test(clean) || /\bM30\b/.test(clean) ||
      /\bG0?4\b/.test(clean) ||
      hasG38 ||
      (hasCannedCycle && !/\bG80\b/.test(clean)) ||
      isM0
    )) {
      pendingHardStop = true
    }

    let type: GCodeLineType = 'modal'
    let durationMs = 0
    let vec: LineVector | null = null

    if (hasExplicitG0 || (isModalMotion && state.motionMode === 'G0')) {
      const { tx, ty, tz } = resolvePos(clean, state)
      const d = dist3(state.position.x, state.position.y, state.position.z, tx, ty, tz) * toMm
      axisRanges.x.min = Math.min(axisRanges.x.min, tx); axisRanges.x.max = Math.max(axisRanges.x.max, tx)
      axisRanges.y.min = Math.min(axisRanges.y.min, ty); axisRanges.y.max = Math.max(axisRanges.y.max, ty)
      axisRanges.z.min = Math.min(axisRanges.z.min, tz); axisRanges.z.max = Math.max(axisRanges.z.max, tz)
      if (tx !== state.position.x || ty !== state.position.y || tz !== state.position.z) {
        vec = { t: 'R', x0: state.position.x, y0: state.position.y, z0: state.position.z, x1: tx, y1: ty, z1: tz, s: sIdx }
        if (estimateDurations && d > 0) {
          const dir = normalize3([tx - state.position.x, ty - state.position.y, tz - state.position.z])
          kinematicSegments.push({
            lengthMm: d,
            nominalSpeedMmPerMin: nominalSpeedForSegment(dir, null, kinematics),
            accelMmPerMin2: limitAccelByAxisMaximum(dir, kinematics),
            dirIn: dir,
            dirOut: dir,
            hardStopBefore: pendingHardStop,
          })
          segmentLineIndices.push(i)
          pendingHardStop = false
        }
      }
      state.position = { x: tx, y: ty, z: tz }
      type = 'rapid'
    }
    else if (hasExplicitG1 || (isModalMotion && state.motionMode === 'G1')) {
      const { tx, ty, tz } = resolvePos(clean, state)
      const feedMmPerMin = state.feedRate * toMm
      const d = dist3(state.position.x, state.position.y, state.position.z, tx, ty, tz) * toMm
      axisRanges.x.min = Math.min(axisRanges.x.min, tx); axisRanges.x.max = Math.max(axisRanges.x.max, tx)
      axisRanges.y.min = Math.min(axisRanges.y.min, ty); axisRanges.y.max = Math.max(axisRanges.y.max, ty)
      axisRanges.z.min = Math.min(axisRanges.z.min, tz); axisRanges.z.max = Math.max(axisRanges.z.max, tz)
      if (tx !== state.position.x || ty !== state.position.y || tz !== state.position.z) {
        vec = { t: 'F', x0: state.position.x, y0: state.position.y, z0: state.position.z, x1: tx, y1: ty, z1: tz, s: sIdx }
        if (estimateDurations && feedMmPerMin > 0 && d > 0) {
          const dir = normalize3([tx - state.position.x, ty - state.position.y, tz - state.position.z])
          kinematicSegments.push({
            lengthMm: d,
            nominalSpeedMmPerMin: nominalSpeedForSegment(dir, feedMmPerMin, kinematics),
            accelMmPerMin2: limitAccelByAxisMaximum(dir, kinematics),
            dirIn: dir,
            dirOut: dir,
            hardStopBefore: pendingHardStop,
          })
          segmentLineIndices.push(i)
          pendingHardStop = false
        }
      }
      state.position = { x: tx, y: ty, z: tz }
      type = 'feed'
    }
    else if (hasExplicitG2 || hasExplicitG3 || (isModalMotion && (state.motionMode === 'G2' || state.motionMode === 'G3'))) {
      const cw = hasExplicitG2 || (!hasExplicitG3 && state.motionMode === 'G2')
      const { tx, ty, tz } = resolvePos(clean, state)
      const iw = word(clean, 'I')
      const jw = word(clean, 'J')
      const kw = word(clean, 'K')
      const rw = word(clean, 'R')

      // Resolve center offsets (I/J/K) based on arc plane.
      // R-format is converted to equivalent I/J/K for the active plane.
      let arcI: number, arcJ: number, arcK: number
      if (rw !== undefined && iw === undefined && jw === undefined && kw === undefined) {
        if (state.plane === 'G17') {
          const ij = rToIJ(state.position.x, state.position.y, tx, ty, rw, !cw)
          arcI = ij.i; arcJ = ij.j; arcK = 0
        } else if (state.plane === 'G18') {
          const ij = rToIJ(state.position.x, state.position.z, tx, tz, rw, !cw)
          arcI = ij.i; arcJ = 0; arcK = ij.j
        } else {
          const ij = rToIJ(state.position.y, state.position.z, ty, tz, rw, !cw)
          arcI = 0; arcJ = ij.i; arcK = ij.j
        }
      } else {
        arcI = iw ?? 0; arcJ = jw ?? 0; arcK = kw ?? 0
      }

      // Arc length and helical component depend on which plane the arc sweeps through.
      let arcLen: number
      let helicalDelta: number
      let tangents: { dirIn: Vec3; dirOut: Vec3 } | null = null
      if (state.plane === 'G17') {
        arcLen = arcLength(state.position.x, state.position.y, tx, ty, arcI, arcJ, undefined, cw) * toMm
        helicalDelta = (tz - state.position.z) * toMm
        if (estimateDurations) {
          tangents = arcTangents(
            state.position.x + arcI, state.position.y + arcJ,
            state.position.x, state.position.y, tx, ty,
            cw, arcLen, helicalDelta,
            (a, b, h) => [a, b, h],
          )
        }
      } else if (state.plane === 'G18') {
        // G18/G19 CW sense is inverted vs G17 in atan2 space — flip cw for arcLength
        arcLen = arcLength(state.position.x, state.position.z, tx, tz, arcI, arcK, undefined, !cw) * toMm
        helicalDelta = (ty - state.position.y) * toMm
        if (estimateDurations) {
          tangents = arcTangents(
            state.position.x + arcI, state.position.z + arcK,
            state.position.x, state.position.z, tx, tz,
            !cw, arcLen, helicalDelta,
            (a, b, h) => [a, h, b],
          )
        }
      } else {
        arcLen = arcLength(state.position.y, state.position.z, ty, tz, arcJ, arcK, undefined, !cw) * toMm
        helicalDelta = (tx - state.position.x) * toMm
        if (estimateDurations) {
          tangents = arcTangents(
            state.position.y + arcJ, state.position.z + arcK,
            state.position.y, state.position.z, ty, tz,
            !cw, arcLen, helicalDelta,
            (a, b, h) => [h, a, b],
          )
        }
      }
      const totalLen = Math.sqrt(arcLen * arcLen + helicalDelta * helicalDelta)
      const feedMmPerMin = state.feedRate * toMm
      axisRanges.x.min = Math.min(axisRanges.x.min, tx); axisRanges.x.max = Math.max(axisRanges.x.max, tx)
      axisRanges.y.min = Math.min(axisRanges.y.min, ty); axisRanges.y.max = Math.max(axisRanges.y.max, ty)
      axisRanges.z.min = Math.min(axisRanges.z.min, tz); axisRanges.z.max = Math.max(axisRanges.z.max, tz)
      vec = { t: 'A', x0: state.position.x, y0: state.position.y, z0: state.position.z, x1: tx, y1: ty, z1: tz, i: arcI, j: arcJ, k: arcK, cw, plane: state.plane, s: sIdx }
      if (estimateDurations && feedMmPerMin > 0 && totalLen > 0 && tangents) {
        // Own accel/nominal-speed use the average of the entry/exit tangents as a single
        // representative direction — arcs are one kinematic segment, not subdivided (see
        // kinematics.ts doc comment), so there's no single "true" direction to project against.
        const avgDir = normalize3([
          tangents.dirIn[0] + tangents.dirOut[0],
          tangents.dirIn[1] + tangents.dirOut[1],
          tangents.dirIn[2] + tangents.dirOut[2],
        ])
        const repDir = avgDir[0] === 0 && avgDir[1] === 0 && avgDir[2] === 0 ? tangents.dirIn : avgDir
        kinematicSegments.push({
          lengthMm: totalLen,
          nominalSpeedMmPerMin: nominalSpeedForSegment(repDir, feedMmPerMin, kinematics),
          accelMmPerMin2: limitAccelByAxisMaximum(repDir, kinematics),
          dirIn: tangents.dirIn,
          dirOut: tangents.dirOut,
          hardStopBefore: pendingHardStop,
        })
        segmentLineIndices.push(i)
        pendingHardStop = false
      }
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
    else if (isM0) {
      type = 'program_pause'
    }
    else if (/\bM0?[345]\b/.test(clean)) {
      type = 'spindle'
    }
    else if (/\bM0?[789]\b/.test(clean)) {
      type = 'coolant'
    }
    else if (hasM6 || /\bT\d/.test(clean)) {
      type = 'tool'
    }
    else if (/\bG5[4-9]\b/.test(clean) || /\bG10\b/.test(clean) || /\bG92\b/.test(clean)) {
      type = 'coord'
    }

    const classified = classifyLine(raw, getActiveFirmwareVersion())

    cumulativeMs += durationMs

    // For M0 lines, look ahead one line for a pause comment
    let pauseComment: string | null | undefined
    if (type === 'program_pause') {
      const nextRaw = rawLines[i + 1]?.trim() ?? ''
      const commentMatch = nextRaw.match(/^\((.+)\)$/)
      pauseComment = commentMatch?.[1] ?? null
    }

    lines.push({
      index: i,
      raw,
      type,
      isMotion: classified.isMotion,
      category: classified.category,
      estimatedDurationMs: durationMs,
      cumulativeDurationMs: cumulativeMs,
      ...(type === 'program_pause' ? { pauseComment } : {}),
    })
    vectors.push(vec)
    if (i % modalCheckpointInterval === 0) modalStates.push({ lineIndex: i, state: cloneModalState(state) })

    if (onProgress) {
      const pct = Math.floor((i / lastLineIdx) * 100)
      if (pct !== lastReportedPct) {
        lastReportedPct = pct
        onProgress(pct)
      }
    }
  }

  // Finalise last section's lineCount
  const lastSection = tools[tools.length - 1]!
  lastSection.lineCount = lastSection.endLine - lastSection.startLine + 1

  clampRanges(axisRanges)

  const noToolDefinitions = tools.length === 1 && tools[0]!.toolNumber === 0

  // Second phase: solve realistic accel/junction-aware durations over the whole file
  // and backfill them onto the lines the single forward pass above left as placeholders
  // (see the function doc comment for why this can't be done in one pass).
  let estimatedTotalMs = cumulativeMs
  if (estimateDurations && kinematicSegments.length > 0) {
    const segmentDurations = computeKinematicDurations(kinematicSegments, kinematics)
    let finalCumulative = 0
    let segIdx = 0
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!
      if (segIdx < segmentLineIndices.length && segmentLineIndices[segIdx] === li) {
        line.estimatedDurationMs = segmentDurations[segIdx]!
        segIdx++
      }
      // Arcs always get at least 1ms even when un-timeable (e.g. F0) — matches the
      // pre-existing "duration === 0 -> 1" fallback this replaces.
      if (line.type === 'arc' && line.estimatedDurationMs === 0) line.estimatedDurationMs = 1
      finalCumulative += line.estimatedDurationMs
      line.cumulativeDurationMs = finalCumulative
    }
    estimatedTotalMs = finalCumulative
  }

  return {
    lines,
    vectors,
    modalStates,
    tools,
    axisRanges,
    estimatedTotalMs,
    noToolDefinitions,
    generator,
    generatorInfo,
  }
}
