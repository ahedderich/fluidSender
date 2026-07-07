import { word, stripComments, rToIJ } from './utils'
import type { TransformMode } from './types'
import type { ProbingRotationResult, HeightmapResult } from '../appState'

export function applyTransforms(
  rawContent: string,
  mode: TransformMode,
  rotation: ProbingRotationResult | null,
  heightmap: HeightmapResult | null,
): string {
  let lines = rawContent.split('\n')
  if ((mode === 'rotated' || mode === 'rotated_height_adjusted') && rotation) {
    lines = applyRotation(lines, rotation.rotationDeg)
  }
  if ((mode === 'height_adjusted' || mode === 'rotated_height_adjusted') && heightmap) {
    lines = applyHeightmap(lines, heightmap)
  }
  return lines.join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toFixed(4)
}

function replaceWord(line: string, letter: string, value: number): string {
  return line.replace(new RegExp(`${letter}[+-]?\\d*\\.?\\d+`, 'i'), `${letter}${fmt(value)}`)
}

function removeWord(line: string, letter: string): string {
  return line.replace(new RegExp(`[ \\t]*${letter}[+-]?\\d*\\.?\\d+`, 'ig'), '').trim()
}

// ── Rotation transform ────────────────────────────────────────────────────────

function applyRotation(rawLines: string[], angleDeg: number): string[] {
  const alpha = -angleDeg * (Math.PI / 180)
  const cosA = Math.cos(alpha)
  const sinA = Math.sin(alpha)

  function rotXY(x: number, y: number): { rx: number; ry: number } {
    return { rx: x * cosA - y * sinA, ry: x * sinA + y * cosA }
  }

  const pos = { x: 0, y: 0, z: 0 }
  let positionMode: 'G90' | 'G91' = 'G90'
  let plane: 'G17' | 'G18' | 'G19' = 'G17'
  let motionMode: 'G0' | 'G1' | 'G2' | 'G3' = 'G0'

  return rawLines.map((raw) => {
    const clean = stripComments(raw).toUpperCase()
    if (!clean) return raw

    if (/\bG90\b/.test(clean)) positionMode = 'G90'
    if (/\bG91\b/.test(clean)) positionMode = 'G91'
    if (/\bG17\b/.test(clean)) plane = 'G17'
    if (/\bG18\b/.test(clean)) plane = 'G18'
    if (/\bG19\b/.test(clean)) plane = 'G19'

    const hasG0 = /\bG0{1,2}\b/.test(clean)
    const hasG1 = /\bG0?1\b/.test(clean)
    const hasG2 = /\bG0?2\b/.test(clean)
    const hasG3 = /\bG0?3\b/.test(clean)
    const hasExplicit = hasG0 || hasG1 || hasG2 || hasG3

    if (hasG0) motionMode = 'G0'
    else if (hasG1) motionMode = 'G1'
    else if (hasG2) motionMode = 'G2'
    else if (hasG3) motionMode = 'G3'

    const hasAxisWords = /[XYZ][+-]?\d/.test(clean)
    const hasG28or30 = /\bG28\b/.test(clean) || /\bG30\b/.test(clean)
    const hasG38 = /\bG38\.[2-5]\b/.test(clean)
    const hasCannedCycle = /\bG[78]\d\b/.test(clean)
    const isModalMotion = !hasExplicit && !hasG28or30 && !hasG38 && !hasCannedCycle && hasAxisWords

    const isG0 = hasG0 || (isModalMotion && motionMode === 'G0')
    const isG1 = hasG1 || (isModalMotion && motionMode === 'G1')
    const isG2 = hasG2 || (isModalMotion && motionMode === 'G2')
    const isG3 = hasG3 || (isModalMotion && motionMode === 'G3')

    if ((isG0 || isG1) && !hasG28or30 && !hasG38) {
      const xw = word(clean, 'X')
      const yw = word(clean, 'Y')
      const zw = word(clean, 'Z')

      if (xw === undefined && yw === undefined) {
        if (zw !== undefined) pos.z = positionMode === 'G90' ? zw : pos.z + zw
        return raw
      }

      let line = raw

      if (positionMode === 'G90') {
        const tx = xw !== undefined ? xw : pos.x
        const ty = yw !== undefined ? yw : pos.y
        const { rx, ry } = rotXY(tx, ty)
        if (xw !== undefined) line = replaceWord(line, 'X', rx)
        if (yw !== undefined) line = replaceWord(line, 'Y', ry)
        pos.x = tx
        pos.y = ty
      } else {
        const dx = xw ?? 0
        const dy = yw ?? 0
        const { rx, ry } = rotXY(dx, dy)
        if (xw !== undefined) line = replaceWord(line, 'X', rx)
        if (yw !== undefined) line = replaceWord(line, 'Y', ry)
        pos.x += dx
        pos.y += dy
      }
      if (zw !== undefined) pos.z = positionMode === 'G90' ? zw : pos.z + zw

      return line
    }

    if ((isG2 || isG3) && !hasG28or30 && !hasG38) {
      const cw = isG2
      const xw = word(clean, 'X')
      const yw = word(clean, 'Y')
      const zw = word(clean, 'Z')
      const iw = word(clean, 'I')
      const jw = word(clean, 'J')
      const kw = word(clean, 'K')
      const rw = word(clean, 'R')

      let tx: number, ty: number, tz: number
      if (positionMode === 'G90') {
        tx = xw !== undefined ? xw : pos.x
        ty = yw !== undefined ? yw : pos.y
        tz = zw !== undefined ? zw : pos.z
      } else {
        tx = pos.x + (xw ?? 0)
        ty = pos.y + (yw ?? 0)
        tz = pos.z + (zw ?? 0)
      }

      let arcI: number, arcJ: number, arcK: number
      if (rw !== undefined && iw === undefined && jw === undefined && kw === undefined) {
        if (plane === 'G17') {
          const ij = rToIJ(pos.x, pos.y, tx, ty, rw, !cw)
          arcI = ij.i; arcJ = ij.j; arcK = 0
        } else if (plane === 'G18') {
          const ij = rToIJ(pos.x, pos.z, tx, tz, rw, !cw)
          arcI = ij.i; arcJ = 0; arcK = ij.j
        } else {
          const ij = rToIJ(pos.y, pos.z, ty, tz, rw, !cw)
          arcI = 0; arcJ = ij.i; arcK = ij.j
        }
      } else {
        arcI = iw ?? 0; arcJ = jw ?? 0; arcK = kw ?? 0
      }

      const prevX = pos.x, prevY = pos.y
      pos.x = tx; pos.y = ty; pos.z = tz

      let line = raw

      if (plane === 'G17') {
        const { rx: rtx, ry: rty } = rotXY(tx, ty)
        const { rx: ri, ry: rj } = rotXY(arcI, arcJ)

        if (positionMode === 'G90') {
          if (xw !== undefined) line = replaceWord(line, 'X', rtx)
          if (yw !== undefined) line = replaceWord(line, 'Y', rty)
        } else {
          const { rx: rdx, ry: rdy } = rotXY(xw ?? 0, yw ?? 0)
          if (xw !== undefined) line = replaceWord(line, 'X', rdx)
          if (yw !== undefined) line = replaceWord(line, 'Y', rdy)
        }

        if (rw !== undefined) {
          line = removeWord(line, 'R')
          line = `${line.trimEnd()} I${fmt(ri)} J${fmt(rj)}`
        } else {
          if (iw !== undefined) line = replaceWord(line, 'I', ri)
          else line = `${line.trimEnd()} I${fmt(ri)}`
          if (jw !== undefined) line = replaceWord(line, 'J', rj)
          else line = `${line.trimEnd()} J${fmt(rj)}`
        }
      } else {
        // G18/G19: rotate X/Y endpoint only; pass center offsets through unchanged
        if (positionMode === 'G90') {
          const { rx: rtx, ry: rty } = rotXY(tx, ty)
          if (xw !== undefined) line = replaceWord(line, 'X', rtx)
          if (yw !== undefined) line = replaceWord(line, 'Y', rty)
        } else {
          const { rx: rdx, ry: rdy } = rotXY(xw ?? 0, yw ?? 0)
          if (xw !== undefined) line = replaceWord(line, 'X', rdx)
          if (yw !== undefined) line = replaceWord(line, 'Y', rdy)
        }
        if (rw !== undefined) {
          line = removeWord(line, 'R')
          line = `${line.trimEnd()} I${fmt(arcI)} J${fmt(arcJ)} K${fmt(arcK)}`
        }
      }

      // Suppress unused-var warning — prevX/prevY tracked for future use
      void prevX; void prevY
      return line
    }

    return raw
  })
}

