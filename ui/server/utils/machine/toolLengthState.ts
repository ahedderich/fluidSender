// Session-scoped tool-length-offset (TLO) tracking. FluidNC's G43.1 offset is RAM-only
// (never persisted to NVS) and resets to 0 on every boot/soft-reset, so both of these
// values are only trustworthy for the lifetime of the current connection — they must be
// invalidated on disconnect/reconnect, not carried across a session boundary.

// Tracked "current TLO" for display — null means unknown/unverified, never a bare 0,
// since 0 is indistinguishable from FluidNC's post-boot default (see resetSession()).
let toolLengthOffset: number | null = null

// Toolsetter probe reading (machine Z) captured by the first toolsetter probe this
// session. Replaces the old fixed toolsetterReferenceZ constant — every later probe's
// offset is computed relative to this baseline instead of a hand-calibrated number.
let baselineProbeZ: number | null = null

export function getToolLengthOffset(): number | null {
  return toolLengthOffset
}

export function setToolLengthOffset(value: number | null): void {
  toolLengthOffset = value
}

export function getToolsetterBaseline(): number | null {
  return baselineProbeZ
}

export function setToolsetterBaseline(value: number | null): void {
  baselineProbeZ = value
}

/** Call on every connect/disconnect — a new connection lifecycle can't trust prior session state. */
export function resetToolLengthSession(): void {
  toolLengthOffset = null
  baselineProbeZ = null
}
