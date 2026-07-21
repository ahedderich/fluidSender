import { word, stripComments } from './utils'
import type { ToolLibraryEntry } from '../tool/types'

export type GcodeGeneratorId = 'fusion360' | 'freecad' | 'generic'

export interface FusionToolDef {
  number: number
  diameter: number
  cornerRadius: number
  zMin: number
  type: string
}

export interface FreeCadToolDef {
  number: number
  name: string
}

export interface Fusion360ExtraInfo {
  generator: 'fusion360'
  tools: FusionToolDef[]
}

export interface FreeCadExtraInfo {
  generator: 'freecad'
  tools: FreeCadToolDef[]
}

export interface GenericExtraInfo {
  generator: 'generic'
}

export type GeneratorExtraInfo = Fusion360ExtraInfo | FreeCadExtraInfo | GenericExtraInfo

// Fusion360 header tool definition: (T28 D=8 CR=0 - ZMIN=-4 - flat end mill)
const FUSION_HEADER_TOOL_RE = /^\(T(\d+)\s+D=([\d.]+)\s+CR=([\d.]+)\s+-\s+ZMIN=([-\d.]+)\s+-\s+(.+)\)$/i
const FREECAD_MARKER_RE = /^\(Exported by FreeCAD\)/i
const FREECAD_BEGIN_TOOLCHANGE_RE = /^\(Begin toolchange\)$/i
const FREECAD_TC_PREFIX_RE = /^TC:\s*/i
const COMMENT_LINE_RE = /^\((.*)\)$/
const HEADER_SCAN_LINES = 20

/**
 * Identify which CAM post processor produced this file, from the first
 * ≤20 non-blank lines. FreeCAD self-identifies explicitly; Fusion360's
 * default posts don't, so it's inferred from its structural header pattern.
 */
export function detectGenerator(rawLines: string[]): GcodeGeneratorId {
  let scanned = 0
  let sawFusionHeader = false
  for (let i = 0; i < rawLines.length && scanned < HEADER_SCAN_LINES; i++) {
    const line = rawLines[i]!.trim()
    if (!line) continue
    scanned++
    if (FREECAD_MARKER_RE.test(line)) return 'freecad'
    if (FUSION_HEADER_TOOL_RE.test(line)) sawFusionHeader = true
  }
  return sawFusionHeader ? 'fusion360' : 'generic'
}

function extractFusionTools(rawLines: string[]): Fusion360ExtraInfo {
  const tools: FusionToolDef[] = []
  let scanned = 0
  for (let i = 0; i < rawLines.length && scanned < HEADER_SCAN_LINES; i++) {
    const line = rawLines[i]!.trim()
    if (!line) continue
    scanned++
    const m = line.match(FUSION_HEADER_TOOL_RE)
    if (m) {
      tools.push({
        number: parseInt(m[1]!, 10),
        diameter: parseFloat(m[2]!),
        cornerRadius: parseFloat(m[3]!),
        zMin: parseFloat(m[4]!),
        type: m[5]!.trim(),
      })
    }
  }
  return { generator: 'fusion360', tools }
}

/**
 * FreeCAD's grbl post repeats a `(TC: <name>)`-style comment (whatever the
 * Path job's Tool Controller is named) before every toolchange operation,
 * rather than a single header block. The name always immediately precedes
 * the unconditional `(Begin toolchange)` marker, which is what this anchors
 * on — not the `TC:` text itself, since that prefix is just this shop's
 * naming habit, not something the post processor guarantees.
 */
function extractFreeCadTools(rawLines: string[]): FreeCadExtraInfo {
  const toolMap = new Map<number, string>()
  let lastComment: string | null = null
  let pendingName: string | null = null

  for (const raw of rawLines) {
    const line = raw.trim()
    if (!line) continue

    const commentMatch = line.match(COMMENT_LINE_RE)
    if (commentMatch) {
      if (FREECAD_BEGIN_TOOLCHANGE_RE.test(line)) {
        pendingName = lastComment
      } else {
        lastComment = commentMatch[1]!.trim()
      }
      continue
    }

    if (pendingName !== null) {
      const clean = stripComments(line).toUpperCase()
      const tNum = word(clean, 'T')
      if (tNum !== undefined) {
        toolMap.set(tNum, pendingName.replace(FREECAD_TC_PREFIX_RE, '').trim())
        pendingName = null
      }
    }
  }

  return {
    generator: 'freecad',
    tools: Array.from(toolMap, ([number, name]) => ({ number, name })),
  }
}