// ── Heightmap transform ───────────────────────────────────────────────────────

function fillNulls(values: (number | null)[], cols: number, _rows: number): number[] {
  const filled = [...values] as (number | null)[]
  const nonNull: number[] = []
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] !== null) nonNull.push(i)
  }
  if (nonNull.length === 0) return filled.map(() => 0) as number[]

  for (let i = 0; i < filled.length; i++) {
    if (filled[i] !== null) continue
    const r = Math.floor(i / cols)
    const c = i % cols
    let bestDist = Infinity
    let bestVal = 0
    for (const ni of nonNull) {
      const nr = Math.floor(ni / cols)
      const nc = ni % cols
      const d = Math.abs(r - nr) + Math.abs(c - nc)
      if (d < bestDist) {
        bestDist = d
        bestVal = filled[ni] as number
      }
    }
    filled[i] = bestVal
  }
  return filled as number[]
}

function interpolateZ(x: number, y: number, hm: HeightmapResult, filled: number[]): number {
  const colF = (x - hm.originX) / hm.spacingX
  const rowF = (y - hm.originY) / hm.spacingY

  const col = Math.max(0, Math.min(Math.floor(colF), hm.colCount - 2))
  const row = Math.max(0, Math.min(Math.floor(rowF), hm.rowCount - 2))
  const tx = Math.max(0, Math.min(colF - col, 1))
  const ty = Math.max(0, Math.min(rowF - row, 1))

  const f00 = filled[row * hm.colCount + col] ?? 0
  const f10 = filled[row * hm.colCount + col + 1] ?? 0
  const f01 = filled[(row + 1) * hm.colCount + col] ?? 0
  const f11 = filled[(row + 1) * hm.colCount + col + 1] ?? 0

  return f00 * (1 - tx) * (1 - ty) + f10 * tx * (1 - ty) + f01 * (1 - tx) * ty + f11 * tx * ty
}

