export type MobileTab = 'monitor' | 'control'

// Local to this browser only — deliberately not sent over the sync websocket.
// ui/server/utils/appState.ts broadcasts ui.nav identically to every connected
// client by design; routing the mobile bottom-nav tab through that channel
// would mean one phone switching tabs flips every open desktop tab too.
export function useMobileTab() {
  return useState<MobileTab>('mobileTab', () => 'monitor')
}
