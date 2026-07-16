import {
  broadcastPatch,
  setJobState,
  getConfig,
  setToolChangeModeActive,
  openToolchangeModal,
  updateToolchangeModal,
  resolveModal,
  registerToolchangeResolveHandler,
  unregisterToolchangeResolveHandler,
  setLoadedTool,
  getLoadedToolForMachine,
  getConnection,
  setConnection,
  pushToast,
  setTolBaseline,
  type ToolchangeModalProps,
} from '../appState'
import { getLastMachineStatus } from '../machine/poller'
import { sendGCode } from '../machine/sender'
import { setMode } from '../machine/machineMode'
import { buildToolchangePositionSequence, buildToolsetterApproachSequence } from './toolchangeSequences'
import { runToolsetterProbe } from '../machine/toolsetterProbe'
import { setToolLengthOffset } from '../machine/toolLengthState'
import type { SendHandle } from '../machine/types'
import type { JobState, ToolSection } from './types'
import type { ToolchangeConfig, ToolsetterConfig } from '../../../shared/toolchange'
import { DEFAULT_TOOLCHANGE_CONFIG } from '../../../shared/toolchange'
import type { TcVars } from '../macro/macroRunner'

export async function getToolchangeConfig(): Promise<ToolchangeConfig> {
  try {
    const config = await getConfig() as { machines?: Array<{ id?: string; toolchange?: ToolchangeConfig }> }
    const machineId = getConnection().machineId
    const machine = machineId
      ? (config.machines?.find((m) => m.id === machineId) ?? config.machines?.[0])
      : config.machines?.[0]
    return machine?.toolchange ?? DEFAULT_TOOLCHANGE_CONFIG
  } catch {
    return DEFAULT_TOOLCHANGE_CONFIG
  }
}

/** Collaborator boundary with JobRunner — kept intentionally narrow. Toolchange sends
 *  share the same "one active send at a time" slot as the main job send (they're
 *  temporally exclusive, never both in flight), so stop()/emergencyStop() on JobRunner
 *  must be able to see and hard-stop whichever one is active — hence getSendHandle/
 *  setSendHandle instead of ToolchangeRunner owning an independent field. */
export interface ToolchangeRunnerDeps {
  getJobStatus: () => JobState['status']
  getSendHandle: () => SendHandle | null
  setSendHandle: (handle: SendHandle | null) => void
  setJobStatusToolChange: () => void
  /** skipBoundaryCommand: true when the T{n}/M6 line that opened this section must never
   *  reach the machine — used by the ATC-strategy magazine-missing-slot fallback (see
   *  _needsManualFallback), where forwarding it would hand an unassigned tool number to
   *  real ATC hardware. Other fallbacks (manual-basic, atc-managed's pending-engine
   *  fallback, custom-macro) have no hardware tied to that M6, so forwarding it afterward
   *  is harmless bookkeeping and skipBoundaryCommand stays false. */
  resumeAfterToolChange: (skipBoundaryCommand?: boolean) => void
}

class ToolchangeRunner {
  private deps: ToolchangeRunnerDeps

  // Pending toolchange completion — set by every strategy/context before it opens a
  // confirm dialog, runs a macro, or starts a probe, and consumed exactly once by
  // _completeToolchange() so every path updates loadedToolNumber the same way.
  private _pendingToolchange: {
    operation: 'load' | 'unload' | 'measure'
    toolNumber: number | null
    isJobContext: boolean
    requiresProbe: boolean
    skipBoundaryCommand?: boolean
  } | null = null

  // Toolsetter position governing the current pending probe — set whenever a probe-based
  // flow starts, whether that's the native manual-toolsetter strategy or an ATC strategy's
  // optional toolsetter used via the magazine-missing-slot fallback. resumeToolsetterProbe/
  // runReprobe read this instead of re-deriving it from tc.strategy, since a fallback's
  // pending probe doesn't belong to the 'manual-toolsetter' strategy.
  private _pendingToolsetterPos: ToolsetterConfig | null = null

