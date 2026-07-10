import type { SimTool } from '~/stores/sim'

/**
 * Trimmed Fusion 360 tool library import — same JSON schema FluidSender's UI
 * imports/exports (`{ data: [...] }`, geometry.DC/LB, post-process.number), but only
 * extracts the fields the simulator's physics need: number, name, diameter, and
 * shoulderLength (used as the tool's physical stickout for tool-setter contact math).
 */
export function parseFusion360Tools(data: unknown): SimTool[] {
  const root = data as Record<string, unknown>
  const items = (root['data'] ?? root['tools'] ?? []) as unknown[]

  const tools: SimTool[] = []
  for (const item of items) {
    const t = item as Record<string, unknown>
    const geom = (t['geometry'] ?? {}) as Record<string, unknown>
    const pp = (t['post-process'] ?? {}) as Record<string, unknown>

    const number = pp['number'] as number | undefined
    const diameter = geom['DC'] as number | undefined
    if (number === undefined || diameter === undefined) continue

    const type = (t['type'] as string | undefined) ?? 'end mill'
    const description = (t['description'] as string | undefined)?.trim()
    const name = description || `${type} ⌀${diameter}mm`

    tools.push({
      id: (t['guid'] as string | undefined) ?? crypto.randomUUID(),
      number,
      name,
      diameter,
      shoulderLength: (geom['LB'] as number | undefined) ?? 0,
    })
  }
  return tools
}
