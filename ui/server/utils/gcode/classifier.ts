export type CommandCategory = 'A' | 'B1' | 'B2' | 'C' | 'comment' | 'unknown'

export interface ClassifiedLine {
  category: CommandCategory
  /** True only for Category A (planner-buffered). Used to gate Bf: slot accounting. */
  isMotion: boolean
}

interface VersionDef {
  /** "major.minor" e.g. "4.0". Patch releases do not change GCode semantics. */
  version: string
  /** Category A — planner-buffered; ok sent immediately when queued. */
  categoryA: ReadonlySet<string>
  /** Category B1 — drain-only; ok after planner drains. */
  categoryB1: ReadonlySet<string>
  /** Category B2 — extended block; ok after full operation completes. */
  categoryB2: ReadonlySet<string>
  // Category C is the default for everything not listed above.
}

const DEF_4_0: VersionDef = {
  version: '4.0',
  categoryA: new Set([
    'G0', 'G1', 'G2', 'G3',   // linear/arc moves
    'G28', 'G30',              // go-to-home (queue 1–2 rapid moves each)
    // $J= jog is Category A but handled by the jogging subsystem, not the job sender.
  ]),
  categoryB1: new Set([
    'M3', 'M4', 'M5',         // spindle (drain then apply)
    'M6', 'M61',              // tool change
    'M7', 'M8', 'M9',         // coolant
    'M62', 'M63', 'M67',      // sync I/O output
    'G10',                    // set WCS offset (NVS write + FORCE_BUFFER_SYNC)
    'G54', 'G55', 'G56', 'G57', 'G58', 'G59',  // WCS select (FORCE_BUFFER_SYNC)
    'G92', 'G92.1',           // G92 offset (FORCE_BUFFER_SYNC)
    'G28.1', 'G30.1',         // store home position (NVS write)
    'M2', 'M30',              // program end
  ]),
  categoryB2: new Set([
    'G4',                     // dwell (drain + sleep for P seconds)
    'G38.2', 'G38.3', 'G38.4', 'G38.5',  // probe (drain + block until Idle)
    'M0',                     // program pause (drain + wait for cycle-start)
    '$H',                     // home all axes
    // $HX/$HY/$HZ/$HA/$HB/$HC (single-axis) handled via regex in classifyLine()
  ]),
}

/** All known version definitions, oldest first. */
const VERSION_DEFS: VersionDef[] = [
  DEF_4_0,
  // Future: DEF_4_1, DEF_5_0, ...
]

// Module-level active firmware version — set by ws.ts on connect/disconnect.
let _activeFirmwareVersion: string | null = null

export function setActiveFirmwareVersion(v: string | null): void {
  _activeFirmwareVersion = v
}

export function getActiveFirmwareVersion(): string | null {
  return _activeFirmwareVersion
}

/**
 * Parse "major.minor" from a firmware version string.
 * Accepts: "4.0.3", "v4.0.3", "FluidNC v4.0.3", "Grbl 3.7 [FluidNC v4.0.3 ...]"
 */
export function parseFirmwareVersion(raw: string): string | null {
  const m = raw.match(/(\d+)\.(\d+)/)
  return m ? `${m[1]}.${m[2]}` : null
}

// Single-entry memo: classifyLine() calls resolveVersionDef() once per source line
// with the same firmwareVersion for the whole analyzeGCode pass (it's a synchronous,
// single-threaded traversal — the active firmware can't change mid-pass), so
// re-deriving it every line is pure waste on large files.
let _versionDefCache: { firmwareVersion: string | null; def: VersionDef } | null = null

/**
 * Find the best matching VersionDef for a given firmware version string.
 * Picks the highest definition whose version is ≤ the firmware version.
 * Falls back to the most recent known definition if no match is lower.
 */
export function resolveVersionDef(firmwareVersion: string | null): VersionDef {
  if (_versionDefCache && _versionDefCache.firmwareVersion === firmwareVersion) {
    return _versionDefCache.def
  }

  const def = computeVersionDef(firmwareVersion)
  _versionDefCache = { firmwareVersion, def }
  return def
}

function computeVersionDef(firmwareVersion: string | null): VersionDef {
  if (!firmwareVersion) return VERSION_DEFS[VERSION_DEFS.length - 1]!

  const parsed = parseFirmwareVersion(firmwareVersion)
  if (!parsed) return VERSION_DEFS[VERSION_DEFS.length - 1]!

  const [fMajor, fMinor] = parsed.split('.').map(Number) as [number, number]

  const sameMajor = VERSION_DEFS.filter(d => {
    const [dMaj, dMin] = d.version.split('.').map(Number) as [number, number]
    return dMaj === fMajor && dMin <= fMinor
  })

  if (sameMajor.length > 0) {
    return sameMajor.sort((a, b) => {
      const aMin = parseInt(a.version.split('.')[1]!)
      const bMin = parseInt(b.version.split('.')[1]!)
      return bMin - aMin
    })[0]!
  }

  // No same-major match — fall back to the closest (highest) known definition.
  return VERSION_DEFS[VERSION_DEFS.length - 1]!
}

/**
 * Classify a single raw GCode line.
 * Pass null as firmwareVersion to use the most recent known definition.
 *
 * Known limitation: standalone S-word lines are treated as Category C even
 * when the spindle is ON (should be B1 in that case). This causes a minor
 * execPtr lag but not incorrect behaviour.
 */
export function classifyLine(raw: string, firmwareVersion: string | null): ClassifiedLine {
  const trimmed = raw.trim()

  if (trimmed === '' || trimmed.startsWith(';') || trimmed.startsWith('(')) {
    return { category: 'comment', isMotion: false }
  }

  const token = extractPrimaryToken(trimmed)
  if (!token) return { category: 'C', isMotion: false }

  const def = resolveVersionDef(firmwareVersion)

  if (def.categoryA.has(token)) return { category: 'A', isMotion: true }
  if (def.categoryB1.has(token)) return { category: 'B1', isMotion: false }
  if (def.categoryB2.has(token)) return { category: 'B2', isMotion: false }

  // Single-axis homing: $HX, $HY, $HZ, $HA, $HB, $HC
  if (/^\$H[XYZABC]$/i.test(token)) return { category: 'B2', isMotion: false }

  return { category: 'C', isMotion: false }
}

/**
 * Extract the primary command token from a stripped GCode line.
 * Strips inline comments, normalises case and leading zeros (G00→G0, M03→M3).
 */
function extractPrimaryToken(line: string): string | null {
  // Remove inline comments: (...)
  const clean = line.replace(/\(.*?\)/g, '').trim()

  // $ commands: $H, $HX, $X, $SLP, etc.
  const dollarMatch = clean.match(/^\$[A-Za-z0-9./_=]+/)
  if (dollarMatch) return dollarMatch[0].toUpperCase()

  // G or M codes — find first occurrence; normalise number (removes leading zeros).
  const gmMatch = clean.match(/[GM](\d+(?:\.\d+)?)/i)
  if (gmMatch) {
    const letter = gmMatch[0]!.charAt(0).toUpperCase()
    const num = parseFloat(gmMatch[1]!)
    return `${letter}${num}`
  }

  // Standalone word-only lines (F, S, T, N) — no primary token, treated as Category C.
  return null
}
