export const ROTATION_DEVIATION_REFERENCE_MM = 500

export function rotationDeviationAtReference(rotationDeg: number, referenceMm = ROTATION_DEVIATION_REFERENCE_MM): number {
  return referenceMm * Math.tan(rotationDeg * (Math.PI / 180))
}

export function rotationCorrectionHint(rotationDeg: number): string {
  if (rotationDeg === 0) return 'Stock is aligned'
  const direction = rotationDeg < 0 ? 'CCW' : 'CW'
  return `Rotate ${Math.abs(rotationDeg).toFixed(3)}° ${direction} to correct`
}
