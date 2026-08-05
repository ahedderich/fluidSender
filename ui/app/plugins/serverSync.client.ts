import { useSettingsStore } from '~/stores/settings'
import { useMachineStore } from '~/stores/machine'
import { useSyncStore, type PatchOp, type UiSnapshot } from '~/stores/sync'
import { useUiStore } from '~/stores/ui'
import { settleModal } from '~/composables/useModals'
import { setWsSend, wsConnected } from '~/composables/useWsSend'
import type { ServerConnectionState, MachineStatus, StockDef, ToolLibraryEntry } from '~/stores/machine'
import type { JobState } from '~/types/job'

interface ServerMessage {
  t: string
  payload: unknown
}

declare module '#app' {
  interface NuxtApp {
    $reconnectWs: () => void
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  const settingsStore = useSettingsStore()
  const machineStore = useMachineStore()
  const syncStore = useSyncStore()
  const uiStore = useUiStore()

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function send(msg: unknown) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }
  setWsSend(send)

  // machine:status and job progress arrive up to ~10/sec each while a job is
  // running. A client too slow to keep up must never build an unbounded
  // backlog of stale frames — coalesce to the latest value instead of
  // applying every one in strict arrival order.
  const applyMachineStatusCoalesced = createLatestCoalescer((status: MachineStatus) => {
    machineStore.applyMachineStatus(status)
  })
  const applyJobStateCoalesced = createLatestCoalescer((state: JobState) => {
    syncStore.applyJobState(state)
  })

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
        if ('set' in op) applyJobStateCoalesced(op.set as unknown as JobState)
        break
      case 'stock':
        if ('set' in op) {
          const s = (op.set as { stock: StockDef | null }).stock
          if (s) machineStore.setStock(s)
          else machineStore.clearStock()
        }
        break
      case 'toolLibrary':
        if ('set' in op) {
          const lib = op.set as { machine: ToolLibraryEntry[]; app: ToolLibraryEntry[] }
          machineStore.setToolLibrary(lib)
        }
        break
      case 'ui':
        if ('set' in op) {
          const uiPatch = op.set as Record<string, unknown>
          if ('loadedToolNumber' in uiPatch) {
            machineStore.setLoadedToolNumber(uiPatch.loadedToolNumber as number | null)
          }
        }
        break
      case 'selection':
        syncStore.applyOp(op)
        if ('set' in op && (op.set as { activeMachineId?: string }).activeMachineId !== undefined) {
          settingsStore.setActiveMachineId((op.set as { activeMachineId: string }).activeMachineId)
        }
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
          stock: StockDef | null
          toolLibrary: { machine: ToolLibraryEntry[]; app: ToolLibraryEntry[] } | null
          authEnabled: boolean
          session: { username: string; role: 'viewer' | 'operator' | 'admin' } | null
        }
        settingsStore.applyServerState(p.config)
        machineStore.applyServerStatus(p.connection)
        uiStore.authEnabled = p.authEnabled ?? false
        syncStore.applySnapshot({ ...p.ui, session: p.session ?? null })
        if (p.ui?.selection?.activeMachineId) {
          settingsStore.setActiveMachineId(p.ui.selection.activeMachineId)
        }
        if (p.job) syncStore.applyJobState(p.job)
        if (p.machine) machineStore.applyMachineStatus(p.machine)
        else if (p.connection.connected) send({ t: 'machine:status:request' })
        if (p.stock) machineStore.setStock(p.stock)
        else machineStore.clearStock()
        if (p.toolLibrary) machineStore.setToolLibrary(p.toolLibrary)
        machineStore.setLoadedToolNumber(p.ui?.loadedToolNumber ?? null)
        const snap = p as Record<string, unknown>
        if (snap.probingState) {
          syncStore.applyOp({ path: 'probingState', set: snap.probingState as Record<string, unknown> })
        }
        if (snap.appUpdateCheck) {
          syncStore.applyOp({ path: 'appUpdateCheck', set: snap.appUpdateCheck as Record<string, unknown> })
        }
        break
      }
      case 'patch': {
        for (const op of (msg.payload as { ops: PatchOp[] }).ops) applyPatchOp(op)
        break
      }
      case 'auth:required': {
        navigateTo('/login')
        break
      }
      case 'machine:status': {
        applyMachineStatusCoalesced(msg.payload as MachineStatus)
        break
      }
      case 'machine:tlo:refresh:result': {
        machineStore.resolveTloRefresh((msg.payload as { value: number | null }).value)
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

  function reconnectWs() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    ws?.close()
    connectWs()
  }

  nuxtApp.provide('reconnectWs', reconnectWs)

  // app:mounted fires before Suspense async hydration completes; a snapshot arriving mid-hydration causes mismatches.
  nuxtApp.hook('app:suspense:resolve', () => {
    connectWs()
  })
})