function buildArcThetas(theta0: number, theta1: number, cw: boolean, isFullCircle: boolean, angularStep: number): number[] {
  const thetas: number[] = []
  if (isFullCircle) {
    const total = 2 * Math.PI
    const steps = Math.ceil(total / angularStep)
    for (let s = 1; s <= steps; s++) {
      thetas.push(cw ? theta0 - (s / steps) * total : theta0 + (s / steps) * total)
    }
  } else {
    let sweep = cw ? theta0 - theta1 : theta1 - theta0
    if (sweep <= 0) sweep += 2 * Math.PI
    const steps = Math.max(1, Math.ceil(sweep / angularStep))
    for (let s = 1; s <= steps; s++) {
      thetas.push(cw ? theta0 - (s / steps) * sweep : theta0 + (s / steps) * sweep)
    }
  }
  return thetas
}

function applyHeightmap(rawLines: string[], hm: HeightmapResult): string[] {
  if (hm.values.every((v) => v === null)) return rawLines

  const filled = fillNulls(hm.values, hm.colCount, hm.rowCount)
  const segLen = Math.min(hm.spacingX, hm.spacingY)
  const minAngStep = 0.001

  const pos = { x: 0, y: 0, z: 0 }
  let positionMode: 'G90' | 'G91' = 'G90'
  let plane: 'G17' | 'G18' | 'G19' = 'G17'
  let motionMode: 'G0' | 'G1' | 'G2' | 'G3' = 'G0'

  const out: string[] = []

  for (const raw of rawLines) {
    const clean = stripComments(raw).toUpperCase()
    if (!clean) { out.push(raw); continue }

    if (/\bG90\b/.test(clean)) positionMode = 'G90'
    if (/\bG91\b/.test(clean)) positionMode = 'G91'
    if (/\bG17\b/.test(clean)) plane = 'G17'
    if (/\bG18\b/.test(clean)) plane = 'G18'
    if (/\bG19\b/.test(clean)) plane = 'G19'

    const hasG0 = /\bG0{1,2}\b/.test(clean)
    const hasG1 = /\bG0?1\b/.test(clean)
    const hasG2 = /\bG0?2\b/.test(clean)
    const hasG3 = /\bG0?3\b/.test(clean)
    const hasExplicit = hasG0 || hasG1 || hasG2 || hasG3

    if (hasG0) motionMode = 'G0'
    else if (hasG1) motionMode = 'G1'
    else if (hasG2) motionMode = 'G2'
    else if (hasG3) motionMode = 'G3'

    const hasAxisWords = /[XYZ][+-]?\d/.test(clean)
    const hasG28or30 = /\bG28\b/.test(clean) || /\bG30\b/.test(clean)
    const hasG38 = /\bG38\.[2-5]\b/.test(clean)
    const hasCannedCycle = /\bG[78]\d\b/.test(clean)
    const isModalMotion = !hasExplicit && !hasG28or30 && !hasG38 && !hasCannedCycle && hasAxisWords

    const isG0 = hasG0 || (isModalMotion && motionMode === 'G0')
    const isG1 = hasG1 || (isModalMotion && motionMode === 'G1')
    const isG2 = hasG2 || (isModalMotion && motionMode === 'G2')
    const isG3 = hasG3 || (isModalMotion && motionMode === 'G3')

    if (hasG38 || hasG28or30) {
      out.push(raw)
      continue
    }

    if (isG0) {
      const xw = word(clean, 'X')
      const yw = word(clean, 'Y')
      const zw = word(clean, 'Z')

      let tx: number, ty: number, tz: number
      if (positionMode === 'G90') {
        tx = xw !== undefined ? xw : pos.x
        ty = yw !== undefined ? yw : pos.y
        tz = zw !== undefined ? zw : pos.z
      } else {
        tx = pos.x + (xw ?? 0)
        ty = pos.y + (yw ?? 0)
        tz = pos.z + (zw ?? 0)
      }

      if (zw !== undefined) {
        // Correct Z endpoint for rapid moves that have an explicit Z
        const corrected = tz + interpolateZ(tx, ty, hm, filled)
        let line = raw
        if (positionMode === 'G90') line = replaceWord(line, 'Z', corrected)
        else line = replaceWord(line, 'Z', corrected - pos.z)
        out.push(line)
      } else {
        out.push(raw)
      }

      pos.x = tx; pos.y = ty; pos.z = tz
      continue
    }

    if (isG1) {
      const xw = word(clean, 'X')
      const yw = word(clean, 'Y')
      const zw = word(clean, 'Z')
      const fw = word(clean, 'F')

      let tx: number, ty: number, tz: number
      if (positionMode === 'G90') {
        tx = xw !== undefined ? xw : pos.x
        ty = yw !== undefined ? yw : pos.y
        tz = zw !== undefined ? zw : pos.z
      } else {
        tx = pos.x + (xw ?? 0)
        ty = pos.y + (yw ?? 0)
        tz = pos.z + (zw ?? 0)
      }

      const x0 = pos.x, y0 = pos.y, z0 = pos.z
      pos.x = tx; pos.y = ty; pos.z = tz

      const xyDist = Math.sqrt((tx - x0) ** 2 + (ty - y0) ** 2)

      if (xyDist <= segLen || (xw === undefined && yw === undefined)) {
        // Short move or pure-Z: correct endpoint Z
        const corrected = tz + interpolateZ(tx, ty, hm, filled)
        let line = raw
        if (positionMode === 'G90') {
          if (zw !== undefined) line = replaceWord(line, 'Z', corrected)
          else line = `${line.trimEnd()} Z${fmt(corrected)}`
        } else {
          const dz = corrected - z0
          if (zw !== undefined) line = replaceWord(line, 'Z', dz)
          else line = `${line.trimEnd()} Z${fmt(dz)}`
        }
        out.push(line)
      } else {
        const n = Math.ceil(xyDist / segLen)
        let fEmitted = false
        for (let step = 1; step <= n; step++) {
          const t = step / n
          const px = x0 + t * (tx - x0)
          const py = y0 + t * (ty - y0)
          const pzLinear = z0 + t * (tz - z0)
          const pzCorrected = pzLinear + interpolateZ(px, py, hm, filled)
          let seg = `G1 X${fmt(px)} Y${fmt(py)} Z${fmt(pzCorrected)}`
          if (!fEmitted && fw !== undefined) {
            seg += ` F${fmt(fw)}`
            fEmitted = true
          }
          out.push(seg)
        }
      }
      continue
    }

    if (isG2 || isG3) {
      const cw = isG2
      const xw = word(clean, 'X')
      const yw = word(clean, 'Y')
      const zw = word(clean, 'Z')
      const iw = word(clean, 'I')
      const jw = word(clean, 'J')
      const kw = word(clean, 'K')
      const rw = word(clean, 'R')
      const fw = word(clean, 'F')

      let tx: number, ty: number, tz: number
      if (positionMode === 'G90') {
        tx = xw !== undefined ? xw : pos.x
        ty = yw !== undefined ? yw : pos.y
        tz = zw !== undefined ? zw : pos.z
      } else {
        tx = pos.x + (xw ?? 0)
        ty = pos.y + (yw ?? 0)
        tz = pos.z + (zw ?? 0)
      }

      let arcI: number, arcJ: number, arcK: number
      if (rw !== undefined && iw === undefined && jw === undefined && kw === undefined) {
        if (plane === 'G17') {
          const ij = rToIJ(pos.x, pos.y, tx, ty, rw, !cw)
          arcI = ij.i; arcJ = ij.j; arcK = 0
        } else if (plane === 'G18') {
          const ij = rToIJ(pos.x, pos.z, tx, tz, rw, !cw)
          arcI = ij.i; arcJ = 0; arcK = ij.j
        } else {
          const ij = rToIJ(pos.y, pos.z, ty, tz, rw, !cw)
          arcI = 0; arcJ = ij.i; arcK = ij.j
        }
      } else {
        arcI = iw ?? 0; arcJ = jw ?? 0; arcK = kw ?? 0
      }

      const x0 = pos.x, y0 = pos.y, z0 = pos.z
      pos.x = tx; pos.y = ty; pos.z = tz

      if (plane === 'G17') {
        const cx = x0 + arcI
        const cy = y0 + arcJ
        const r = Math.sqrt(arcI ** 2 + arcJ ** 2)

        if (r < 0.001) {
          const pzCorrected = tz + interpolateZ(tx, ty, hm, filled)
          out.push(`G1 X${fmt(tx)} Y${fmt(ty)} Z${fmt(pzCorrected)}${fw !== undefined ? ` F${fmt(fw)}` : ''}`)
          continue
        }

        const theta0 = Math.atan2(y0 - cy, x0 - cx)
        const theta1 = Math.atan2(ty - cy, tx - cx)
        const angStep = Math.max(minAngStep, 2 * Math.asin(Math.min(segLen / (2 * r), 1)))
        const isFullCircle = Math.abs(tx - x0) < 1e-6 && Math.abs(ty - y0) < 1e-6
        const thetas = buildArcThetas(theta0, theta1, cw, isFullCircle, angStep)

        let fEmitted = false
        for (let si = 0; si < thetas.length; si++) {
          const theta = thetas[si]!
          const px = cx + r * Math.cos(theta)
          const py = cy + r * Math.sin(theta)
          const t = (si + 1) / thetas.length
          const pzCorrected = (z0 + t * (tz - z0)) + interpolateZ(px, py, hm, filled)
          let seg = `G1 X${fmt(px)} Y${fmt(py)} Z${fmt(pzCorrected)}`
          if (!fEmitted && fw !== undefined) { seg += ` F${fmt(fw)}`; fEmitted = true }
          out.push(seg)
        }
      } else if (plane === 'G18') {
        // XZ plane arc, Y is helical
        const cx = x0 + arcI
        const cz = z0 + arcK
        const r = Math.sqrt(arcI ** 2 + arcK ** 2)

        if (r < 0.001) {
          out.push(`G1 X${fmt(tx)} Y${fmt(ty)} Z${fmt(tz + interpolateZ(tx, ty, hm, filled))}${fw !== undefined ? ` F${fmt(fw)}` : ''}`)
          continue
        }

        const theta0 = Math.atan2(z0 - cz, x0 - cx)
        const theta1 = Math.atan2(tz - cz, tx - cx)
        const angStep = Math.max(minAngStep, 2 * Math.asin(Math.min(segLen / (2 * r), 1)))
        const isFullCircle = Math.abs(tx - x0) < 1e-6 && Math.abs(tz - z0) < 1e-6
        const thetas = buildArcThetas(theta0, theta1, cw, isFullCircle, angStep)

        let fEmitted = false
        for (let si = 0; si < thetas.length; si++) {
          const theta = thetas[si]!
          const px = cx + r * Math.cos(theta)
          const pz = cz + r * Math.sin(theta)
          const t = (si + 1) / thetas.length
          const py = y0 + t * (ty - y0)
          const pzCorrected = pz + interpolateZ(px, py, hm, filled)
          let seg = `G1 X${fmt(px)} Y${fmt(py)} Z${fmt(pzCorrected)}`
          if (!fEmitted && fw !== undefined) { seg += ` F${fmt(fw)}`; fEmitted = true }
          out.push(seg)
        }
      } else {
        // G19: YZ plane arc, X is helical
        const cy = y0 + arcJ
        const cz = z0 + arcK
        const r = Math.sqrt(arcJ ** 2 + arcK ** 2)

        if (r < 0.001) {
          out.push(`G1 X${fmt(tx)} Y${fmt(ty)} Z${fmt(tz + interpolateZ(tx, ty, hm, filled))}${fw !== undefined ? ` F${fmt(fw)}` : ''}`)
          continue
        }

        const theta0 = Math.atan2(z0 - cz, y0 - cy)
        const theta1 = Math.atan2(tz - cz, ty - cy)
        const angStep = Math.max(minAngStep, 2 * Math.asin(Math.min(segLen / (2 * r), 1)))
        const isFullCircle = Math.abs(ty - y0) < 1e-6 && Math.abs(tz - z0) < 1e-6
        const thetas = buildArcThetas(theta0, theta1, cw, isFullCircle, angStep)

        let fEmitted = false
        for (let si = 0; si < thetas.length; si++) {
          const theta = thetas[si]!
          const py = cy + r * Math.cos(theta)
          const pz = cz + r * Math.sin(theta)
          const t = (si + 1) / thetas.length
          const px = x0 + t * (tx - x0)
          const pzCorrected = pz + interpolateZ(px, py, hm, filled)
          let seg = `G1 X${fmt(px)} Y${fmt(py)} Z${fmt(pzCorrected)}`
          if (!fEmitted && fw !== undefined) { seg += ` F${fmt(fw)}`; fEmitted = true }
          out.push(seg)
        }
      }
      continue
    }

    out.push(raw)
  }

  return out
}
