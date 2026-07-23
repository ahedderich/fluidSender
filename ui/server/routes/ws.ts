import { defineWebSocketHandler } from 'h3'
import type { Peer } from 'crossws'
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
  setCalibrationActive,
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
  clearLoadedToolDisplay,
  getLoadedToolForMachine,
  setStock,
  clearStock,
  clearMeasurements,
  updateMagazineSlots,
  stripAuthSecrets,
  getProbingState,
  persistLastMachineId,
  getAppUpdateCheck,
  setAppUpdateCheck,
  type ModalEntry,
  type Toast,
  type StockDef,
} from '../utils/appState'
import { getLatestGithubRelease, isSameCalendarDay } from '../utils/githubReleaseCheck'
import type { SessionPayload } from '../utils/auth'
import { verifySession, parseCookie } from '../utils/auth'
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
import { parseBootInfo } from '../utils/machine/bootInfoParser'
import { getToolLengthOffset, setToolLengthOffset, resetToolLengthSession } from '../utils/machine/toolLengthState'
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
import { sendJog, cancelJog, onJogStatusUpdate, onJogOk } from '../utils/machine/jogger'
import { jobRunner } from '../utils/gcode/jobRunner'
import { loadRuntimeLog } from '../utils/tool/runtimeLog'
import { probingRunner } from '../utils/probing/probingRunner'
import { modeFromFlags as _modeFromFlags } from '../utils/gcode/types'
import type { ProbeConfig, ProbeCompensation } from '../utils/tool/types'
import { load as loadYaml } from 'js-yaml'

const peerSessions = new Map<string, SessionPayload>()

function requireRole(peer: Peer, minRole: 'operator' | 'admin'): boolean {
  const session = peerSessions.get(peer.id)
  if (!session) return false
  const levels: Record<string, number> = { viewer: 0, operator: 1, admin: 2 }
  return (levels[session.role] ?? 0) >= (levels[minRole] ?? 0)
}

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

// ─── Firmware config fetch ($I → $SS → $LocalFS/Show) ────────────────────────

type ConfigFetchPhase = 'version' | 'startup-log' | 'config-file' | 'tlo'

interface ConfigFetchState {
  phase: ConfigFetchPhase
  lines: string[]
  timer: ReturnType<typeof setTimeout>
  firmwareVersion?: string
  configFilename?: string
  machineIp?: string
  manual?: boolean
}

let _fetch: ConfigFetchState | null = null

function _startConfigFetch(manual = false) {
  if (_fetch) {
    clearTimeout(_fetch.timer)
    _fetch = null
  }
  _fetch = {
    phase: 'version',
    lines: [],
    timer: setTimeout(() => {
      broadcastPatch([pushToast({ id: `fw-cfg-timeout-${Date.now()}`, type: 'error', message: 'Firmware configuration fetch timed out', timeout: 5000 })])
      _fetch = null
    }, 15000),
    manual,
  }
  machineConnection.sendRaw('$I')
}

function _onFetchLine(line: string) {
  if (!_fetch) return
  _fetch.lines.push(line)
}

