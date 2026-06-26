import net from 'node:net'
import { broadcastPatch, setConnection, pushConsole, pushToast } from './appState'

export interface TelemetryState {
  status: string
  machinePos: { x: number; y: number; z: number; a?: number }
  workPos: { x: number; y: number; z: number; a?: number }
  feed: number
  spindleSpeed: number
  limitSwitches: Array<{ name: string; triggered: boolean }>
  spindleOn: boolean
  coolantMist: boolean
  coolantFlood: boolean
}

interface MachineConnectionConfig {
  type: 'tcp' | 'usb'
  tcpHost: string
  tcpPort: number
  serialPort: string
  baudRate: number
}

interface MachineEntry {
  id: string
  connection: MachineConnectionConfig
}

// ─── Bridge singleton state ───────────────────────────────────────────────────

let socket: net.Socket | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let lineBuffer = ''
// Last WCO received — status responses only include WCO occasionally
let cachedWco = { x: 0, y: 0, z: 0, a: 0 }
// Prevent close-event handler from re-broadcasting after intentional disconnect
let intentionalDisconnect = false

function clearBridgeState() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  lineBuffer = ''
  cachedWco = { x: 0, y: 0, z: 0, a: 0 }
}

function destroySocket() {
  const s = socket
  socket = null
  if (s && !s.destroyed) s.destroy()
}

// ─── Protocol parsing ─────────────────────────────────────────────────────────

function parseGreetingVersion(line: string): string | null {
  const m = line.match(/\[FluidNC\s+v([^\]]+)\]/)
  if (m) return m[1].trim()
  const m2 = line.match(/Grbl\s+([\d.]+)/)
  return m2 ? m2[1].trim() : null
}

// Parse <State|MPos:x,y,z|WCO:x,y,z|FS:f,s|Pn:pins|A:acc>
function parseStatusLine(line: string): TelemetryState | null {
  if (!line.startsWith('<') || !line.endsWith('>')) return null
  const parts = line.slice(1, -1).split('|')
  if (parts.length < 2) return null

  // State can be "Hold:0", "Alarm:1", "Idle", etc. — normalise to uppercase base.
  const status = (parts[0].split(':')[0] ?? 'IDLE').toUpperCase()

  let machinePos = { x: 0, y: 0, z: 0, a: undefined as number | undefined }
  let newWco: typeof cachedWco | null = null
  let feed = 0
  let spindleSpeed = 0
  let pnStr = ''
  let accStr = ''

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]
    if (p.startsWith('MPos:')) {
      const c = p.slice(5).split(',').map(Number)
      machinePos = { x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0, a: c[3] }
    } else if (p.startsWith('WCO:')) {
      const c = p.slice(4).split(',').map(Number)
      newWco = { x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0, a: c[3] ?? 0 }
    } else if (p.startsWith('FS:')) {
      const fs = p.slice(3).split(',').map(Number)
      feed = fs[0] ?? 0; spindleSpeed = fs[1] ?? 0
    } else if (p.startsWith('Pn:')) {
      pnStr = p.slice(3)
    } else if (p.startsWith('A:')) {
      accStr = p.slice(2)
    }
  }

  if (newWco) cachedWco = newWco

  const workPos = {
    x: machinePos.x - cachedWco.x,
    y: machinePos.y - cachedWco.y,
    z: machinePos.z - cachedWco.z,
    ...(machinePos.a !== undefined ? { a: machinePos.a - cachedWco.a } : {}),
  }

  const limitSwitches: TelemetryState['limitSwitches'] = []
  if (pnStr.includes('X')) limitSwitches.push({ name: 'X-', triggered: true })
  if (pnStr.includes('Y')) limitSwitches.push({ name: 'Y-', triggered: true })
  if (pnStr.includes('Z')) limitSwitches.push({ name: 'Z-', triggered: true })
  if (pnStr.includes('A')) limitSwitches.push({ name: 'A-', triggered: true })
  // Probe pin "P" is not a limit switch; ignore here.

  const spindleOn = accStr.includes('S') || accStr.includes('C')
  const coolantMist = accStr.includes('M')
  const coolantFlood = accStr.includes('F')

  const pos = machinePos.a !== undefined
    ? { x: machinePos.x, y: machinePos.y, z: machinePos.z, a: machinePos.a }
    : { x: machinePos.x, y: machinePos.y, z: machinePos.z }

  return { status, machinePos: pos, workPos, feed, spindleSpeed, limitSwitches, spindleOn, coolantMist, coolantFlood }
}

// ─── Line handler ─────────────────────────────────────────────────────────────

