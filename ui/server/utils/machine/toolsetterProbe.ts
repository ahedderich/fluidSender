import { probeEdge } from '../probing/probingRunner'
import { getLastMachineStatus } from './poller'
import { DEFAULT_PROBE_COMPENSATION } from '../tool/types'
import { getToolsetterBaseline, setToolsetterBaseline } from './toolLengthState'
import type { ToolsetterConfig } from '../../../shared/toolchange'

export async function runToolsetterProbe(pos: ToolsetterConfig): Promise<number> {
  const status = getLastMachineStatus()
  const wco = { x: 0, y: 0, z: status?.mpos.z ?? 0 }

  await probeEdge(
    'Z',
    '-',
    pos.probeDistance,
    pos.probeConfig,
    DEFAULT_PROBE_COMPENSATION,
    wco,
    () => false,
  )

  const finalStatus = getLastMachineStatus()
  const probeEndZ = finalStatus?.mpos.z ?? 0

  const baseline = getToolsetterBaseline()
  if (baseline === null) {
    // First toolsetter probe this session — the tool loaded right now becomes the
    // reference every later probe is measured against (see toolLengthState.ts).
    setToolsetterBaseline(probeEndZ)
    return 0
  }

  return probeEndZ - baseline
}
