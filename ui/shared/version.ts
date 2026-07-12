/** Strips a leading "v" from a release tag, e.g. "v4.0.3" -> "4.0.3". */
export function normalizeVersionTag(tag: string): string {
  return tag.replace(/^v/i, '')
}

/** True if `candidate` is a strictly newer dotted version than `current` (e.g. "4.0.3" > "3.9.8"). */
export function isNewerVersion(candidate: string, current: string): boolean {
  const c = normalizeVersionTag(candidate).split('.').map(Number)
  const cur = normalizeVersionTag(current).split('.').map(Number)
  for (let i = 0; i < Math.max(c.length, cur.length); i++) {
    const a = c[i] ?? 0
    const b = cur[i] ?? 0
    if (a !== b) return a > b
  }
  return false
}