export function extractGeneratorInfo(generator: GcodeGeneratorId, rawLines: string[]): GeneratorExtraInfo {
  switch (generator) {
    case 'fusion360': return extractFusionTools(rawLines)
    case 'freecad': return extractFreeCadTools(rawLines)
    case 'generic': return { generator: 'generic' }
  }
}

/** Generator-native display text for a tool number, independent of any library match. */
export function getGeneratorToolLabel(toolNumber: number, info: GeneratorExtraInfo): string | null {
  switch (info.generator) {
    case 'fusion360': {
      const def = info.tools.find((t) => t.number === toolNumber)
      return def ? `${def.diameter}mm ${def.type}` : null
    }
    case 'freecad': {
      const def = info.tools.find((t) => t.number === toolNumber)
      return def?.name ?? null
    }
    case 'generic':
      return null
  }
}

export type ToolEvaluation =
  | { status: 'matched' }
  | { status: 'mismatch'; label: string; error: string }

function evaluateFusionTool(toolNumber: number, info: Fusion360ExtraInfo, entry: ToolLibraryEntry | null): ToolEvaluation {
  const def = info.tools.find((t) => t.number === toolNumber)
  const label = def ? `${def.diameter}mm ${def.type}` : `T${toolNumber}`
  if (!entry) return { status: 'mismatch', label, error: 'Tool number not found in library' }
  if (!def) return { status: 'matched' }

  const diffs: string[] = []
  if (def.type.toLowerCase() !== entry.type.toLowerCase()) {
    diffs.push(`Type: "${def.type}" vs "${entry.type}"`)
  }
  if (Math.abs(def.diameter - entry.diameter) > 0.05) {
    diffs.push(`⌀ ${def.diameter}mm vs ${entry.diameter}mm`)
  }
  if (entry.cornerRadius != null && Math.abs(def.cornerRadius - entry.cornerRadius) > 0.01) {
    diffs.push(`R ${def.cornerRadius}mm vs ${entry.cornerRadius}mm`)
  }
  if (diffs.length) return { status: 'mismatch', label, error: diffs.join('; ') }
  return { status: 'matched' }
}

function evaluateFreeCadTool(toolNumber: number, info: FreeCadExtraInfo, entry: ToolLibraryEntry | null): ToolEvaluation {
  const def = info.tools.find((t) => t.number === toolNumber)
  const label = def?.name ?? `T${toolNumber}`
  if (!entry) return { status: 'mismatch', label, error: 'Tool number not found in library' }
  if (!def) return { status: 'matched' }

  if (def.name.toLowerCase() !== entry.name.toLowerCase()) {
    return { status: 'mismatch', label, error: `Name: "${def.name}" vs "${entry.name}"` }
  }
  return { status: 'matched' }
}

function evaluateGenericTool(toolNumber: number, entry: ToolLibraryEntry | null): ToolEvaluation {
  if (!entry) return { status: 'mismatch', label: `T${toolNumber}`, error: 'Tool number not found in library' }
  return { status: 'matched' }
}

/**
 * The single UI contract for tool display: 'matched' means render the rich
 * library-sourced box; 'mismatch' means fall back to a plain T{n}/label row
 * plus the error banner. Callers never need generator-specific branching.
 */
export function evaluateTool(toolNumber: number, info: GeneratorExtraInfo, entry: ToolLibraryEntry | null): ToolEvaluation {
  switch (info.generator) {
    case 'fusion360': return evaluateFusionTool(toolNumber, info, entry)
    case 'freecad': return evaluateFreeCadTool(toolNumber, info, entry)
    case 'generic': return evaluateGenericTool(toolNumber, entry)
  }
}
