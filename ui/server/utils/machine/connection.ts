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

  disconnect(): void {
    this.intentionalDisconnect = true
    this._destroySocket()
    this.emit('event', { type: 'disconnected', intentional: true } satisfies ConnectionEvent)
    this.intentionalDisconnect = false
  }

  private _handleLine(raw: string): void {
    const line = raw.trim()
    if (!line) return

    if (line.startsWith('<') && line.endsWith('>')) {
      this.emit('event', { type: 'statusLine', line } satisfies ConnectionEvent)
      return
    }

    if (line === 'ok') {
      this.emit('event', { type: 'ok' } satisfies ConnectionEvent)
      return
    }

    this.emit('event', { type: 'responseLine', line } satisfies ConnectionEvent)

    if (line.includes('[FluidNC') || line.startsWith('Grbl')) {
      // Version string parsed by caller via responseeLine event + parseGreetingVersion
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
