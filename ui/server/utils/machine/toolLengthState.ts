// Session-scoped tool-length-offset (TLO) tracking. FluidNC's G43.1 offset is RAM-only
// (never persisted to NVS) and resets to 0 on every boot/soft-reset, so this value is
// only trustworthy for the lifetime of the current connection — it must be invalidated
// on disconnect/reconnect, not carried across a session boundary.

// Tracked "current TLO" for display — null means unknown/unverified, never a bare 0,
// since 0 is indistinguishable from FluidNC's post-boot default (see resetSession()).
let toolLengthOffset: number | null = null

export function getToolLengthOffset(): number | null {
  return toolLengthOffset
}

export function setToolLengthOffset(value: number | null): void {
  toolLengthOffset = value
}

/** Call on every connect/disconnect — a new connection lifecycle can't trust prior session state. */
export function resetToolLengthSession(): void {
  toolLengthOffset = null
}