  // Toolchange modal id (null when no toolchange dialog is open)
  private _toolchangeModalId: string | null = null

  // Raw machine-Z from the most recent toolsetter probe — kept only so a subsequent
  // "set as baseline" action can persist it without re-probing. Not used for offset math.
  private _lastProbeRawZ: number | null = null

  constructor(deps: ToolchangeRunnerDeps) {
    this.deps = deps
  }

  /** Reset pending toolchange state — used by JobRunner's stop()/emergencyStop(). */
  abort(): void {
    setToolChangeModeActive(false)
    this._pendingToolchange = null
    this._pendingToolsetterPos = null
  }

  /** True when the magazine is enabled but this tool has no assigned slot — the signal
   *  that an ATC strategy (or custom-macro) must not let its normal automated path run,
   *  since that path has no valid slot to hand to the hardware/macro. */
  private _needsManualFallback(tc: ToolchangeConfig, toolNumber: number): boolean {
    return tc.magazine.enabled && !tc.magazineSlots.includes(toolNumber)
  }

  /** Manual-swap fallback entered when an ATC strategy (or custom-macro) hits a toolchange
   *  for a tool with no magazine slot. Mirrors manual-basic/manual-toolsetter exactly —
   *  same dialog, same probe flow — the only difference is the caller marks
   *  skipBoundaryCommand for strategies where the file's own M6 line would otherwise
   *  reach real ATC hardware. */
  private _enterManualFallback(
    toolNumber: number,
    isJobContext: boolean,
    toolsetter: ToolsetterConfig | undefined,
    skipBoundaryCommand: boolean,
  ): void {
    if (toolsetter) {
      this._pendingToolchange = { operation: 'load', toolNumber, isJobContext, requiresProbe: true, skipBoundaryCommand }
      this._runToolsetterSequence(toolsetter, toolNumber, isJobContext)
    } else {
      this._pendingToolchange = { operation: 'load', toolNumber, isJobContext, requiresProbe: false, skipBoundaryCommand }
      this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: toolNumber, isJobContext })
    }
  }

  async enterJobToolChange(sectionIndex: number, section: ToolSection): Promise<void> {
    const tc = await getToolchangeConfig()

    const toolChangeRequest: NonNullable<JobState['toolChangeRequest']> = {
      sectionIndex,
      toolNumber: section.toolNumber,
      toolChangeType: section.toolChangeType ?? 'T',
      macroRunning: false,
      macroError: null,
    }

    this.deps.setJobStatusToolChange()
    setToolChangeModeActive(true)
    setMode('idle')
    broadcastPatch([setJobState({ status: 'tool_change', toolChangeRequest })])

    switch (tc.strategy) {
      case 'manual-basic':
        this._pendingToolchange = { operation: 'load', toolNumber: section.toolNumber, isJobContext: true, requiresProbe: false }
        this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: section.toolNumber, isJobContext: true })
        break

      case 'manual-toolsetter':
        this._pendingToolchange = { operation: 'load', toolNumber: section.toolNumber, isJobContext: true, requiresProbe: true }
        await this._runToolsetterSequence(tc.position, section.toolNumber, true)
        break

      case 'atc-passthrough':
      case 'atc-rapidchange':
        // Both strategies mean "FluidNC's own M6-triggered macro drives the swap" — the
        // only thing FluidSender must ever gate is handing that macro a tool with no
        // magazine slot, since the macro would act on an unassigned/wrong slot. If the
        // slot is fine, just let the boundary's own M6 line reach the firmware macro.
        if (this._needsManualFallback(tc, section.toolNumber)) {
          this._enterManualFallback(section.toolNumber, true, tc.toolsetter, true)
        } else {
          this.deps.resumeAfterToolChange()
        }
        break

      case 'atc-managed':
        if (this._needsManualFallback(tc, section.toolNumber)) {
          this._enterManualFallback(section.toolNumber, true, tc.toolsetter, false)
        } else {
          // Pending the GCode-generation engine reading tc.magazine.automation — no macro
          // exists for this strategy, so it falls back to a manual swap-confirm dialog,
          // same as manual-basic, until that engine lands. No ATC hardware is tied to the
          // file's M6 line in this mode, so forwarding it afterward (via resumeAfterToolChange's
          // default skipBoundaryCommand: false) is harmless bookkeeping either way.
          this._pendingToolchange = { operation: 'load', toolNumber: section.toolNumber, isJobContext: true, requiresProbe: false }
          this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: section.toolNumber, isJobContext: true })
        }
        break

      case 'custom-macro': {
        if (this._needsManualFallback(tc, section.toolNumber)) {
          // custom-macro has no toolsetter concept of its own — always the plain dialog.
          this._enterManualFallback(section.toolNumber, true, undefined, false)
        } else {
          this._pendingToolchange = { operation: 'load', toolNumber: section.toolNumber, isJobContext: true, requiresProbe: false }
          const tcVars = await this._buildTcVars(section.toolNumber, tc)
          this._runToolchangeMacro(tc.macro, toolChangeRequest, tcVars)
        }
        break
      }
    }
  }

  private _runToolchangeMacro(
    macro: string,
    toolChangeRequest: NonNullable<JobState['toolChangeRequest']>,
    tcVars: TcVars,
  ): void {
    if (!macro?.trim()) {
      // No macro — open dialog for user to confirm
      this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: toolChangeRequest.toolNumber, isJobContext: true })
      return
    }
    const macroLines = macro.split('\n').map((l) => this._substituteToolVars(l, tcVars)).filter(Boolean)
    broadcastPatch([setJobState({ toolChangeRequest: { ...toolChangeRequest, macroRunning: true } })])
    this.deps.setSendHandle(sendGCode(macroLines, (event) => {
      if (event.status !== 'completed') return
      this.deps.setSendHandle(null)
      if (event.completedMode === 'success') {
        broadcastPatch([setJobState({ toolChangeRequest: { ...toolChangeRequest, macroRunning: false, macroError: null } })])
        this._completeToolchange()
      } else {
        const errMsg = event.errorReason ?? 'Macro failed'
        broadcastPatch([setJobState({ toolChangeRequest: { ...toolChangeRequest, macroRunning: false, macroError: errMsg } })])
      }
    }))
  }

  private _substituteToolVars(line: string, vars: TcVars): string {
    return line
      .replace(/\{current_tool\}/g, String(vars.currentTool))
      .replace(/\{next_tool\}/g, String(vars.targetTool))
      .replace(/\{current_slot\}/g, String(vars.currentSlot))
      .replace(/\{next_slot\}/g, String(vars.targetSlot))
  }

  private _openToolchangeDialog(props: ToolchangeModalProps): void {
    if (this._toolchangeModalId) return
    const { id, op } = openToolchangeModal(props)
    this._toolchangeModalId = id
    registerToolchangeResolveHandler(id, () => {
      // Fires when the client resolves (closes) the modal — clears server-side stale state.
      if (this._toolchangeModalId === id) {
        this._toolchangeModalId = null
        this._pendingToolchange = null
      }
    })
    broadcastPatch([op])
  }

  private _updateToolchangeDialog(props: Partial<ToolchangeModalProps>): void {
    if (!this._toolchangeModalId) return
    const ops = updateToolchangeModal(this._toolchangeModalId, props)
    broadcastPatch(ops)
  }

  private _closeToolchangeDialog(): void {
    if (!this._toolchangeModalId) return
    const id = this._toolchangeModalId
    this._toolchangeModalId = null
    unregisterToolchangeResolveHandler(id)
    const op = resolveModal(id, 'resolved')
    if (op) broadcastPatch([op])
  }

  private _broadcastToolchangeError(message: string, isJobContext: boolean): void {
    this._updateToolchangeDialog({ phase: 'error', errorMessage: message })
    if (!isJobContext) return
    // Don't auto-abort job — let user use the dialog Abort button
  }

  private async _getActiveMachineId(): Promise<string | null> {
    return getConnection().machineId
  }

  private async _buildTcVars(
    nextToolNumber: number,
    tc: ToolchangeConfig,
  ): Promise<TcVars> {
    const machineId = await this._getActiveMachineId() ?? ''
    const currentTool = await getLoadedToolForMachine(machineId) ?? 0
    const slots = tc.magazineSlots

    const currentSlot = slots.findIndex((n: number | null) => n === currentTool) + 1
    const nextSlot = slots.findIndex((n: number | null) => n === nextToolNumber) + 1

    return {
      currentTool,
      targetTool: nextToolNumber,
      currentSlot,
      targetSlot: nextSlot,
      slots: slots.map(() => ({ x: 0, y: 0, z: 0 })),
    }
  }

  private async _runToolsetterSequence(
    pos: ToolsetterConfig,
    nextToolNumber: number,
    isJobContext: boolean,
  ): Promise<void> {
    this._pendingToolsetterPos = pos
    const parkSeq = buildToolchangePositionSequence(pos)
    this.deps.setSendHandle(sendGCode(parkSeq, (ev) => {
      if (ev.status !== 'completed') return
      this.deps.setSendHandle(null)
      if (ev.completedMode !== 'success') {
        this._broadcastToolchangeError('Failed to reach toolchange position', isJobContext)
        return
      }
      this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber, isJobContext, requiresProbe: true })
    }))
  }

  /** Consumes _pendingToolchange exactly once — the single place loadedToolNumber is
   *  updated for every strategy/context, so no completion path can forget to call it. */
  private _completeToolchange(): void {
    const pending = this._pendingToolchange
    this._pendingToolchange = null
    this._pendingToolsetterPos = null
    this._closeToolchangeDialog()
    if (pending && pending.operation !== 'measure') {
      this._getActiveMachineId().then((machineId) => {
        if (machineId) setLoadedTool(machineId, pending.toolNumber).then((op) => broadcastPatch([op])).catch(() => {})
      }).catch(() => {})
    }
    if (pending?.isJobContext) this.deps.resumeAfterToolChange(pending.skipBoundaryCommand)
  }

  /** Move to the toolsetter position, probe, and apply G43.1. Shared by the toolchange
   *  "load" flow (after the swap is confirmed) and the standalone measure-only flow.
   *  Completion (loaded-tool update, job resume) is decided by _completeToolchange()
   *  from the pending state, not by a parameter here. */
  private _runToolsetterProbeSequence(pos: ToolsetterConfig): void {
    const approachSeq = buildToolsetterApproachSequence(pos)
    this._updateToolchangeDialog({ phase: 'probing' })
    this.deps.setSendHandle(sendGCode(approachSeq, async (ev) => {
      if (ev.status !== 'completed') return
      this.deps.setSendHandle(null)
      if (ev.completedMode !== 'success') {
        this._updateToolchangeDialog({ phase: 'error', errorMessage: 'Failed to reach toolsetter position' })
        return
      }
      try {
        const { offset: probeResult, rawZ } = await runToolsetterProbe(pos)
        this._lastProbeRawZ = rawZ
        const toolHeight = probeResult + pos.zOffset
        await new Promise<void>((resolve, reject) => {
          sendGCode(
            [`G43.1 Z${toolHeight.toFixed(4)}`, `G53 G0 Z${pos.safeZ.toFixed(4)}`],
            (ev2) => {
              if (ev2.status !== 'completed') return
              if (ev2.completedMode === 'success') resolve()
              else reject(new Error('Failed to apply tool length offset'))
            },
          )
        })

        // We just commanded and confirmed this exact value — no need to round-trip
        // a $# query to know it, unlike the "on connect" case in ws.ts.
        setToolLengthOffset(toolHeight)
        broadcastPatch([{ path: 'connection', set: { ...setConnection({ toolLengthOffset: toolHeight }) } }])

        if (pos.confirmAfterProbe) {
          this._updateToolchangeDialog({ phase: 'probe_result', probedOffset: toolHeight })
        } else {
          this._completeToolchange()
        }
      } catch (err) {
        this._updateToolchangeDialog({ phase: 'error', errorMessage: (err as Error).message })
      }
    }))
  }

  async resumeToolsetterProbe(_isJobContext: boolean): Promise<void> {
    const pending = this._pendingToolchange
    if (!pending || !pending.requiresProbe || !this._pendingToolsetterPos) {
      this._completeToolchange()
      return
    }
    this._runToolsetterProbeSequence(this._pendingToolsetterPos)
  }

  async finishToolchangeAndResume(): Promise<void> {
    this._completeToolchange()
  }

  async runReprobe(): Promise<void> {
    const pending = this._pendingToolchange
    if (!pending?.requiresProbe || !this._pendingToolsetterPos) return
    this._runToolsetterProbeSequence(this._pendingToolsetterPos)
  }

  /** Persists the last probe's raw machine-Z as the new tolBaseline. Triggered from the
   *  Settings "TOL Baseline" row (not the toolchange dialog) — the intended flow is:
   *  zero the baseline, measure whichever tool/probe should become the new zero
   *  reference, then apply it here. This only updates the stored baseline value used
   *  for future offset math (rawZ - tolBaseline); it deliberately does NOT re-probe or
   *  resend G43.1, since the machine's current tool length offset already reflects the
   *  measurement that was just taken and must be left untouched. */
  async setProbedBaseline(): Promise<void> {
    if (this._lastProbeRawZ === null) {
      broadcastPatch([pushToast({
        id: `tc-baseline-${Date.now()}`,
        type: 'error',
        message: 'No tool measurement to apply yet — use "Measure Tool Offset" first, then apply it as the baseline',
        timeout: 4000,
      })])
      return
    }
    const tc = await getToolchangeConfig()
    if (tc.strategy !== 'manual-toolsetter') return
    const machineId = await this._getActiveMachineId()
    if (!machineId) return

    const patch = await setTolBaseline(machineId, this._lastProbeRawZ)
    broadcastPatch([
      patch,
      pushToast({ id: `tc-baseline-${Date.now()}`, type: 'success', message: 'TOL baseline updated', timeout: 4000 }),
    ])
  }

  async runStandaloneToolchange(targetToolNumber: number | null, operation: 'load' | 'unload'): Promise<void> {
    const busyStatuses: JobState['status'][] = ['running', 'pausing', 'stopping', 'recovering', 'tool_change']
    if (busyStatuses.includes(this.deps.getJobStatus()) || this._pendingToolchange) {
      broadcastPatch([pushToast({ id: `tc-busy-${Date.now()}`, type: 'error', message: 'Cannot change tool while a job or tool change is in progress', timeout: 4000 })])
      return
    }

    const tc = await getToolchangeConfig()

    switch (tc.strategy) {
      case 'manual-basic':
        this._pendingToolchange = { operation, toolNumber: operation === 'load' ? targetToolNumber : null, isJobContext: false, requiresProbe: false }
        this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: targetToolNumber, isJobContext: false, operation })
        break

      case 'manual-toolsetter':
        if (operation === 'load' && targetToolNumber !== null) {
          this._pendingToolchange = { operation: 'load', toolNumber: targetToolNumber, isJobContext: false, requiresProbe: true }
          await this._runToolsetterSequence(tc.position, targetToolNumber, false)
        } else if (operation === 'unload') {
          this._pendingToolchange = { operation: 'unload', toolNumber: null, isJobContext: false, requiresProbe: false }
          const parkSeq = buildToolchangePositionSequence(tc.position)
          this.deps.setSendHandle(sendGCode(parkSeq, (ev) => {
            if (ev.status !== 'completed' || ev.completedMode !== 'success') return
            this.deps.setSendHandle(null)
            this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: null, isJobContext: false, operation: 'unload' })
          }))
        }
        break

      case 'atc-passthrough':
      case 'atc-rapidchange':
        if (operation === 'load' && targetToolNumber !== null) {
          this._pendingToolchange = { operation: 'load', toolNumber: targetToolNumber, isJobContext: false, requiresProbe: false }
          this.deps.setSendHandle(sendGCode([`T${targetToolNumber}`, 'M6'], (ev) => {
            if (ev.status !== 'completed') return
            this.deps.setSendHandle(null)
            if (ev.completedMode === 'success') this._completeToolchange()
            else this._pendingToolchange = null
          }))
        } else if (operation === 'unload') {
          this._pendingToolchange = { operation: 'unload', toolNumber: null, isJobContext: false, requiresProbe: false }
          this._completeToolchange()
        }
        break

      case 'atc-managed':
        this._pendingToolchange = { operation, toolNumber: operation === 'load' ? targetToolNumber : null, isJobContext: false, requiresProbe: false }
        this._openToolchangeDialog({ phase: 'waiting_for_swap', currentToolNumber: null, nextToolNumber: targetToolNumber, isJobContext: false, operation })
        break

      case 'custom-macro': {
        const tn = targetToolNumber ?? 0
        const tcVars = await this._buildTcVars(tn, tc)
        this._pendingToolchange = { operation, toolNumber: operation === 'load' ? targetToolNumber : null, isJobContext: false, requiresProbe: false }
        this._runStandaloneMacro(tc.macro, tcVars)
        break
      }
    }
  }

  /** Standalone re-measure of the currently loaded tool's length offset — skips the
   *  toolchange-position park and swap-confirm dialog entirely, since no tool swap is
   *  involved; goes straight to the toolsetter approach + probe. Requires the machine
   *  to be Idle (i.e. homed) since the approach sequence moves in machine coordinates. */
  async runStandaloneMeasure(): Promise<void> {
    const busyStatuses: JobState['status'][] = ['running', 'pausing', 'stopping', 'recovering', 'tool_change']
    if (busyStatuses.includes(this.deps.getJobStatus()) || this._pendingToolchange) {
      broadcastPatch([pushToast({ id: `tc-not-idle-${Date.now()}`, type: 'error', message: 'Cannot measure tool offset while a job or tool change is in progress', timeout: 4000 })])
      return
    }

    const tc = await getToolchangeConfig()
    if (tc.strategy !== 'manual-toolsetter') return

    const status = getLastMachineStatus()
    if (!status || status.state !== 'Idle') {
      broadcastPatch([pushToast({ id: `tc-not-idle-${Date.now()}`, type: 'error', message: 'Machine must be homed and idle before measuring tool offset', timeout: 4000 })])
      return
    }

    const machineId = await this._getActiveMachineId()
    const currentToolNumber = machineId ? await getLoadedToolForMachine(machineId) : null

    this._pendingToolchange = { operation: 'measure', toolNumber: null, isJobContext: false, requiresProbe: true }
    this._pendingToolsetterPos = tc.position
    this._openToolchangeDialog({ phase: 'probing', currentToolNumber: null, nextToolNumber: currentToolNumber, isJobContext: false, operation: 'measure' })
    this._runToolsetterProbeSequence(tc.position)
  }

  private _runStandaloneMacro(macro: string, tcVars: TcVars): void {
    if (!macro?.trim()) {
      this._pendingToolchange = null
      return
    }
    const macroLines = macro.split('\n').map((l) => this._substituteToolVars(l, tcVars)).filter(Boolean)
    this.deps.setSendHandle(sendGCode(macroLines, (event) => {
      if (event.status !== 'completed') return
      this.deps.setSendHandle(null)
      if (event.completedMode === 'success') {
        this._completeToolchange()
      } else {
        this._pendingToolchange = null
      }
    }))
  }
}

export { ToolchangeRunner }
