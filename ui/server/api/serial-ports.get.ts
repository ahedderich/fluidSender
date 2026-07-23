import { readdir } from 'node:fs/promises'
import { SerialPort } from 'serialport'

// Matches the same device names @serialport/bindings-cpp recognizes as serial ports.
const SERIAL_DEV_PATTERN = /(tty(S|WCH|ACM|USB|AMA|MFD|O|XRUSB)|rfcomm)/

function parseLabels(raw: string | undefined): Map<string, string> {
  const labels = new Map<string, string>()
  if (!raw) return labels
  for (const entry of raw.split(',')) {
    const [path, label] = entry.split(':')
    if (path?.trim() && label?.trim()) labels.set(path.trim(), label.trim())
  }
  return labels
}

export default defineEventHandler(async () => {
  const labels = parseLabels(process.env.FLUIDSENDER_SERIAL_LABELS)

  // Electron runs directly on the user's OS, not in a container with a curated
  // /dev, so it uses real device enumeration instead of the readdir approach below.
  if (process.env.FLUIDSENDER_RUNTIME === 'electron') {
    const ports = await SerialPort.list()
    return ports
      .map((p) => ({
        path: p.path,
        manufacturer: labels.get(p.path) ?? p.manufacturer ?? null,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  let entries: string[]
  try {
    entries = await readdir('/dev')
  } catch {
    return []
  }

  // Only devices explicitly passed through via docker-compose's `devices:`
  // show up here at all, so this list is already exactly what's connectable.
  return entries
    .filter((name) => SERIAL_DEV_PATTERN.test(name))
    .map((name) => `/dev/${name}`)
    .sort()
    .map((path) => ({
      path,
      manufacturer: labels.get(path) ?? null,
    }))
})
