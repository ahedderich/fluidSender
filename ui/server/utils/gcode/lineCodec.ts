import type { CommandCategory } from './classifier'
import type { GCodeLine, GCodeLineType } from './types'

/**
 * Wire format for lines.json — short keys, abbreviated enum values, and two kinds
 * of field dropped from storage entirely:
 *   - isMotion/index are cheaply re-derivable on decode (isMotion from category,
 *     index from array position) — see decodeLines().
 *   - estimatedDurationMs/cumulativeDurationMs are dropped outright. They're real,
 *     tested output of analyzeGCode() (see preprocessor.test.ts) and stay populated
 *     on every direct analyzeGCode() call — but nothing reads them back off a
 *     *persisted* GCodeLine (confirmed zero consumers of the per-line values in
 *     server/ or app/; the job's total ETA comes from JobAnalysis.estimatedTotalMs,
 *     a separate field computed once and stored in the much smaller analysis.json).
 *     decodeLines() therefore can't and doesn't reconstruct real values for them —
 *     see the 0 placeholder there.
 * Keeps the in-memory GCodeLine[] shape jobRunner/sender.ts already expect
 * untouched — this format only exists at the analyzer.ts write/read boundary,
 * via encodeLines()/decodeLines().
 */
export interface CompactGCodeLine {
  r: string
  t: string
  c: string
  /** Present only when the source line had a pauseComment (may itself be null). */
  o?: string | null
}

const TYPE_ENCODE: Record<GCodeLineType, string> = {
  rapid: 'R',
  feed: 'F',
  arc: 'A',
  probe: 'P',
  dwell: 'D',
  spindle: 'S',
  coolant: 'L',
  tool: 'T',
  coord: 'W',
  modal: 'M',
  comment: '#',
  unsupported: 'U',
  program_pause: 'X',
}

const TYPE_DECODE: Record<string, GCodeLineType> = Object.fromEntries(
  Object.entries(TYPE_ENCODE).map(([type, code]) => [code, type]),
) as Record<string, GCodeLineType>

const CATEGORY_ENCODE: Record<CommandCategory, string> = {
  A: 'A',
  B1: '1',
  B2: '2',
  C: 'C',
  comment: '#',
  unknown: 'U',
}

const CATEGORY_DECODE: Record<string, CommandCategory> = Object.fromEntries(
  Object.entries(CATEGORY_ENCODE).map(([category, code]) => [code, category]),
) as Record<string, CommandCategory>

export function encodeLines(lines: GCodeLine[]): CompactGCodeLine[] {
  return lines.map((l) => {
    const c: CompactGCodeLine = { r: l.raw, t: TYPE_ENCODE[l.type], c: CATEGORY_ENCODE[l.category] }
    if (l.pauseComment !== undefined) c.o = l.pauseComment
    return c
  })
}

/**
 * Reconstructs the GCodeLine[] shape jobRunner/sender.ts expect — index from array
 * position, isMotion from category (true iff category === 'A', see classifier.ts).
 * estimatedDurationMs/cumulativeDurationMs are not recoverable from the compact
 * format (never persisted — see CompactGCodeLine doc comment) and are set to 0;
 * this is only reachable via the cache-hit path (loadCachedLines()), which has no
 * consumer of these two fields today. A fresh analyzeGCode() call always returns
 * real values — this placeholder never reaches preprocessGCode()'s test-covered path.
 */
export function decodeLines(compact: CompactGCodeLine[]): GCodeLine[] {
  return compact.map((c, i) => {
    const category = CATEGORY_DECODE[c.c] ?? 'unknown'
    const line: GCodeLine = {
      index: i,
      raw: c.r,
      type: TYPE_DECODE[c.t] ?? 'modal',
      isMotion: category === 'A',
      category,
      estimatedDurationMs: 0,
      cumulativeDurationMs: 0,
    }
    if (c.o !== undefined) line.pauseComment = c.o
    return line
  })
}
