import type { MachineStatus } from './types'

// WCO is only included in status reports periodically; cache the last seen value
let cachedWco = { x: 0, y: 0, z: 0, a: 0 }

export function resetWco() {
  cachedWco = { x: 0, y: 0, z: 0, a: 0 }
}

// Ov: is likewise only included periodically (every ~20 status reports while running,
// ~10 while idle — see FluidNC's report_ovr_counter/REPORT_OVR_REFRESH_*_COUNT). Reports
// without it must keep the last known percentages, not silently reset to 100.
let cachedOverrides = { feed: 100, rapid: 100, spindle: 100 }

export function resetOverrides() {
  cachedOverrides = { feed: 100, rapid: 100, spindle: 100 }
}

/**
 * Parse one FluidNC status line `<State|MPos:x,y,z|WCO:x,y,z|FS:f,s|Buf:p,r|Ov:f,r,s|Pn:...|A:...>`
 * into a MachineStatus. Returns null for non-status lines.
 */
export function parseStatusLine(line: string): MachineStatus | null {
  const text = line.trim()
  if (!text.startsWith('<') || !text.endsWith('>')) return null
  const parts = text.slice(1, -1).split('|')
  if (parts.length < 2) return null

  // State can be "Hold:0", "Alarm:1", "Idle", etc. — normalise to capitalised base.
  const statePart = parts[0] ?? 'Idle'
  const colonIdx = statePart.indexOf(':')
  const rawStateName = colonIdx >= 0 ? statePart.slice(0, colonIdx) : statePart
  const state = normaliseState(rawStateName)
  const holdPhase: 0 | 1 | null = state === 'Hold' && colonIdx >= 0
    ? (Number(statePart.slice(colonIdx + 1)) as 0 | 1)
    : null

  let mpos = { x: 0, y: 0, z: 0, a: undefined as number | undefined }
  let newWco: { x: number; y: number; z: number; a: number } | null = null
  let feed = 0
  let spindleSpeed = 0
  let bufPlanner = 0
  let bufRx = 0
  let bufferReported = false
  let newOverrides: { feed: number; rapid: number; spindle: number } | null = null
  let pnStr = ''
  let accStr = ''

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]!
    if (p.startsWith('MPos:')) {
      const c = p.slice(5).split(',').map(Number)
      mpos = { x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0, a: c[3] }
    } else if (p.startsWith('WPos:')) {
      // WPos variant — back-calculate mpos from cached WCO
      const c = p.slice(5).split(',').map(Number)
      const wp = { x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0, a: c[3] }
      mpos = {
        x: wp.x + cachedWco.x,
        y: wp.y + cachedWco.y,
        z: wp.z + cachedWco.z,
        a: wp.a !== undefined ? wp.a + cachedWco.a : undefined,
      }
    } else if (p.startsWith('WCO:')) {
      const c = p.slice(4).split(',').map(Number)
      newWco = { x: c[0] ?? 0, y: c[1] ?? 0, z: c[2] ?? 0, a: c[3] ?? 0 }
    } else if (p.startsWith('FS:')) {
      const fs = p.slice(3).split(',').map(Number)
      feed = fs[0] ?? 0
      spindleSpeed = fs[1] ?? 0
    } else if (p.startsWith('F:')) {
      feed = Number(p.slice(2))
    } else if (p.startsWith('Bf:') || p.startsWith('Buf:')) {
      // FluidNC firmware emits "Bf:", simulator legacy emits "Buf:" — accept both
      const b = p.slice(p.indexOf(':') + 1).split(',').map(Number)
      bufPlanner = b[0] ?? 0
      bufRx = b[1] ?? 0
      bufferReported = true
    } else if (p.startsWith('Ov:')) {
      const ov = p.slice(3).split(',').map(Number)
      newOverrides = { feed: ov[0] ?? 100, rapid: ov[1] ?? 100, spindle: ov[2] ?? 100 }
    } else if (p.startsWith('Pn:')) {
      pnStr = p.slice(3)
    } else if (p.startsWith('A:')) {
      accStr = p.slice(2)
    }
  }

  if (newWco) cachedWco = newWco
  if (newOverrides) cachedOverrides = newOverrides

  const wco = { ...cachedWco }
  const wpos = {
    x: mpos.x - cachedWco.x,
    y: mpos.y - cachedWco.y,
    z: mpos.z - cachedWco.z,
    ...(mpos.a !== undefined ? { a: mpos.a - cachedWco.a } : {}),
  }

  const AXIS_NAMES = ['X', 'Y', 'Z', 'A', 'B', 'C'] as const
  const limitSwitches: MachineStatus['limitSwitches'] = []
  for (const axis of AXIS_NAMES) {
    if (pnStr.includes(axis)) limitSwitches.push({ name: axis, triggered: true })
  }

  const probe = pnStr.includes('P')
  const toolsetter = pnStr.includes('T')
  const door = pnStr.includes('D')

  const spindleOn = accStr.includes('S') || accStr.includes('C')
  const coolantMist = accStr.includes('M')
  const coolantFlood = accStr.includes('F')

  const mposOut = mpos.a !== undefined
    ? { x: mpos.x, y: mpos.y, z: mpos.z, a: mpos.a }
    : { x: mpos.x, y: mpos.y, z: mpos.z }

  return {
    state,
    holdPhase,
    mpos: mposOut,
    wpos,
    wco,
    feed,
    spindleSpeed,
    buffer: { planner: bufPlanner, rx: bufRx },
    bufferReported,
    overrides: { ...cachedOverrides },
    limitSwitches,
    probe,
    toolsetter,
    door,
    spindleOn,
    coolantMist,
    coolantFlood,
  }
}