async function _onFetchOk() {
  if (!_fetch) return
  const { phase, lines } = _fetch
  if (phase === 'version') {
    const verLine = lines.find((l) => l.startsWith('[VER:'))
    if (!verLine) {
      // Spurious ok (e.g. from firmware startup GCode) before $I has responded — discard and keep waiting
      _fetch.lines = []
      onOk()
      if (!isJobActive()) broadcastPatch([pushConsole({ type: 'recv', text: 'ok', ts: Date.now() })])
      return
    }
    // Prefer "FluidNC v3.9.8" within the VER line; fall back to the leading token
    const match = verLine.match(/FluidNC\s+v([\d.]+)/) ?? verLine.match(/\[VER:([\d.]+)/)
    const version = match?.[1] ?? ''
    _fetch.firmwareVersion = version
    if (version) {
      setActiveFirmwareVersion(version)
      const next = setConnection({ firmwareVersion: version })
      broadcastPatch([{ path: 'connection', set: { ...next } }])
      const versionMachineId = getConnection().machineId
      if (versionMachineId) {
        _persistFirmwareVersionAndCheckUpdate(versionMachineId, version).catch((err) => {
          console.error('[ws] _persistFirmwareVersionAndCheckUpdate error:', err)
        })
      }
    }
    _fetch.phase = 'startup-log'
    _fetch.lines = []
    machineConnection.sendRaw('$SS')
    return
  }

  if (phase === 'startup-log') {
    // Sentinel for "this is really $SS's reply" — unlike "Configuration file:", this
    // banner line is present even on the panic-fallback-to-defaults path, where no
    // config file is read at all.
    const sentinelLine = lines.find((l) => /FluidNC v[\d.]+ https:\/\/github\.com\/bdring\/FluidNC/i.test(l))
    if (!sentinelLine) {
      // Spurious ok before $SS has responded — discard and keep waiting
      _fetch.lines = []
      onOk()
      if (!isJobActive()) broadcastPatch([pushConsole({ type: 'recv', text: 'ok', ts: Date.now() })])
      return
    }
    const cfgLine = lines.find((l) => /Configuration file:/i.test(l))
    const cfgMatch = cfgLine?.match(/Configuration file:\s*([^\]\s]+)/)
    const filename = cfgMatch?.[1]?.trim() ?? 'config.yaml'

    const ipLine = lines.find((l) => /Connected - IP is/i.test(l))
    const ipMatch = ipLine?.match(/Connected - IP is\s*([\d.]+)/)
    const machineIp = ipMatch?.[1] ?? null

    _fetch.configFilename = filename
    _fetch.machineIp = machineIp ?? undefined

    const simulatorMode = lines.some((l) => /Simulator SDK/i.test(l))
    const bootInfo = parseBootInfo(lines)
    const connWithSim = setConnection({ simulatorMode, configValid: bootInfo.configValid })
    broadcastPatch([{ path: 'connection', set: { ...connWithSim } }])

    if (!bootInfo.configValid) {
      console.warn('[ws] config fetch: startup log indicates config load error:', bootInfo.configError)
      broadcastPatch([pushToast({ id: `fw-cfg-warn-${Date.now()}`, type: 'warning', message: `Config load warning: ${bootInfo.configError}`, timeout: 7000 })])
    }

    // Persisted independently of the config-file fetch below, which only succeeds
    // when the YAML actually parses — boot info (esp. the invalid-config case) must
    // still be recorded even when that fetch fails or the file was never read.
    const bootMachineId = getConnection().machineId
    if (bootMachineId) {
      const bootConfig = await getConfig()
      const bootMachines = (bootConfig.machines ?? []) as Array<Record<string, unknown>>
      const bootMachine = bootMachines.find((m) => m.id === bootMachineId)
      if (bootMachine) {
        bootMachine.bootInfo = bootInfo
        await setConfig(bootConfig)
        broadcastPatch([{ path: 'config', set: stripAuthSecrets(bootConfig) as unknown as Record<string, unknown> }])
      }
    }

    _fetch.phase = 'config-file'
    _fetch.lines = []
    machineConnection.sendRaw(`$LocalFS/Show=${filename}`)
    return
  }

  if (phase === 'config-file') {
    if (!lines.length) {
      // Spurious ok before $LocalFS/Show has responded — discard and keep waiting
      onOk()
      if (!isJobActive()) broadcastPatch([pushConsole({ type: 'recv', text: 'ok', ts: Date.now() })])
      return
    }
    await _finishConfigFetch(lines)
    if (!_fetch) return // _finishConfigFetch cleared it (shouldn't happen, but guard anyway)
    _fetch.phase = 'tlo'
    _fetch.lines = []
    machineConnection.sendRaw('$#')
    return
  }

  if (phase === 'tlo') {
    const tloLine = lines.find((l) => l.startsWith('[TLO:'))
    if (!tloLine) {
      // Spurious ok before $# has responded — discard and keep waiting
      _fetch.lines = []
      onOk()
      if (!isJobActive()) broadcastPatch([pushConsole({ type: 'recv', text: 'ok', ts: Date.now() })])
      return
    }
    // FluidNC reports TLO as a single scalar: [TLO:0.000]
    const tloZ = Number(tloLine.slice(5, -1))
    // A bare 0 is indistinguishable from FluidNC's post-boot default — treat as unknown.
    setToolLengthOffset(Number.isFinite(tloZ) && tloZ !== 0 ? tloZ : null)
    const next = setConnection({ toolLengthOffset: getToolLengthOffset() })
    broadcastPatch([{ path: 'connection', set: { ...next } }])
    clearTimeout(_fetch.timer)
    _fetch = null
  }
}

