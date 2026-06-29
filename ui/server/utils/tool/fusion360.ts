import { randomUUID } from 'node:crypto'
import type { ToolLibraryEntry, CuttingPreset, ToolHolder } from './types'

// ─── Import ───────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function mapPreset(p: Record<string, unknown>): CuttingPreset {
  const params = (p['parameters'] ?? {}) as Record<string, unknown>
  const mat = (p['material'] ?? {}) as Record<string, unknown>
  return {
    guid: (p['guid'] as string | undefined) ?? randomUUID(),
    name: (p['name'] as string | undefined) ?? 'Unnamed',
    material: {
      category: (mat['category'] as string | undefined) ?? '',
      query: (mat['query'] as string | undefined) ?? '',
    },
    spindleRpm: ((params['n'] as Record<string, unknown> | undefined)?.['value'] as number | undefined) ?? 0,
    rampRpm: ((params['n_ramp'] as Record<string, unknown> | undefined)?.['value'] as number | undefined) ?? 0,
    feedRate: ((params['v_f'] as Record<string, unknown> | undefined)?.['value'] as number | undefined) ?? 0,
    feedPerTooth: ((params['f_z'] as Record<string, unknown> | undefined)?.['value'] as number | undefined) ?? 0,
    plungeFeed: ((params['v_f_plunge'] as Record<string, unknown> | undefined)?.['value'] as number | undefined) ?? 0,
    rampFeed: ((params['v_f_ramp'] as Record<string, unknown> | undefined)?.['value'] as number | undefined) ?? 0,
    rampAngle: ((params['ramp_angle'] as Record<string, unknown> | undefined)?.['value'] as number | undefined) ?? 0,
    coolant: (p['coolant'] as string | undefined) ?? 'disabled',
  }
}

function mapHolder(h: Record<string, unknown>): ToolHolder {
  const segs = (h['segments'] as unknown[] | undefined) ?? []
  return {
    guid: (h['guid'] as string | undefined) ?? randomUUID(),
    description: (h['description'] as string | undefined) ?? '',
    gaugeLength: ((h['parameters'] as Record<string, unknown> | undefined)?.['gauge_length'] as number | undefined) ?? 0,
    segments: segs.map((s) => {
      const seg = s as Record<string, unknown>
      return {
        height: (seg['height'] as number | undefined) ?? 0,
        lowerDiameter: (seg['lower_diameter'] as number | undefined) ?? 0,
        upperDiameter: (seg['upper_diameter'] as number | undefined) ?? 0,
      }
    }),
  }
}

export function mapFusion360ToTool(
  item: unknown,
  source: 'M' | 'A',
): ToolLibraryEntry | null {
  const t = item as Record<string, unknown>
  const geom = (t['geometry'] ?? {}) as Record<string, unknown>
  const pp = (t['post-process'] ?? {}) as Record<string, unknown>
  const sv = (t['start-values'] ?? {}) as Record<string, unknown>

  const number = pp['number'] as number | undefined
  if (number === undefined || typeof number !== 'number') return null

  const DC = geom['DC'] as number | undefined
  if (DC === undefined) return null

  const type = (t['type'] as string | undefined) ?? 'end mill'
  const description = (t['description'] as string | undefined)
  const name = description?.trim() || `${type} ⌀${DC}mm`

  const fluteCount = (geom['NOF'] as number | undefined) ?? (geom['NFP'] as number | undefined)

  const rawPresetsArr = sv['presets'] as unknown[] | undefined
  const cuttingPresets: CuttingPreset[] = (rawPresetsArr ?? [])
    .map((p) => mapPreset(p as Record<string, unknown>))

  const holderRaw = t['holder'] as Record<string, unknown> | undefined
  const holder = holderRaw ? mapHolder(holderRaw) : undefined

  return {
    id: (t['guid'] as string | undefined) ?? randomUUID(),
    number,
    name,
    type,
    vendor: (t['vendor'] as string | undefined) || undefined,
    productId: (t['product-id'] as string | undefined) || undefined,
    productLink: (t['product-link'] as string | undefined) || undefined,

    diameter: DC,
    shankDiameter: (geom['SFDM'] as number | undefined),
    cornerRadius: (geom['FUSP'] as number | undefined),
    fluteCount,
    fluteLength: (geom['LCF'] !== undefined) ? round1(geom['LCF'] as number) : undefined,
    shoulderLength: (geom['LB'] as number | undefined),
    overallLength: (geom['OAL'] as number | undefined) ?? (geom['OH'] as number | undefined),
    coolantThrough: (geom['CSP'] as boolean | undefined),
    rightHanded: (geom['HAND'] as boolean | undefined),

    lengthOffset: (pp['length-offset'] as number | undefined),
    diameterOffset: (pp['diameter-offset'] as number | undefined),
    manualToolChange: (pp['manual-tool-change'] as boolean | undefined),
    breakControl: (pp['break-control'] as boolean | undefined),
    material: (t['BMC'] as string | undefined) || undefined,

    cuttingPresets: cuttingPresets.length > 0 ? cuttingPresets : undefined,
    holder,

    source,
    totalRuntimeMinutes: 0,
    jobCount: 0,
  }
}

