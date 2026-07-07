import { defineWebSocketHandler } from 'h3'
import type { Peer } from 'crossws'

// Minimal, isolated WebSocket sync test — server is authoritative for `counter`.
// Any client can request an increment; the new value is broadcast to every peer.
// This intentionally avoids the full appState machinery so the transport can be
// validated on its own.

let counter = 0
const peers = new Set<Peer>()

function broadcast() {
  const msg = JSON.stringify({ type: 'value', value: counter })
  for (const p of peers) p.send(msg)
}

export default defineWebSocketHandler({
  open(peer) {
    peers.add(peer)
    peer.send(JSON.stringify({ type: 'value', value: counter }))
  },

  message(peer, message) {
    if (message.text() === 'increment') {
      counter++
      broadcast()
    }
  },

  close(peer) {
    peers.delete(peer)
  },
})