async function _finishConfigFetch(lines: string[]) {
  if (!_fetch) return
  const { machineIp, configFilename, manual } = _fetch

  const machineId = getConnection().machineId
  if (!machineId) return

  const rawYaml = lines.join('\n')
  if (!rawYaml.trim()) {
    broadcastPatch([pushToast({ id: `fw-cfg-empty-${Date.now()}`, type: 'error', message: 'Config file was empty or unreadable', timeout: 5000 })])
    return
  }

  try {
    const parsed = loadYaml(rawYaml) as Record<string, unknown>
    const fluidncConfig: Record<string, unknown> = { rawYaml, configFilename: configFilename ?? 'config.yaml', ...parsed }

    const config = await getConfig()
    const machines = (config.machines ?? []) as { id?: string; fluidncConfig?: unknown; fluidncIp?: string | null; [key: string]: unknown }[]
    const machine = machines.find((m) => m.id === machineId)
    if (machine) {
      machine.fluidncConfig = fluidncConfig
      machine.fluidncIp = machineIp ?? null
      await setConfig(config)
      const ops: ReturnType<typeof pushToast>[] = []
      if (manual) ops.push(pushToast({ id: `fw-cfg-ok-${Date.now()}`, type: 'success', message: 'Firmware configuration loaded', timeout: 3000 }))
      broadcastPatch([{ path: 'config', set: stripAuthSecrets(config) as unknown as Record<string, unknown> }, ...ops])
    }
  } catch (err) {
    console.error('[ws] config fetch: YAML parse error:', err)
    broadcastPatch([pushToast({ id: `fw-cfg-err-${Date.now()}`, type: 'error', message: 'Failed to parse firmware YAML configuration', timeout: 5000 })])
  }
}

// Persists the freshly-read firmware version onto the machine profile (unconditionally,
// every connect) and, at most once a day, checks bdring/FluidNC's latest release —
// fire-and-forget from the $I handshake so a slow/unreachable GitHub never stalls connect.
async function _persistFirmwareVersionAndCheckUpdate(machineId: string, version: string): Promise<void> {
  const config = await getConfig()
  const machines = (config.machines ?? []) as Array<Record<string, unknown>>
  const machine = machines.find((m) => m.id === machineId)
  if (!machine) return

  machine.lastKnownFirmwareVersion = version

  const existing = machine.firmwareUpdateCheck as { checkedAt: number | null } | undefined
  if (!existing?.checkedAt || !isSameCalendarDay(existing.checkedAt, Date.now())) {
    const result = await getLatestGithubRelease('bdring', 'FluidNC')
    if ('version' in result) {
      machine.firmwareUpdateCheck = { latestVersion: result.version, checkedAt: Date.now() }
    }
    // Auto check fails silently — no toast, no checkedAt update, so the next connect retries.
  }

  await setConfig(config)
  broadcastPatch([{ path: 'config', set: stripAuthSecrets(config) as unknown as Record<string, unknown> }])
}

