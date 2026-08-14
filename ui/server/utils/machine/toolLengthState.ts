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

// The actual $# query/parse lives in ws.ts (it's part of the machineConnection event
// wiring), so it's wired in here via a provider — same pattern as appState.ts's
// registerMachineStatusProvider — to avoid a route↔util circular import.
let _refreshProvider: (() => Promise<number | null>) | null = null

export function registerToolLengthRefreshProvider(fn: () => Promise<number | null>): void {
  _refreshProvider = fn
}

/** Query firmware for the live TLO right now (via $#) rather than trusting the cache. */
export function requestToolLengthRefresh(): Promise<number | null> {
  return _refreshProvider ? _refreshProvider() : Promise.resolve(getToolLengthOffset())
}
