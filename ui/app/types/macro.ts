export interface MacroVariable {
  id: string
  name: string
  type: 'number' | 'string' | 'boolean'
  required?: boolean
  default: string
  hint: string
}

export type MacroTrigger =
  | { kind: 'direct' }
  | { kind: 'confirm'; message?: string }
  | { kind: 'form'; variables: MacroVariable[] }

export interface Macro {
  id: string
  name: string
  trigger: MacroTrigger
  gcode: string
  requiresToolChange: boolean
}

export interface MacroRunState {
  status: 'running' | 'done' | 'error'
  macroId: string
  macroName: string
  errorMessage: string | null
}
