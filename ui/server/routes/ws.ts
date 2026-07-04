import { defineWebSocketHandler } from 'h3'
import {
  registerPeer,
  removePeer,
  broadcast,
  broadcastPatch,
  getConfig,
  setConfig,
  getSnapshot,
  getUiState,
  getConnection,
  getJobState,
  setNav,
  setSelection,
  setJogActive,
  openModal,
  settleProgramPauseModal,
  pushToast,
  removeToast,
  pushConsole,
  clearConsole,
  setConnection,
  setMacroRunState,
  isToolChangeModeActive,
  registerMachineStatusProvider,
  registerToolLibraryProvider,
  setLoadedTool,
  clearLoadedToolDisplay,
  getLoadedToolForMachine,
  setStock,
  clearStock,
  clearMeasurements,
  type ModalEntry,
  type Toast,
  type StockDef,
} from '../utils/appState'
import { macroRunner, buildTcContext, type Macro } from '../utils/macro/macroRunner'
import { toolStore } from '../utils/tool/toolStore'
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
  senderCycleStart,
  senderHardStop,
  getSenderStatus,
  isJobActive,
} from '../utils/machine/sender'
import { sendJog, cancelJog, onJogStatusUpdate } from '../utils/machine/jogger'
import { jobRunner } from '../utils/gcode/jobRunner'
import { loadRuntimeLog } from '../utils/tool/runtimeLog'
import { probingRunner } from '../utils/probing/probingRunner'
import type { ProbeConfig, ProbeCompensation } from '../utils/tool/types'
import { parseFluidNCConfig } from '../utils/machine/configParser'

// ─── One-time bootstrap ──────────────────────────────────────────────────────

loadRuntimeLog().catch((err) => console.error('[ws] loadRuntimeLog error:', err))
toolStore.loadAppLibrary().catch((err) => console.error('[ws] loadAppLibrary error:', err))
initPoller((msg) => broadcast(msg))
initMachineMode((msg) => broadcast(msg))
registerMachineStatusProvider(getLastMachineStatus)
registerToolLibraryProvider((machineId) => toolStore.getAll(machineId) as { machine: unknown[]; app: unknown[] })

jobRunner.bootRestore().then((mode) => {
  if (mode === 'crash') {
    console.log('[ws] crash recovery mode — job state restored with recovery info')
  } else if (mode === 'loaded') {
    console.log('[ws] boot restore: previous job reloaded')
  }
}).catch((err) => {
  console.error('[ws] bootRestore error:', err)
})

// ─── Firmware config fetch ($$ on connect) ───────────────────────────────────

let _configFetch: { lines: string[]; timer: ReturnType<typeof setTimeout> } | null = null

function _beginConfigFetch() {
  if (_configFetch) return
  _configFetch = { lines: [], timer: setTimeout(() => { _configFetch = null }, 5000) }
  machineConnection.sendRaw('$$')
}

async function _finishConfigFetch(): Promise<void> {
  if (!_configFetch) return
  const lines = _configFetch.lines
  clearTimeout(_configFetch.timer)
  _configFetch = null

  const machineId = getConnection().machineId
  if (!machineId || lines.length === 0) return

  try {
    const fluidncConfig = parseFluidNCConfig(lines)
    const config = await getConfig()
    const machines = (config.machines ?? []) as { id?: string; [key: string]: unknown }[]
    const machine = machines.find((m) => m.id === machineId)
    if (machine) {
      machine.fluidncConfig = fluidncConfig
      await setConfig(config)
      broadcastPatch([{ path: 'config', set: config as unknown as Record<string, unknown> }])
    }
  } catch (err) {
    console.error('[ws] config fetch error:', err)
  }
}

