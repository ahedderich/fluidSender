import net from 'node:net'
import { EventEmitter } from 'node:events'

export type ConnectionEvent =
  | { type: 'connected'; host: string; port: number }
  | { type: 'disconnected'; intentional: boolean }
  | { type: 'statusLine'; line: string }
  | { type: 'responseLine'; line: string }
  | { type: 'greeting'; version: string }
  | { type: 'alarm'; code: string }
  | { type: 'error'; message: string }
  | { type: 'ok' }
  | { type: 'probeLine'; mpos: { x: number; y: number; z: number; a?: number }; contact: boolean }

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

class MachineConnection extends EventEmitter {
  private socket: net.Socket | null = null
  private lineBuffer = ''
  private intentionalDisconnect = false
  // Suppress the terminating `ok` in firmware greeting sequences (not a command ack)
  private _suppressNextOk = false

  get isConnected(): boolean {
    return !!this.socket && !this.socket.destroyed
  }

  async connect(machineId: string, machines: unknown[]): Promise<void> {
    // Tear down existing connection cleanly
    this.intentionalDisconnect = true
    this._destroySocket()
    this.intentionalDisconnect = false

    const machine = (machines as MachineEntry[]).find((m) => m.id === machineId)
    if (!machine) {
      this.emit('event', {
        type: 'error',
        message: `Machine not found: ${machineId}`,
      } satisfies ConnectionEvent)
      return
    }

    const { connection } = machine

    if (connection.type === 'usb') {
      this.emit('event', {
        type: 'error',
        message: 'USB serial is not yet supported in the Node dev runtime. Use TCP or build for production.',
      } satisfies ConnectionEvent)
      return
    }

    const { tcpPort } = connection
    // FLUIDSENDER_TCP_HOST overrides configured host for Docker Compose environments
    const tcpHost = process.env.FLUIDSENDER_TCP_HOST || connection.tcpHost
    const sock = new net.Socket()
    this.socket = sock

    sock.on('connect', () => {
      this.emit('event', { type: 'connected', host: tcpHost, port: tcpPort } satisfies ConnectionEvent)
    })

    sock.on('data', (chunk: Buffer) => {
      this.lineBuffer += chunk.toString('utf8')
      const lines = this.lineBuffer.split('\n')
      this.lineBuffer = lines.pop() ?? ''
      for (const line of lines) this._handleLine(line)
    })

    sock.on('error', (err) => {
      console.error('[connection] TCP error:', err.message)
      this.emit('event', { type: 'error', message: err.message } satisfies ConnectionEvent)
      this.emit('event', { type: 'disconnected', intentional: false } satisfies ConnectionEvent)
      this._destroySocket()
    })

    sock.on('close', () => {
      if (this.intentionalDisconnect) return
      this._destroySocket()
      this.emit('event', { type: 'disconnected', intentional: false } satisfies ConnectionEvent)
    })

    // Force IPv4 — FluidNC ESP32 and its simulator listen on IPv4 only
    sock.connect({ port: tcpPort, host: tcpHost, family: 4 })
  }

  sendRaw(line: string): void {
    if (!this.socket || this.socket.destroyed) return
    const data = line.endsWith('\n') ? line : `${line}\n`
    this.socket.write(data)
  }

  // Send a single real-time control byte without a newline (e.g. 0x85 jog-cancel, 0x18 soft-reset)
  sendByte(byte: number): void {
    if (!this.socket || this.socket.destroyed) return
    this.socket.write(Buffer.from([byte]))
  }

  disconnect(): void {
    this.intentionalDisconnect = true
    this._destroySocket()
    this.emit('event', { type: 'disconnected', intentional: true } satisfies ConnectionEvent)
    this.intentionalDisconnect = false
  }

  private _handleLine(raw: string): void {
    const line = raw.trim()
    if (!line) return

    if (line.startsWith('[PRB:') && line.endsWith(']')) {
      const inner = line.slice(5, -1)
      const colonIdx = inner.lastIndexOf(':')
      const coords = inner.slice(0, colonIdx).split(',').map(Number)
      const contact = inner.slice(colonIdx + 1) === '1'
      this.emit('event', {
        type: 'probeLine',
        mpos: { x: coords[0] ?? 0, y: coords[1] ?? 0, z: coords[2] ?? 0, a: coords[3] },
        contact,
      } satisfies ConnectionEvent)
      return
    }

    if (line.startsWith('<') && line.endsWith('>')) {
      this.emit('event', { type: 'statusLine', line } satisfies ConnectionEvent)
      return
    }

    if (line === 'ok') {
      if (this._suppressNextOk) {
        this._suppressNextOk = false
        // Greeting's terminating ok — not a command ack; show in console but don't call onOk
        this.emit('event', { type: 'responseLine', line } satisfies ConnectionEvent)
        return
      }
      this.emit('event', { type: 'ok' } satisfies ConnectionEvent)
      return
    }

    this.emit('event', { type: 'responseLine', line } satisfies ConnectionEvent)

    // Firmware greeting banner — the ok that follows is firmware-ready, not a command ack
    if (line.startsWith('Grbl') || line.includes('[FluidNC')) {
      this._suppressNextOk = true
    }
    if (line.startsWith('ALARM:')) {
      const code = line.slice(6).trim()
      this.emit('event', { type: 'alarm', code } satisfies ConnectionEvent)
    }
  }

  private _destroySocket(): void {
    const s = this.socket
    this.socket = null
    this.lineBuffer = ''
    if (s && !s.destroyed) s.destroy()
  }
}

// Singleton instance shared across all server routes
export const machineConnection = new MachineConnection()
