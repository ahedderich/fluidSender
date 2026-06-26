import { defineWebSocketHandler } from 'h3'
import {
  registerPeer,
  removePeer,
  broadcast,
  broadcastPatch,
  getConfig,
  getSnapshot,
  getUiState,
  setNav,
  setSelection,
  setJogActive,
  openModal,
  resolveModal,
  pushToast,
  removeToast,
  pushConsole,
  clearConsole,
  setConnection,
  registerMachineStatusProvider,
  type ModalEntry,
  type Toast,
} from '../utils/appState'
import { machineConnection } from '../utils/machine/connection'
import {
  startPoller,
  stopPoller,
  onStatusLine,
  getLastMachineStatus,
  initPoller,
} from '../utils/machine/poller'
import { parseGreetingVersion, parseGQueryResponse } from '../utils/machine/statusParser'
import { jobEngine } from '../utils/gcode/sendLoop'

// ─── One-time bootstrap (module-level, runs once on first import) ────────────

initPoller((msg) => broadcast(msg))
registerMachineStatusProvider(getLastMachineStatus)

machineConnection.on('event', (ev) => {
  switch (ev.type) {
    case 'connected': {
      const next = setConnection({ connected: true, status: 'Idle', firmwareVersion: '' })
      broadcastPatch([
        { path: 'connection', set: { ...next } },
        pushConsole({ type: 'info', text: `TCP connected to ${ev.host}:${ev.port}`, ts: Date.now() }),
      ])
      startPoller()
      break
    }
    case 'disconnected': {
      stopPoller()
      const next = setConnection({ machineId: null, connected: false, status: 'DISCONNECTED', firmwareVersion: '' })
      broadcastPatch([
        { path: 'connection', set: { ...next } },
        pushConsole({ type: 'info', text: ev.intentional ? 'Disconnected' : 'Connection closed by remote', ts: Date.now() }),
      ])
      break
    }
    case 'statusLine': {
      onStatusLine(ev.line)
      const lastStatus = getLastMachineStatus()
      if (lastStatus?.state === 'Idle') jobEngine.onMachineIdle()
      break
    }
    case 'responseLine': {
      broadcastPatch([pushConsole({ type: 'recv', text: ev.line, ts: Date.now() })])
      // Handle $G modal-state response for pause capture
      if (ev.line.startsWith('[GC:')) {
        jobEngine.onGQueryResponse(ev.line, getLastMachineStatus())
      }
      // Firmware greeting
      const ver = parseGreetingVersion(ev.line)
      if (ver) {
        const next = setConnection({ firmwareVersion: ver })
        broadcastPatch([{ path: 'connection', set: { ...next } }])
      }
      break
    }
    case 'alarm': {
      const next = setConnection({ status: 'ALARM' })
      broadcastPatch([
        { path: 'connection', set: { ...next } },
        pushConsole({ type: 'error', text: `ALARM: ${ev.code}`, ts: Date.now() }),
      ])
      break
    }
    case 'error': {
      const next = setConnection({ machineId: null, connected: false, status: 'DISCONNECTED', firmwareVersion: '' })
      broadcastPatch([
        { path: 'connection', set: { ...next } },
        pushConsole({ type: 'error', text: ev.message, ts: Date.now() }),
        pushToast({ id: `conn-err-${Date.now()}`, type: 'error', message: ev.message, timeout: 6000 }),
      ])
      break
    }
    case 'ok':
      break
  }
})

// ─── WebSocket handler ───────────────────────────────────────────────────────

interface ClientMessage {
  t: string
  payload?: unknown
}

export default defineWebSocketHandler({
  async open(peer) {
    registerPeer(peer)
    try {
      await getConfig()
      peer.send(JSON.stringify({ t: 'snapshot', payload: getSnapshot() }))
    } catch (err) {
      console.error('[WS] error during open handler', err)
    }
  },

  async message(peer, message) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(message.text()) as ClientMessage
    } catch {
      return
    }

    switch (msg.t) {
      // ── Machine connection ─────────────────────────────────────────────────
      case 'machine:connect': {
        const { machineId } = msg.payload as { machineId: string }
        const config = await getConfig()
        setConnection({ machineId })
        machineConnection.connect(machineId, config.machines ?? []).catch((err: unknown) => {
          console.error('[ws] bridge connect error:', err)
        })
        break
      }
      case 'machine:disconnect':
        machineConnection.disconnect()
        break
      case 'machine:command': {
        const { cmd } = msg.payload as { cmd: string }
        machineConnection.sendRaw(cmd)
        broadcastPatch([pushConsole({ type: 'sent', text: cmd.trim(), ts: Date.now() })])
        break
      }

      // ── Job control ────────────────────────────────────────────────────────
      case 'job:load':
        jobEngine.loadJob((msg.payload as { fileId: string }).fileId)
        break
      case 'job:start':
        jobEngine.start()
        break
      case 'job:pause':
        jobEngine.pause()
        break
      case 'job:resume':
        jobEngine.resume()
        break
      case 'job:cancel':
        jobEngine.cancel()
        break
      case 'job:clear':
        jobEngine.clear()
        break
      case 'job:recover:confirm':
        jobEngine.confirmRecovery((msg.payload as { resumePtr: number }).resumePtr)
        break

      // ── UI state ───────────────────────────────────────────────────────────
      case 'ui:nav':
        broadcastPatch([setNav(msg.payload as Parameters<typeof setNav>[0])])
        break
      case 'ui:selection':
        broadcastPatch([setSelection(msg.payload as Parameters<typeof setSelection>[0])])
        break
      case 'ui:jog:start':
        broadcastPatch([setJogActive(true)])
        break
      case 'ui:jog:stop':
        broadcastPatch([setJogActive(false)])
        break
      case 'ui:modal:open': {
        const op = openModal(msg.payload as ModalEntry)
        if (op) broadcastPatch([op])
        break
      }
      case 'ui:modal:resolve': {
        const { id, result } = msg.payload as { id: string; result: unknown }
        const op = resolveModal(id, result)
        if (op) broadcastPatch([op])
        break
      }
      case 'ui:toast:push': {
        const toast = msg.payload as Toast
        broadcastPatch([pushToast(toast)])
        if (toast.timeout > 0) {
          setTimeout(() => {
            const op = removeToast(toast.id)
            if (op) broadcastPatch([op])
          }, toast.timeout)
        }
        break
      }
      case 'ui:toast:dismiss': {
        const op = removeToast((msg.payload as { id: string }).id)
        if (op) broadcastPatch([op])
        break
      }
      case 'ui:console:push':
        broadcastPatch([pushConsole(msg.payload as { type: 'sent' | 'recv' | 'info' | 'error'; text: string; ts: number })])
        break
      case 'ui:console:clear':
        broadcastPatch([clearConsole()])
        break

      default:
        console.warn('[WS] unknown message type:', msg.t)
    }
  },

  close(peer) {
    removePeer(peer)
    if (getUiState().jogActive) {
      broadcastPatch([setJogActive(false)])
    }
  },

  error(_peer, error) {
    console.error('[WS] peer error', error)
  },
})
