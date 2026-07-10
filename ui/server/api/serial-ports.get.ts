import { readdir } from 'node:fs/promises'

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
  let entries: string[]
  try {
    entries = await readdir('/dev')
  } catch {
    return []
  }

  // Only devices explicitly passed through via docker-compose's `devices:`
  // show up here at all, so this list is already exactly what's connectable.
  const labels = parseLabels(process.env.FLUIDSENDER_SERIAL_LABELS)
  return entries
    .filter((name) => SERIAL_DEV_PATTERN.test(name))
    .map((name) => `/dev/${name}`)
    .sort()
    .map((path) => ({
      path,
      manufacturer: labels.get(path) ?? null,
    }))
})
