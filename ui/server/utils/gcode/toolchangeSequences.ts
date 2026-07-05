import type { ToolchangeSpatialConfig, ToolsetterConfig } from '../../../../shared/toolchange'

export function buildToolchangePositionSequence(pos: ToolchangeSpatialConfig): string[] {
  return [
    'M5',
    'G49',
    'G90',
    `G53 G0 Z${pos.safeZ.toFixed(4)}`,
    `G53 G0 X${pos.toolchangeX.toFixed(4)} Y${pos.toolchangeY.toFixed(4)}`,
    `G53 G0 Z${pos.toolchangeZ.toFixed(4)}`,
  ]
}

export function buildToolsetterApproachSequence(pos: ToolsetterConfig): string[] {
  return [
    `G53 G0 Z${pos.safeZ.toFixed(4)}`,
    `G53 G0 X${pos.toolsetterX.toFixed(4)} Y${pos.toolsetterY.toFixed(4)}`,
    `G53 G0 Z${pos.toolsetterApproachZ.toFixed(4)}`,
  ]
}