function handleLine(line: string, machineId: string) {
  const text = line.trim()
  if (!text) return

  if (text.startsWith('<') && text.endsWith('>')) {
    const telem = parseStatusLine(text)
    if (telem) {
      broadcastPatch([{ path: 'telemetry', set: telem as unknown as Record<string, unknown> }])
    }
    return
  }

  // Only log non-status lines to the console (status is too noisy)
  broadcastPatch([pushConsole({ type: 'recv', text, ts: Date.now() })])

  if (text.includes('[FluidNC') || text.startsWith('Grbl')) {
    const ver = parseGreetingVersion(text)
    if (ver) {
      const next = setConnection({ firmwareVersion: ver })
      broadcastPatch([{ path: 'connection', set: { ...next } }])
    }
  } else if (text.startsWith('ALARM:')) {
    const next = setConnection({ status: 'ALARM' })
    broadcastPatch([{ path: 'connection', set: { ...next } }])
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function connect(machineId: string, machines: unknown[]): Promise<void> {
  // Clean up any existing connection first
  intentionalDisconnect = true
  destroySocket()
  clearBridgeState()
  intentionalDisconnect = false

  const machine = (machines as MachineEntry[]).find((m) => m.id === machineId)
  if (!machine) {
    broadcastPatch([pushConsole({ type: 'error', text: `Machine not found: ${machineId}`, ts: Date.now() })])
    return
  }

  const { connection } = machine

  if (connection.type === 'usb') {
    // USB serial requires Bun native serialport API — not available in Node dev runtime.
    const msg = 'USB serial is not yet supported in the Node dev runtime. Switch to TCP or build for production.'
    broadcastPatch([
      pushConsole({ type: 'error', text: msg, ts: Date.now() }),
      pushToast({ id: `usb-err-${Date.now()}`, type: 'error', message: msg, timeout: 6000 }),
    ])
    const next = setConnection({ machineId: null, connected: false, status: 'DISCONNECTED', firmwareVersion: '' })
    broadcastPatch([{ path: 'connection', set: { ...next } }])
    return
  }

  const { tcpPort } = connection
  // FLUIDSENDER_TCP_HOST overrides the configured host for Docker Compose environments
  // where "localhost" inside the ui container doesn't route to the sim container.
  // Set it to the Docker Compose service name (e.g. "sim") in docker-compose.yaml.
  const tcpHost = process.env.FLUIDSENDER_TCP_HOST || connection.tcpHost
  const sock = new net.Socket()
  socket = sock

  sock.on('connect', () => {
    const next = setConnection({ machineId, connected: true, status: 'IDLE', firmwareVersion: '' })
    broadcastPatch([
      { path: 'connection', set: { ...next } },
      pushConsole({ type: 'info', text: `TCP connected to ${tcpHost}:${tcpPort}`, ts: Date.now() }),
    ])
    // Poll status every 200 ms
    pollTimer = setInterval(() => {
      if (sock.writable && !sock.destroyed) sock.write('?\n')
    }, 200)
  })

  sock.on('data', (chunk: Buffer) => {
    lineBuffer += chunk.toString('utf8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''
    for (const line of lines) handleLine(line, machineId)
  })

  sock.on('error', (err) => {
    console.error('[bridge] TCP error:', err.message)
    const msg = `Connection failed: ${err.message}`
    const next = setConnection({ machineId: null, connected: false, status: 'DISCONNECTED', firmwareVersion: '' })
    broadcastPatch([
      { path: 'connection', set: { ...next } },
      pushConsole({ type: 'error', text: msg, ts: Date.now() }),
      pushToast({ id: `conn-err-${Date.now()}`, type: 'error', message: msg, timeout: 6000 }),
    ])
    clearBridgeState()
    socket = null
  })

  sock.on('close', () => {
    if (intentionalDisconnect) return
    clearBridgeState()
    socket = null
    const next = setConnection({ machineId: null, connected: false, status: 'DISCONNECTED', firmwareVersion: '' })
    broadcastPatch([
      { path: 'connection', set: { ...next } },
      pushConsole({ type: 'info', text: 'Connection closed by remote', ts: Date.now() }),
    ])
  })

  // Force IPv4 — the FluidNC ESP32 (and its simulator) only listens on IPv4,
  // and Node resolves "localhost" to ::1 on dual-stack systems.
  sock.connect({ port: tcpPort, host: tcpHost, family: 4 })
}

export function sendCommand(cmd: string) {
  if (!socket || socket.destroyed) return
  const line = cmd.endsWith('\n') ? cmd : `${cmd}\n`
  socket.write(line)
  broadcastPatch([pushConsole({ type: 'sent', text: cmd.trim(), ts: Date.now() })])
}

export function disconnect() {
  intentionalDisconnect = true
  destroySocket()
  clearBridgeState()
  const next = setConnection({ machineId: null, connected: false, status: 'DISCONNECTED', firmwareVersion: '' })
  broadcastPatch([
    { path: 'connection', set: { ...next } },
    pushConsole({ type: 'info', text: 'Disconnected', ts: Date.now() }),
  ])
  intentionalDisconnect = false
}
