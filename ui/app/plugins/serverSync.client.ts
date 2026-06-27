import { useSettingsStore } from '~/stores/settings'
import { useMachineStore } from '~/stores/machine'
import { useSyncStore, type PatchOp, type UiSnapshot } from '~/stores/sync'
import { settleModal } from '~/composables/useModals'
import { setWsSend, wsConnected } from '~/composables/useWsSend'
import type { ServerConnectionState, MachineStatus } from '~/stores/machine'
import type { JobState } from '~/types/job'

interface ServerMessage {
  t: string
  payload: unknown
}

export default defineNuxtPlugin(() => {
  const settingsStore = useSettingsStore()
  const machineStore = useMachineStore()
  const syncStore = useSyncStore()

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function send(msg: unknown) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }
  setWsSend(send)

  function applyPatchOp(op: PatchOp) {
    switch (op.path) {
      case 'connection':
        if ('set' in op) {
          const connState = op.set as unknown as ServerConnectionState
          machineStore.applyServerStatus(connState)
          if (connState.connected) {
            send({ t: 'machine:status:request' })
          }
        }
        break
      case 'config':
        if ('set' in op) {
          settingsStore.applyServerState(op.set as Parameters<typeof settingsStore.applyServerState>[0])
        }
        break
      case 'job':
        if ('set' in op) syncStore.applyJobState(op.set as unknown as JobState)
        break
      default:
        syncStore.applyOp(op)
        if (op.path === 'modals' && 'removeId' in op) settleModal(op.removeId, op.meta?.result)
    }
  }

  function handleMessage(data: string) {
    let msg: ServerMessage
    try {
      msg = JSON.parse(data) as ServerMessage
    } catch {
      return
    }

    switch (msg.t) {
      case 'snapshot': {
        const p = msg.payload as {
          config: Parameters<typeof settingsStore.applyServerState>[0]
          connection: ServerConnectionState
          ui: UiSnapshot
          job: JobState | null
          machine: MachineStatus | null
        }
        settingsStore.applyServerState(p.config)
        machineStore.applyServerStatus(p.connection)
        syncStore.applySnapshot(p.ui)
        if (p.job) syncStore.applyJobState(p.job)
        if (p.machine) machineStore.applyMachineStatus(p.machine)
        else if (p.connection.connected) send({ t: 'machine:status:request' })
        break
      }
      case 'patch': {
        for (const op of (msg.payload as { ops: PatchOp[] }).ops) applyPatchOp(op)
        break
      }
      case 'machine:status': {
        machineStore.applyMachineStatus(msg.payload as MachineStatus)
        break
      }
    }
  }

  function connectWs() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${window.location.host}/ws`)

    ws.addEventListener('open', () => { wsConnected.value = true })
    ws.addEventListener('message', (event) => handleMessage(event.data as string))
    ws.addEventListener('close', () => {
      wsConnected.value = false
      ws = null
      reconnectTimer = setTimeout(connectWs, 2000)
    })
    ws.addEventListener('error', () => ws?.close())
  }

  connectWs()
})
