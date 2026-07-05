import { Parser, type Value } from 'expr-eval'
import { parseMacro } from './macroParser'
import {
  broadcastPatch,
  pushConsole,
  pushToast,
  getConnection,
  getConfig,
  setMacroRunState,
  openProgramPauseModal,
  registerProgramPauseHandler,
} from '../appState'
import { getLastMachineStatus } from '../machine/poller'
import { sendGCode, senderHardStop } from '../machine/sender'
import { toolStore } from '../tool/toolStore'
import type { JobState } from '../gcode/types'

// ─── Exported types ──────────────────────────────────────────────────────────

export interface MacroVariable {
  id: string
  name: string
  type: 'number' | 'string' | 'boolean'
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

export interface TcVars {
  currentTool: number
  targetTool: number
  currentSlot: number
  targetSlot: number
  slots: Array<{ x: number; y: number; z: number }>
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ToolChangeModeError extends Error {
  constructor(prop: string) {
    super(`Variable 'tc.${prop}' requires active tool change mode`)
    this.name = 'ToolChangeModeError'
  }
}

export class MacroRuntimeError extends Error {
  constructor(
    public lineNum: number,
    message: string,
  ) {
    super(message)
    this.name = 'MacroRuntimeError'
  }
}

// ─── Persistent cross-macro global namespace ──────────────────────────────────
const globalVars: Record<string, unknown> = {}

// ─── expr-eval parser setup ───────────────────────────────────────────────────

const parser = new Parser({
  operators: {
    add: true,
    subtract: true,
    multiply: true,
    divide: true,
    remainder: true,
    power: true,
    comparison: true,
    logical: true,
    conditional: true,
    assignment: false,
    in: false,
  },
})

parser.functions['abs'] = Math.abs
parser.functions['sin'] = Math.sin
parser.functions['cos'] = Math.cos
parser.functions['sqrt'] = Math.sqrt
parser.functions['round'] = Math.round
parser.functions['floor'] = Math.floor
parser.functions['ceil'] = Math.ceil
parser.functions['min'] = Math.min
parser.functions['max'] = Math.max

// ─── Context ──────────────────────────────────────────────────────────────────

interface MacroContext {
  posx: number; posy: number; posz: number; posa: number
  mposx: number; mposy: number; mposz: number; mposa: number
  feed: number; spindleSpeed: number; spindleOn: boolean
  modal: { wcs: string; units: string; distance: string; feedrate: string; spindle: string }
  global: Record<string, unknown>
  tc: TcVars | object
  [key: string]: unknown
}

const TC_SENTINEL: object = new Proxy({} as Record<string | symbol, unknown>, {
  get(_target, prop) {
    throw new ToolChangeModeError(String(prop))
  },
})

// ─── Expression evaluation ────────────────────────────────────────────────────

function evalExpr(expr: string, ctx: MacroContext, lineNum: number): unknown {
  try {
    return parser.evaluate(expr, ctx as unknown as Value)
  } catch (err) {
    if (err instanceof ToolChangeModeError) throw err
    const msg = (err as Error).message
    throw new MacroRuntimeError(lineNum, `Expression error at line ${lineNum}: ${msg}\n  in: [${expr}]`)
  }
}

function resolveTemplate(template: string, ctx: MacroContext, lineNum: number): string {
  return template.replace(/\[([^\]]+)\]/g, (_match, expr: string) => {
    const val = evalExpr(expr.trim(), ctx, lineNum)
    if (val === undefined || val === null) {
      throw new MacroRuntimeError(
        lineNum,
        `Expression '[${expr}]' at line ${lineNum} evaluated to ${val}`,
      )
    }
    return String(val)
  })
}

// ─── Flush helper ─────────────────────────────────────────────────────────────

const WHILE_ITERATION_CAP = 10_000

async function flushLines(lines: string[]): Promise<void> {
  if (lines.length === 0) return
  await new Promise<void>((resolve, reject) => {
    let m0Handled = false
    const handle = sendGCode(lines, (ev) => {
      // Reset guard once machine leaves Hold (after cycle-start resumes it)
      if (m0Handled && ev.holdPhase === null) {
        m0Handled = false
      }

      if (ev.holdPhase === 0 && ev.holdReason === 'program' && !m0Handled) {
        m0Handled = true
        const { id, op } = openProgramPauseModal(null)
        broadcastPatch([op])
        registerProgramPauseHandler(id, (action) => {
          if (action === 'continue') {
            handle.cycleStart()
          } else {
            handle.hardStop()
            reject(new MacroRuntimeError(0, 'Macro aborted at M0 program pause'))
          }
        })
        return
      }

      if (ev.status === 'completed') {
        if (ev.completedMode === 'success') resolve()
        else
          reject(
            new MacroRuntimeError(0, `Macro send error: ${ev.errorReason ?? 'unknown'}`),
          )
      }
    })
  })
}

// ─── Internal node type matching macroParser output ──────────────────────────

interface GcodeNode { kind: 'gcode'; line: string; lineNum: number }
interface AssignNode { kind: 'assign'; varName: string; expr: string; lineNum: number }
interface SubstNode { kind: 'subst'; template: string; lineNum: number }
interface WaitNode { kind: 'wait'; lineNum: number }
interface MsgNode { kind: 'msg'; text: string; lineNum: number }
interface IfNode {
  kind: 'if'
  condition: string
  then: AnyNode[]
  elseIfs: { condition: string; body: AnyNode[] }[]
  else_: AnyNode[] | null
  lineNum: number
}
interface WhileNode { kind: 'while'; condition: string; body: AnyNode[]; lineNum: number }
type AnyNode = GcodeNode | AssignNode | SubstNode | WaitNode | MsgNode | IfNode | WhileNode

// ─── Node executor ────────────────────────────────────────────────────────────

async function executeNodes(
  nodes: AnyNode[],
  ctx: MacroContext,
  queue: string[],
  abortCheck: () => boolean,
): Promise<void> {
  for (const node of nodes) {
    if (abortCheck()) return

    switch (node.kind) {
      case 'gcode':
        queue.push(node.line)
        break

      case 'subst':
        queue.push(resolveTemplate(node.template, ctx, node.lineNum))
        break

      case 'assign': {
        const val = evalExpr(node.expr, ctx, node.lineNum)
        ctx[node.varName] = val
        break
      }

      case 'wait': {
        const captured = queue.splice(0)
        await flushLines(captured)
        break
      }

      case 'msg':
        broadcastPatch([pushConsole({ type: 'info', text: node.text, ts: Date.now() })])
        break

      case 'if': {
        const cond = evalExpr(node.condition, ctx, node.lineNum)
        if (typeof cond !== 'boolean') {
          throw new MacroRuntimeError(
            node.lineNum,
            `Line ${node.lineNum}: '%if' condition evaluated to non-boolean value: ${cond} (${typeof cond})`,
          )
        }
        if (cond) {
          await executeNodes(node.then, ctx, queue, abortCheck)
        } else {
          let handled = false
          for (const elseIf of node.elseIfs) {
            const eic = evalExpr(elseIf.condition, ctx, node.lineNum)
            if (eic) {
              await executeNodes(elseIf.body, ctx, queue, abortCheck)
              handled = true
              break
            }
          }
          if (!handled && node.else_) {
            await executeNodes(node.else_, ctx, queue, abortCheck)
          }
        }
        break
      }

      case 'while': {
        let iterations = 0
        while (true) {
          if (abortCheck()) return
          const cond = evalExpr(node.condition, ctx, node.lineNum)
          if (!cond) break
          if (++iterations > WHILE_ITERATION_CAP) {
            throw new MacroRuntimeError(
              node.lineNum,
              `%while loop at line ${node.lineNum} exceeded maximum iteration count (10000). Check for infinite loops.`,
            )
          }
          await executeNodes(node.body, ctx, queue, abortCheck)
        }
        break
      }
    }
  }
}

// ─── Build TcVars from live state ─────────────────────────────────────────────

export async function buildTcContext(jobState: JobState, machineId: string): Promise<TcVars | null> {
  try {
    const config = await getConfig()
    const machines = (config.machines ?? []) as Array<{
      id: string
      toolchange?: { magazineSlots?: (number | null)[] }
    }>
    const machine = machines.find((m) => m.id === machineId)
    const tc = machine?.toolchange
    const magazineSlots: (number | null)[] = (tc && 'magazineSlots' in tc) ? (tc.magazineSlots ?? []) : []

    const targetTool = jobState.toolChangeRequest?.toolNumber ?? 0
    const currentTool = 0
    const currentSlot = magazineSlots.findIndex((n) => n === currentTool) + 1
    const targetSlot = magazineSlots.findIndex((n) => n === targetTool) + 1

    return {
      currentTool,
      targetTool,
      currentSlot,
      targetSlot,
      slots: magazineSlots.map(() => ({ x: 0, y: 0, z: 0 })),
    }
  } catch {
    return null
  }
}

// ─── MacroRunner ──────────────────────────────────────────────────────────────

export class MacroRunner {
  private _aborted = false