machineConnection.on('event', (ev) => {
  switch (ev.type) {
    case 'connected': {
      const next = setConnection({ connected: true, status: 'Idle', firmwareVersion: '' })
      broadcastPatch([
        { path: 'connection', set: { ...next } },
        pushConsole({ type: 'info', text: `TCP connected to ${ev.host}:${ev.port}`, ts: Date.now() }),
      ])
      startPoller()
      const connMachineId = getConnection().machineId ?? ''
      // Load machine-specific tool library from disk then restore persisted loaded tool
      toolStore.loadMachineLibrary(connMachineId).then(() => {
        const { machine: mTools, app: aTools } = toolStore.getAll(connMachineId)
        broadcastPatch([{ path: 'toolLibrary', set: { machine: mTools, app: aTools } }])
      }).catch(() => {})
      getLoadedToolForMachine(connMachineId).then((toolNumber) => {
        const uiState = getUiState()
        uiState.loadedToolNumber = toolNumber
        broadcastPatch([{ path: 'ui', set: { loadedToolNumber: toolNumber } }])
      }).catch(() => {})
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
        clearLoadedToolDisplay(),
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
      // Intercept $key=value lines during config fetch — suppress from console
      if (_configFetch && ev.line.startsWith('$') && ev.line.includes('=')) {
        _configFetch.lines.push(ev.line)
        break
      }
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
        _beginConfigFetch()
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
      if (_configFetch) {
        _finishConfigFetch().catch((err) => console.error('[ws] _finishConfigFetch error:', err))
        break
      }
      onOk()
      if (!isJobActive()) {
        broadcastPatch([pushConsole({ type: 'recv', text: 'ok', ts: Date.now() })])
      }
      break
    case 'probeLine':
      probingRunner.onProbeLine(ev)
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
        if (!machineConnection.isConnected) {
          broadcastPatch([pushConsole({ type: 'error', text: 'Not connected', ts: Date.now() })])
          break
        }
        machineConnection.sendRaw(cmd)
        broadcastPatch([pushConsole({ type: 'sent', text: cmd.trim(), ts: Date.now() })])
        break
      }

      // ── Real-time overrides ───────────────────────────────────────────────
      case 'machine:override': {
        const { bytes } = msg.payload as { bytes: number[] }
        for (const b of bytes) machineConnection.sendByte(b)
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
      case 'job:resumeToolChange':
        jobRunner.resumeAfterToolChange()
        break
      case 'job:resumeProgramPause':
        jobRunner.resumeFromProgramPause()
        break
      case 'job:setToolPreference': {
        const { toolNumber, scope } = msg.payload as { toolNumber: number; scope: 'M' | 'A' }
        jobRunner.setToolPreference(toolNumber, scope)
        break
      }

      // ── Tool library ──────────────────────────────────────────────────────
      case 'tool:load': {
        const conn = getConnection()
        if (!conn.connected) break
        const { toolNumber } = msg.payload as { toolNumber: number }
        const machineId = conn.machineId ?? ''
        setLoadedTool(machineId, toolNumber).then((op) => {
          broadcastPatch([op])
        }).catch((e: unknown) => {
          console.error('[ws] tool:load persist error:', e)
        })
        machineConnection.sendRaw(`T${toolNumber}`)
        break
      }
      case 'tool:unload': {
        const machineId = getConnection().machineId ?? ''
        setLoadedTool(machineId, null).then((op) => {
          broadcastPatch([op])
        }).catch((e: unknown) => {
          console.error('[ws] tool:unload persist error:', e)
        })
        break
      }
      case 'tool:upsert': {
        const { machineId: mId, ...entry } = msg.payload as { machineId: string; [key: string]: unknown }
        toolStore.upsert(entry as unknown as Parameters<typeof toolStore.upsert>[0], mId).catch((e: unknown) => {
          console.error('[ws] tool:upsert error:', e)
        })
        break
      }
      case 'tool:delete': {
        const { id: tId, scope: tScope, machineId: tMachineId } = msg.payload as { id: string; scope: 'M' | 'A'; machineId: string }
        toolStore.delete(tId, tScope, tMachineId).catch((e: unknown) => {
          console.error('[ws] tool:delete error:', e)
        })
        break
      }
      case 'tool:import': {
        const { data: importData, scope: importScope, machineId: importMachineId } = msg.payload as { data: unknown; scope: 'M' | 'A'; machineId: string }
        toolStore.importFusion360(importData, importScope, importMachineId).then((result) => {
          broadcastPatch([pushToast({
            id: `tool-import-${Date.now()}`,
            type: 'success',
            message: `Imported ${result.added} new tools, updated ${result.updated}`,
            timeout: 5000,
          })])
        }).catch((e: unknown) => {
          console.error('[ws] tool:import error:', e)
        })
        break
      }
      case 'tool:clearRuntime': {
        const { id: crId, scope: crScope, machineId: crMachineId } = msg.payload as { id: string; scope: 'M' | 'A'; machineId: string }
        toolStore.clearRuntime(crId, crScope, crMachineId).catch((e: unknown) => {
          console.error('[ws] tool:clearRuntime error:', e)
        })
        break
      }

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
        const op = settleProgramPauseModal(id, result)
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
        const ops = await clearStock()
        broadcastPatch(ops)
        break
      }
      case 'ui:stock:clearMeasurements': {
        broadcastPatch([clearMeasurements()])
        break
      }

      // ── Macros ────────────────────────────────────────────────────────────
      case 'macro:run': {
        const { macroId, formValues } = msg.payload as { macroId: string; formValues: Record<string, string> }
        const config = await getConfig()
        const activeMachineId = getUiState().selection.activeMachineId
        const machineMacros = (() => {
          const m = (config.machines ?? []).find(
            (mc: unknown) => (mc as { id?: string }).id === activeMachineId,
          )
          return ((m as { macros?: Macro[] })?.macros ?? []) as Macro[]
        })()
        const allMacros: Macro[] = [
          ...((config.app?.macros ?? []) as Macro[]),
          ...machineMacros,
        ]
        const macro = allMacros.find((m) => m.id === macroId)
        if (!macro) {
          broadcastPatch([pushConsole({ type: 'error', text: `Macro not found: ${macroId}`, ts: Date.now() })])
          break
        }
        const conn = getConnection()
        if (!conn.connected) {
          broadcastPatch([pushToast({ id: `macro-noconn-${Date.now()}`, type: 'error', message: 'Not connected to machine', timeout: 4000 })])
          break
        }
        if (macro.requiresToolChange && !isToolChangeModeActive()) {
          broadcastPatch([pushToast({ id: `macro-notc-${Date.now()}`, type: 'warning', message: 'This macro requires active tool change mode', timeout: 5000 })])
          break
        }
        broadcastPatch([setMacroRunState({ status: 'running', macroId, macroName: macro.name, errorMessage: null })])
        const tcCtx = isToolChangeModeActive()
          ? await buildTcContext(getJobState(), conn.machineId ?? '')
          : null
        macroRunner.run(macro, formValues ?? {}, tcCtx).catch(() => {})
        break
      }

      case 'macro:abort':
        macroRunner.abort()
        break

      // ── Probing ───────────────────────────────────────────────────────────
      case 'probing:start': {
        const { wizardKey, config: wzConfig, tipRadius, probeConfig, compensation } = msg.payload as {
          wizardKey: string
          config: Parameters<typeof probingRunner.startWizard>[1]
          tipRadius: number
          probeConfig: ProbeConfig
          compensation?: ProbeCompensation
        }
        probingRunner.startWizard(wizardKey, wzConfig, tipRadius, probeConfig, compensation).catch((err: unknown) => {
          console.error('[ws] probing:start error:', err)
        })
        break
      }
      case 'probing:abort':
        probingRunner.abort()
        break
      case 'probing:continue':
        probingRunner.continue()
        break
      case 'probing:edge': {
        const { axis, direction, tipRadius: pTipRadius, probeConfig: pConfig, buffer, compensation: pComp } = msg.payload as {
          axis: 'X' | 'Y' | 'Z'
          direction: '+' | '-'
          tipRadius: number
          probeConfig: ProbeConfig
          buffer: number
          compensation?: ProbeCompensation
        }
        probingRunner.probeIndividualEdge(axis, direction, pTipRadius, pConfig, buffer, pComp).catch((err: unknown) => {
          console.error('[ws] probing:edge error:', err)
        })
        break
      }
      case 'probing:setCenter': {
        const { axis: cAxis } = msg.payload as { axis: 'X' | 'Y' }
        probingRunner.setCenterAxis(cAxis).catch((err: unknown) => {
          console.error('[ws] probing:setCenter error:', err)
        })
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
