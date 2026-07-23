import { networkInterfaces } from 'node:os'

// Reports the server's *actual current* bind state, not the persisted setting —
// a changed "Expose on Network" setting only takes effect after a restart (see
// desktop/src/server.ts), so this is what tells the UI what's live right now.
export default defineEventHandler(() => {
  const exposed = process.env.NITRO_HOST === '0.0.0.0'
  const port = process.env.NITRO_PORT ?? '3000'
  const addresses: string[] = []
  if (exposed) {
    for (const iface of Object.values(networkInterfaces())) {
      for (const addr of iface ?? []) {
        if (addr.family === 'IPv4' && !addr.internal) addresses.push(addr.address)
      }
    }
  }
  return { exposed, port, addresses }
})