  abort(): void {
    this._aborted = true
  }

  async run(
    macro: Macro,
    formValues: Record<string, string>,
    tcContext: TcVars | null,
  ): Promise<void> {
    this._aborted = false

    const { nodes } = parseMacro(macro.gcode)
    const status = getLastMachineStatus()

    const ctx: MacroContext = {
      posx: status?.wpos.x ?? 0,
      posy: status?.wpos.y ?? 0,
      posz: status?.wpos.z ?? 0,
      posa: status?.wpos.a ?? 0,
      mposx: status?.mpos.x ?? 0,
      mposy: status?.mpos.y ?? 0,
      mposz: status?.mpos.z ?? 0,
      mposa: status?.mpos.a ?? 0,
      feed: status?.feed ?? 0,
      spindleSpeed: status?.spindleSpeed ?? 0,
      spindleOn: status?.spindleOn ?? false,
      modal: {
        wcs: 'G54',
        units: 'G21',
        distance: 'G90',
        feedrate: 'G94',
        spindle: 'M5',
      },
      global: globalVars,
      tc: tcContext ?? TC_SENTINEL,
    }

    // Inject form variable values
    if (macro.trigger.kind === 'form') {
      for (const variable of macro.trigger.variables) {
        const raw = formValues[variable.name] ?? variable.default
        if (variable.type === 'number') ctx[variable.name] = Number(raw)
        else if (variable.type === 'boolean') ctx[variable.name] = raw === 'true'
        else ctx[variable.name] = raw
      }
    }

    const queue: string[] = []
    try {
      await executeNodes(nodes as unknown as AnyNode[], ctx, queue, () => this._aborted)
      await flushLines(queue.splice(0))
      broadcastPatch([setMacroRunState(null)])
    } catch (err) {
      const conn = getConnection()
      if (conn.connected) senderHardStop()
      const message = (err as Error).message
      broadcastPatch([
        setMacroRunState({
          status: 'error',
          macroId: macro.id,
          macroName: macro.name,
          errorMessage: message,
        }),
        pushConsole({ type: 'error', text: `Macro '${macro.name}' error: ${message}`, ts: Date.now() }),
        pushToast({
          id: `macro-error-${Date.now()}`,
          type: 'error',
          message: `Macro '${macro.name}' failed: ${message}`,
          timeout: 0,
        }),
      ])
      throw err
    }
  }
}

export const macroRunner = new MacroRunner()
