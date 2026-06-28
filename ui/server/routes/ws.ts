import { defineWebSocketHandler } from 'h3'
import {
  registerPeer,
  removePeer,
  broadcast,
  broadcastPatch,
  getConfig,
  getSnapshot,
  getUiState,
  getConnection,
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
  setStock,
  clearStock,
  type ModalEntry,
  type Toast,
  type StockDef,
} from '../utils/appState'
import { machineConnection } from '../utils/machine/connection'
import {
  startPoller,
  stopPoller,
  onStatusLine,
  getLastMachineStatus,
  initPoller,
} from '../utils/machine/poller'
import { parseGreetingVersion } from '../utils/machine/statusParser'
import { setActiveFirmwareVersion } from '../utils/gcode/classifier'
import { initMachineMode } from '../utils/machine/machineMode'
import {
  onOk,
  onBufUpdate,
  onMachineDisconnected as senderDisconnected,
  senderSoftStop,
  senderFeedHold,
  senderCycleStart,
  senderHardStop,
  getSenderStatus,
} from '../utils/machine/sender'
import { sendJog, cancelJog, onJogStatusUpdate } from '../utils/machine/jogger'
import { jobRunner } from '../utils/gcode/jobRunner'

// ─── One-time bootstrap ──────────────────────────────────────────────────────

initPoller((msg) => broadcast(msg))
initMachineMode((msg) => broadcast(msg))
registerMachineStatusProvider(getLastMachineStatus)

jobRunner.bootRestore().then((mode) => {
  if (mode === 'crash') {
    console.log('[ws] crash recovery mode — job state restored with recovery info')
  } else if (mode === 'loaded') {
    console.log('[ws] boot restore: previous job reloaded')
  }
}).catch((err) => {
  console.error('[ws] bootRestore error:', err)
})

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
      setActiveFirmwareVersion(null)
      // jobRunner must update status before sender fires its terminal event
      jobRunner.onMachineDisconnected()
      senderDisconnected()
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
      if (lastStatus) {
        onBufUpdate(lastStatus.buffer.planner, lastStatus.state, lastStatus.holdPhase)
        onJogStatusUpdate(lastStatus.state)
      }
      break
    }
    case 'responseLine': {
      broadcastPatch([pushConsole({ type: 'recv', text: ev.line, ts: Date.now() })])
      // error:N is a rejected-command acknowledgement — counts as an ack
      if (ev.line.startsWith('error:')) {
        onOk()
      }
      const ver = parseGreetingVersion(ev.line)
      if (ver) {
        setActiveFirmwareVersion(ver)
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
      onOk()
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
      // ── Machine status request ────────────────────────────────────────────
      case 'machine:status:request': {
        const status = getLastMachineStatus()
        if (status) {
          peer.send(JSON.stringify({ t: 'machine:status', payload: status }))
        } else if (getConnection().connected) {
          machineConnection.sendRaw('?')
        }
        break
      }

      // ── Machine connection ────────────────────────────────────────────────
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

      // ── Jog ───────────────────────────────────────────────────────────────
      case 'machine:jog:move': {
        const { cmd } = msg.payload as { cmd: string }
        sendJog(cmd)
        break
      }
      case 'machine:jog:cancel':
        cancelJog()
        break

      // ── Sender control ────────────────────────────────────────────────────
      case 'sender:softStop':
        senderSoftStop((msg.payload as { chunkId?: string } | undefined)?.chunkId)
        break
      case 'sender:feedHold':
        senderFeedHold((msg.payload as { chunkId?: string } | undefined)?.chunkId)
        break
      case 'sender:cycleStart':
        senderCycleStart((msg.payload as { chunkId?: string } | undefined)?.chunkId)
        break
      case 'sender:hardStop':
        senderHardStop((msg.payload as { chunkId?: string } | undefined)?.chunkId)
        break
      case 'sender:status': {
        const chunkId = (msg.payload as { chunkId?: string } | undefined)?.chunkId
        const status = getSenderStatus(chunkId)
        peer.send(JSON.stringify({ t: 'sender:status', payload: status }))
        break
      }

      // ── Job control ───────────────────────────────────────────────────────
      case 'job:analyze:abort':
        jobRunner.abortAnalysis()
        break
      case 'job:start':
        jobRunner.start()
        break
      case 'job:pause':
        jobRunner.pause()
        break
      case 'job:resume':
        jobRunner.resume()
        break
      case 'job:stop':
        jobRunner.stop()
        break
      case 'job:emergency-stop':
        jobRunner.emergencyStop()
        break
      case 'job:cancel':
        // Kept as alias for emergency-stop to avoid breaking any existing callers
        jobRunner.emergencyStop()
        break
      case 'job:clear':
        jobRunner.clear()
        break
      case 'job:recover:confirm':
        jobRunner.confirmRecovery((msg.payload as { resumePtr: number }).resumePtr)
        break
      case 'job:recover:fresh':
        jobRunner.loadJobFresh().catch((err: unknown) => {
          console.error('[ws] loadJobFresh error:', err)
        })
        break

      // ── UI state ──────────────────────────────────────────────────────────
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

      case 'ui:stock:set': {
        const op = await setStock(msg.payload as StockDef)
        broadcastPatch([op])
        break
      }
      case 'ui:stock:clear': {
        const op = await clearStock()
        broadcastPatch([op])
        break
      }

      default:
        console.warn('[WS] unknown message type:', msg.t)
    }
  },

  close(peer) {
    removePeer(peer)
    if (getUiState().jogActive) {
      machineConnection.sendByte(0x85)
      broadcastPatch([setJogActive(false)])
    }
  },

  error(_peer, error) {
    console.error('[WS] peer error', error)
  },
})