function normaliseState(raw: string): MachineStatus['state'] {
  const upper = raw.toUpperCase()
  if (upper === 'IDLE') return 'Idle'
  if (upper === 'RUN') return 'Run'
  if (upper === 'HOLD') return 'Hold'
  if (upper === 'JOG') return 'Jog'
  if (upper === 'ALARM') return 'Alarm'
  if (upper === 'DOOR') return 'Door'
  if (upper === 'CHECK') return 'Check'
  if (upper === 'HOME') return 'Home'
  if (upper === 'SLEEP') return 'Sleep'
  return 'Idle'
}

export function parseGreetingVersion(line: string): string | null {
  const m = line.match(/FluidNC\s+v([\d.]+(?:\.\d+)*)/)
  if (m) return m[1]!.trim()
  const m2 = line.match(/Grbl\s+([\d.]+)/)
  return m2 ? m2[1]!.trim() : null
}

/** Parse a $G modal state response line like `[GC:G0 G54 G17 G21 G90 M5 M9 T0 F0 S0]` */
export function parseGQueryResponse(line: string): Partial<{
  positionMode: 'G90' | 'G91'
  workCoordinate: 'G54' | 'G55' | 'G56' | 'G57' | 'G58' | 'G59'
  spindleMode: 'M3' | 'M4' | 'M5'
  coolant: 'M7' | 'M8' | 'M9' | 'off'
  units: 'G20' | 'G21'
  plane: 'G17' | 'G18' | 'G19'
  feedRate: number
  spindleSpeed: number
  toolNumber: number
}> | null {
  const m = line.match(/\[GC:([^\]]+)\]/)
  if (!m) return null
  const tokens = m[1]!.toUpperCase().split(/\s+/)

  const result: ReturnType<typeof parseGQueryResponse> = {}

  for (const t of tokens) {
    if (t === 'G90') result!.positionMode = 'G90'
    else if (t === 'G91') result!.positionMode = 'G91'
    else if (t === 'G54') result!.workCoordinate = 'G54'
    else if (t === 'G55') result!.workCoordinate = 'G55'
    else if (t === 'G56') result!.workCoordinate = 'G56'
    else if (t === 'G57') result!.workCoordinate = 'G57'
    else if (t === 'G58') result!.workCoordinate = 'G58'
    else if (t === 'G59') result!.workCoordinate = 'G59'
    else if (t === 'M3') result!.spindleMode = 'M3'
    else if (t === 'M4') result!.spindleMode = 'M4'
    else if (t === 'M5') result!.spindleMode = 'M5'
    else if (t === 'M7') result!.coolant = 'M7'
    else if (t === 'M8') result!.coolant = 'M8'
    else if (t === 'M9') result!.coolant = 'off'
    else if (t === 'G17') result!.plane = 'G17'
    else if (t === 'G18') result!.plane = 'G18'
    else if (t === 'G19') result!.plane = 'G19'
    else if (t === 'G20') result!.units = 'G20'
    else if (t === 'G21') result!.units = 'G21'
    else if (t.startsWith('F')) result!.feedRate = Number(t.slice(1))
    else if (t.startsWith('S')) result!.spindleSpeed = Number(t.slice(1))
    else if (t.startsWith('T')) result!.toolNumber = Number(t.slice(1))
  }

  return result
}