machineConnection.on('event', (ev) => {
  switch (ev.type) {
    case 'connected': {
      // New connection lifecycle — any TLO/baseline tracked from a prior connection
      // (this machine or another) can no longer be trusted.
      resetToolLengthSession()
      const next = setConnection({ connected: true, status: 'Idle', firmwareVersion: '', toolLengthOffset: null })
      broadcastPatch([
        { path: 'connection', set: { ...next } },
        pushConsole({ type: 'info', text: `TCP connected to ${ev.host}:${ev.port}`, ts: Date.now() }),
      ])
      startPoller()
      const connMachineId = getConnection().machineId ?? ''
      persistLastMachineId(connMachineId).catch((err) => console.error('[ws] persistLastMachineId error:', err))
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
      _startConfigFetch()
      break
    }
    case 'disconnected': {
      if (_fetch) { clearTimeout(_fetch.timer); _fetch = null }
      stopPoller()
      setActiveFirmwareVersion(null)
      resetToolLengthSession()
      // jobRunner must update status before sender fires its terminal event
      jobRunner.onMachineDisconnected()
      senderDisconnected()
      const next = setConnection({ machineId: null, connected: false, status: 'DISCONNECTED', firmwareVersion: '', simulatorMode: false, configValid: null, toolLengthOffset: null })
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
      // Intercept lines during config fetch — suppress from console (too noisy)
      if (_fetch) {
        _onFetchLine(ev.line)
        if (ev.line.startsWith('error:')) {
          broadcastPatch([pushConsole({ type: 'recv', text: ev.line, ts: Date.now() })])
          onOk()
          clearTimeout(_fetch.timer)
          // The tlo phase is a best-effort enrichment on top of an already-loaded
          // config file (e.g. firmware rejects $# with error:8 when not Idle/Alarm) —
          // don't report it as a config load failure.
          const wasTloPhase = _fetch.phase === 'tlo'
          _fetch = null
          if (!wasTloPhase) {
            broadcastPatch([pushToast({ id: `fw-cfg-err-${Date.now()}`, type: 'warning', message: 'Failed to read firmware configuration file', timeout: 4000 })])
          }
        }
        break
      }
      if (ev.line) broadcastPatch([pushConsole({ type: 'recv', text: ev.line, ts: Date.now() })])
      // error:N is a rejected-command acknowledgement — counts as an ack
      if (ev.line.startsWith('error:')) {
        onOk()
        onJogOk()
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
      if (_fetch) {
        _onFetchOk().catch((err) => console.error('[ws] _onFetchOk error:', err))
        break
      }
      onOk()
      onJogOk()
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
    const cookieHeader = peer.request?.headers?.get?.('cookie') ?? ''
    const runtimeConfig = useRuntimeConfig()
    const token = parseCookie(cookieHeader, 'fs_session')

    const config = await getConfig()
    const authEnabled = config.auth?.enabled ?? false

    let session: SessionPayload
    if (!authEnabled) {
      session = { userId: 'local', username: 'local', role: 'admin' }
    } else {
      const verified = token ? await verifySession(token, runtimeConfig.jwtSecret as string) : null
      if (!verified) {
        peer.send(JSON.stringify({ t: 'auth:required' }))
        peer.close()
        return
      }
      session = verified
    }

    peerSessions.set(peer.id, session)
    registerPeer(peer)

    try {
      peer.send(JSON.stringify({
        t: 'snapshot',
        payload: { ...getSnapshot(), authEnabled, session: { username: session.username, role: session.role } },
      }))
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

      // ── Firmware config reload ────────────────────────────────────────────
      case 'machine:firmware:reload': {
        if (!requireRole(peer, 'operator')) break
        if (!machineConnection.isConnected) {
          broadcastPatch([pushToast({ id: `fw-reload-nc-${Date.now()}`, type: 'error', message: 'Not connected to machine', timeout: 4000 })])
          break
        }
        console.log('[ws] manual firmware config reload requested')
        _startConfigFetch(true)
        broadcastPatch([pushToast({ id: `fw-reload-${Date.now()}`, type: 'info', message: 'Loading firmware configuration…', timeout: 3000 })])
        break
      }

      // ── Firmware update check (manual, bypasses the once-a-day gate) ───────
      case 'machine:checkFirmwareUpdate': {
        if (!requireRole(peer, 'operator')) break
        const { machineId: fwMachineId } = msg.payload as { machineId: string }
        const config = await getConfig()
        const machines = (config.machines ?? []) as Array<Record<string, unknown>>
        const fwMachine = machines.find((m) => m.id === fwMachineId)
        if (!fwMachine) break
        const result = await getLatestGithubRelease('bdring', 'FluidNC')
        if ('error' in result) {
          broadcastPatch([pushToast({ id: `fw-update-err-${Date.now()}`, type: 'error', message: `Couldn't check for FluidNC updates: ${result.error}`, timeout: 6000 })])
          break
        }
        fwMachine.firmwareUpdateCheck = { latestVersion: result.version, checkedAt: Date.now() }
        await setConfig(config)
        broadcastPatch([{ path: 'config', set: stripAuthSecrets(config) as unknown as Record<string, unknown> }])
        break
      }

      // ── FluidSender app update check (day-gated unless forced) ─────────────
      case 'app:checkVersion': {
        const { force } = (msg.payload as { force?: boolean } | undefined) ?? {}
        const cached = getAppUpdateCheck()
        if (!force && cached.checkedAt && isSameCalendarDay(cached.checkedAt, Date.now())) break
        const result = await getLatestGithubRelease('ahedderich', 'fluidSender')
        if ('error' in result) {
          if (force) broadcastPatch([pushToast({ id: `app-update-err-${Date.now()}`, type: 'error', message: `Couldn't check for FluidSender updates: ${result.error}`, timeout: 6000 })])
          break
        }
        const op = await setAppUpdateCheck({ latestVersion: result.version, checkedAt: Date.now() })
        broadcastPatch([op])
        break
      }

      // ── Machine connection ────────────────────────────────────────────────
      case 'machine:connect': {
        if (!requireRole(peer, 'operator')) break
        const { machineId } = msg.payload as { machineId: string }
        const config = await getConfig()
        setConnection({ machineId })
        machineConnection.connect(machineId, config.machines ?? []).catch((err: unknown) => {
          console.error('[ws] bridge connect error:', err)
        })
        break
      }
      case 'machine:disconnect':
        if (!requireRole(peer, 'operator')) break
        machineConnection.disconnect()
        break
      case 'machine:command': {
        if (!requireRole(peer, 'operator')) break
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
        if (!requireRole(peer, 'operator')) break
        const { bytes } = msg.payload as { bytes: number[] }
        for (const b of bytes) machineConnection.sendByte(b)
        break
      }

      // ── Jog ───────────────────────────────────────────────────────────────
      case 'machine:jog:move': {
        if (!requireRole(peer, 'operator')) break
        const { cmd } = msg.payload as { cmd: string }
        sendJog(cmd)
        break
      }
      case 'machine:jog:cancel':
        if (!requireRole(peer, 'operator')) break
        cancelJog()
        break

      // ── Sender control ────────────────────────────────────────────────────
      case 'sender:softStop':
        if (!requireRole(peer, 'operator')) break
        senderSoftStop((msg.payload as { chunkId?: string } | undefined)?.chunkId)
        break
      case 'sender:cycleStart':
        if (!requireRole(peer, 'operator')) break
        senderCycleStart((msg.payload as { chunkId?: string } | undefined)?.chunkId)
        break
      case 'sender:hardStop':
        if (!requireRole(peer, 'operator')) break
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
        if (!requireRole(peer, 'operator')) break
        jobRunner.abortAnalysis()
        break
      case 'job:start':
        if (!requireRole(peer, 'operator')) break
        jobRunner.start()
        break
      case 'job:pause':
        if (!requireRole(peer, 'operator')) break
        jobRunner.pause()
        break
      case 'job:resume':
        if (!requireRole(peer, 'operator')) break
        jobRunner.resume()
        break
      case 'job:stop':
        if (!requireRole(peer, 'operator')) break
        jobRunner.stop()
        break
      case 'job:emergency-stop':
        if (!requireRole(peer, 'operator')) break
        jobRunner.emergencyStop()
        break
      case 'job:cancel':
        if (!requireRole(peer, 'operator')) break
        jobRunner.emergencyStop()
        break
      case 'job:clear':
        if (!requireRole(peer, 'operator')) break
        jobRunner.clear()
        break
      case 'job:recover:confirm':
        if (!requireRole(peer, 'operator')) break
        jobRunner.confirmRecovery((msg.payload as { resumePtr: number }).resumePtr)
        break
      case 'job:recover:fresh':
        if (!requireRole(peer, 'operator')) break
        jobRunner.loadJobFresh().catch((err: unknown) => {
          console.error('[ws] loadJobFresh error:', err)
        })
        break
      case 'job:resumeToolChange':
        if (!requireRole(peer, 'operator')) break
        jobRunner.resumeAfterToolChange()
        break
      case 'job:resumeProgramPause':
        if (!requireRole(peer, 'operator')) break
        jobRunner.resumeFromProgramPause()
        break
      case 'job:setToolPreference': {
        if (!requireRole(peer, 'operator')) break
        const { toolNumber, scope } = msg.payload as { toolNumber: number; scope: 'M' | 'A' }
        jobRunner.setToolPreference(toolNumber, scope)
        break
      }

      case 'job:setTransformMode': {
        if (!requireRole(peer, 'operator')) break
        const { rotationActive, heightmapActive } = msg.payload as { rotationActive: boolean; heightmapActive: boolean }
        const mode = _modeFromFlags(rotationActive, heightmapActive)
        const ps = getProbingState()
        await jobRunner.setTransformMode(mode, ps.rotation, ps.heightmap)
        break
      }

      // ── Tool library ──────────────────────────────────────────────────────
      case 'tool:load': {
        if (!requireRole(peer, 'operator')) break
        const { toolNumber } = msg.payload as { toolNumber: number }
        jobRunner.runStandaloneToolchange(toolNumber, 'load').catch((e: unknown) => {
          console.error('[ws] tool:load error:', e)
        })
        break
      }
      case 'tool:unload': {
        if (!requireRole(peer, 'operator')) break
        jobRunner.runStandaloneToolchange(null, 'unload').catch((e: unknown) => {
          console.error('[ws] tool:unload error:', e)
        })
        break
      }
      case 'tool:measureOffset': {
        if (!requireRole(peer, 'operator')) break
        jobRunner.runStandaloneMeasure().catch((e: unknown) => {
          console.error('[ws] tool:measureOffset error:', e)
        })
        break
      }
      case 'toolchange:confirm': {
        if (!requireRole(peer, 'operator')) break
        jobRunner.resumeToolsetterProbe(jobRunner.status === 'tool_change').catch((e: unknown) => {
          console.error('[ws] toolchange:confirm error:', e)
        })
        break
      }
      case 'toolchange:resume': {
        if (!requireRole(peer, 'operator')) break
        jobRunner.finishToolchangeAndResume().catch((e: unknown) => {
          console.error('[ws] toolchange:resume error:', e)
        })
        break
      }
      case 'toolchange:reprobe': {
        if (!requireRole(peer, 'operator')) break
        jobRunner.runReprobe().catch((e: unknown) => {
          console.error('[ws] toolchange:reprobe error:', e)
        })
        break
      }
      case 'toolchange:setBaseline': {
        if (!requireRole(peer, 'operator')) break
        jobRunner.setProbedBaseline().catch((e: unknown) => {
          console.error('[ws] toolchange:setBaseline error:', e)
        })
        break
      }
      case 'toolchange:abort': {
        if (!requireRole(peer, 'operator')) break
        jobRunner.stop()
        break
      }
      case 'tool:magazineSlots:set': {
        if (!requireRole(peer, 'operator')) break
        const { slots } = msg.payload as { slots: (number | null)[] }
        const machineId = getConnection().machineId ?? ''
        updateMagazineSlots(machineId, slots).then((op) => broadcastPatch([op])).catch((e: unknown) => {
          console.error('[ws] tool:magazineSlots:set error:', e)
        })
        break
      }
      case 'tool:upsert': {
        if (!requireRole(peer, 'operator')) break
        const { machineId: mId, ...entry } = msg.payload as { machineId: string; [key: string]: unknown }
        toolStore.upsert(entry as unknown as Parameters<typeof toolStore.upsert>[0], mId).catch((e: unknown) => {
          console.error('[ws] tool:upsert error:', e)
        })
        break
      }
      case 'tool:delete': {
        if (!requireRole(peer, 'operator')) break
        const { id: tId, scope: tScope, machineId: tMachineId } = msg.payload as { id: string; scope: 'M' | 'A'; machineId: string }
        toolStore.delete(tId, tScope, tMachineId).catch((e: unknown) => {
          console.error('[ws] tool:delete error:', e)
        })
        break
      }
      case 'tool:import': {
        if (!requireRole(peer, 'operator')) break
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
        if (!requireRole(peer, 'operator')) break
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
      case 'ui:selection': {
        const sel = msg.payload as Parameters<typeof setSelection>[0]
        broadcastPatch([setSelection(sel)])
        if (sel.activeMachineId) {
          persistLastMachineId(sel.activeMachineId).catch((err) => console.error('[ws] persistLastMachineId error:', err))
        }
        break
      }
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
        if (!requireRole(peer, 'operator')) break
        const op = await setStock(msg.payload as StockDef)
        broadcastPatch([op])
        break
      }
      case 'ui:stock:clear': {
        if (!requireRole(peer, 'operator')) break
        const ops = await clearStock()
        broadcastPatch(ops)
        break
      }
      case 'ui:stock:clearMeasurements': {
        if (!requireRole(peer, 'operator')) break
        broadcastPatch([await clearMeasurements()])
        break
      }

      // ── Macros ────────────────────────────────────────────────────────────
      case 'macro:run': {
        if (!requireRole(peer, 'operator')) break
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
        if (!requireRole(peer, 'operator')) break
        macroRunner.abort()
        break

      // ── Probe calibration session ─────────────────────────────────────────
      case 'calibration:start':
        if (!requireRole(peer, 'operator')) break
        broadcastPatch([setCalibrationActive(true)])
        break
      case 'calibration:end':
        if (!requireRole(peer, 'operator')) break
        broadcastPatch([setCalibrationActive(false)])
        break

      // ── Probing ───────────────────────────────────────────────────────────
      case 'probing:start': {
        if (!requireRole(peer, 'operator')) break
        const { wizardKey, config: wzConfig, probeConfig, compensation } = msg.payload as {
          wizardKey: string
          config: Parameters<typeof probingRunner.startWizard>[1]
          probeConfig: ProbeConfig
          compensation?: ProbeCompensation
        }
        probingRunner.startWizard(wizardKey, wzConfig, probeConfig, compensation)
          .then(() => jobRunner.invalidateTransformCache().catch(() => {}))
          .catch((err: unknown) => {
            console.error('[ws] probing:start error:', err)
          })
        break
      }
      case 'probing:abort':
        if (!requireRole(peer, 'operator')) break
        probingRunner.abort()
        broadcastPatch([setCalibrationActive(false)])
        break
      case 'probing:continue':
        if (!requireRole(peer, 'operator')) break
        probingRunner.continue()
        break
      case 'probing:edge': {
        if (!requireRole(peer, 'operator')) break
        const { axis, direction, probeConfig: pConfig, buffer, compensation: pComp, noZero } = msg.payload as {
          axis: 'X' | 'Y' | 'Z'
          direction: '+' | '-'
          probeConfig: ProbeConfig
          buffer: number
          compensation?: ProbeCompensation
          noZero?: boolean
        }
        probingRunner.probeIndividualEdge(axis, direction, pConfig, buffer, pComp, noZero).catch((err: unknown) => {
          console.error('[ws] probing:edge error:', err)
        })
        break
      }
      case 'probing:setCenter': {
        if (!requireRole(peer, 'operator')) break
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
    peerSessions.delete(peer.id)
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