export function importFusion360Library(
  data: unknown,
  source: 'M' | 'A',
): { tools: ToolLibraryEntry[]; errors: number } {
  const root = data as Record<string, unknown>
  const libraryItems = (root['data'] ?? root['tools'] ?? []) as unknown[]

  let errors = 0
  const tools: ToolLibraryEntry[] = []
  for (const item of libraryItems) {
    const mapped = mapFusion360ToTool(item, source)
    if (mapped) tools.push(mapped)
    else errors++
  }
  return { tools, errors }
}

// ─── Export ───────────────────────────────────────────────────────────────────

function toolToFusion360Item(tool: ToolLibraryEntry): Record<string, unknown> {
  return {
    guid: tool.id,
    type: tool.type,
    description: tool.name,
    vendor: tool.vendor ?? '',
    'product-id': tool.productId ?? '',
    'product-link': tool.productLink ?? '',
    BMC: tool.material ?? '',
    geometry: {
      DC: tool.diameter,
      ...(tool.shankDiameter !== undefined ? { SFDM: tool.shankDiameter } : {}),
      ...(tool.cornerRadius !== undefined ? { FUSP: tool.cornerRadius } : {}),
      ...(tool.fluteCount !== undefined ? { NOF: tool.fluteCount } : {}),
      ...(tool.fluteLength !== undefined ? { LCF: tool.fluteLength } : {}),
      ...(tool.shoulderLength !== undefined ? { LB: tool.shoulderLength } : {}),
      ...(tool.overallLength !== undefined ? { OAL: tool.overallLength } : {}),
      ...(tool.coolantThrough !== undefined ? { CSP: tool.coolantThrough } : {}),
      ...(tool.rightHanded !== undefined ? { HAND: tool.rightHanded } : {}),
    },
    'post-process': {
      number: tool.number,
      ...(tool.lengthOffset !== undefined ? { 'length-offset': tool.lengthOffset } : {}),
      ...(tool.diameterOffset !== undefined ? { 'diameter-offset': tool.diameterOffset } : {}),
      ...(tool.manualToolChange !== undefined ? { 'manual-tool-change': tool.manualToolChange } : {}),
      ...(tool.breakControl !== undefined ? { 'break-control': tool.breakControl } : {}),
    },
    'start-values': {
      presets: tool.cuttingPresets ?? [],
    },
    ...(tool.holder ? { holder: tool.holder } : {}),
  }
}

export function buildFusion360Export(tools: ToolLibraryEntry[], version = 10): Record<string, unknown> {
  return {
    version,
    data: tools.map(toolToFusion360Item),
  }
}
