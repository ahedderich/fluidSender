import { probeEdge } from '../probing/probingRunner'
import { getLastMachineStatus } from './poller'
import { DEFAULT_PROBE_COMPENSATION } from '../tool/types'
import type { ToolsetterConfig } from '../../../shared/toolchange'

export interface ToolsetterProbeResult {
  /** Tool length relative to pos.tolBaseline — what gets sent as the G43.1 Z value. */
  offset: number
  /** Raw machine-Z reading at probe trigger, for capturing as a new tolBaseline. */
  rawZ: number
}

export async function runToolsetterProbe(pos: ToolsetterConfig): Promise<ToolsetterProbeResult> {
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
  const rawZ = finalStatus?.mpos.z ?? 0

  return { offset: rawZ - pos.tolBaseline, rawZ }
}
