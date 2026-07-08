import { probeEdge } from '../probing/probingRunner'
import { getLastMachineStatus } from './poller'
import { DEFAULT_PROBE_COMPENSATION } from '../tool/types'
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

  return probeEndZ - pos.toolsetterReferenceZ
}
