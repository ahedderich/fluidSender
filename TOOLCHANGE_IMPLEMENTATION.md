# Toolchange Implementation Plan

## Overview

This document specifies all changes required to implement a configurable toolchange system in FluidSender. It is self-contained — do not rely on context outside this file for implementation.

The toolchange system replaces the existing flat `toolChangeMacro` string + root-level `magazine` config with a proper discriminated-union strategy model that covers five modes: manual basic, manual with toolsetter, ATC M6 passthrough, ATC FluidSender managed, and custom macro. The same strategy is triggered whether M6 appears in a job, a macro, or via the Load/Unload button in the Tool Management panel.

---

## What Exists Today (to remove or migrate)

### In `ui/app/stores/settings.ts` — `MachineProfile`
- `toolChangeMacro: string` — **remove**
- `probe: ProbeConfig` — **remove** (the `ProbeConfig` interface here has `plateThickness`, `toolSetterHeight`, `tipDiameter`, `xyFeed`, `zFeed` — these no longer have a home; tip diameter/feeds live on per-tool probe type in the tool library)
- `magazine: MagazineConfig` — **remove from root** (moves into the ATC/custom-macro strategy configs)

### In `ui/app/pages/settings.vue` — fluidSender machine tab
- "Probing" SettingsCard (lines 276–307) — **remove**
- "Tool Change Macro" SettingsCard (lines 262–274) — **remove**
- "Tool Magazine" SettingsCard (lines 157–168) — **remove**

### In `ui/server/utils/macro/macroRunner.ts`
- `buildTcContext()` — reads `machine.magazine?.size` from root of machine config — **update** to read from new `toolchange` config shape
- `TcVars.slots` — currently an array of `{x,y,z}` placeholders (all zero) — **update** to carry `toolNumber` mapping

### In `ui/server/utils/gcode/jobRunner.ts`
- `_getToolChangeMacro()` — reads `config.machines[0].toolChangeMacro` — **replace** with strategy-aware branching
- `_enterToolChangeMode()` — currently only runs the macro string — **replace** with full strategy dispatch

### In `ui/server/routes/ws.ts`
- `case 'tool:load'` — sends `T{n}` raw and updates loaded tool — **replace** with strategy-aware handler
- `case 'tool:unload'` — just clears loaded tool — **replace** with strategy-aware handler

---

## Data Model — New Types

All types below belong in `ui/app/stores/settings.ts`. The `ProbeConfig` imported into `ToolsetterConfig` is the **existing** interface from `ui/server/utils/tool/types.ts` (shared between client and server):

```typescript
// From ui/server/utils/tool/types.ts (already exists, no changes):
interface ProbeConfig {
  wiggleEnabled: boolean
  fastFeedMmPerMin: number
  slowFeedMmPerMin: number
  cycles: number
  averageN: number
}

// ─── New types ────────────────────────────────────────────────────────────────

export interface ToolchangeSpatialConfig {
  safeZ: number           // machine coord — Z clearance height for all XY rapid travel
  toolchangeX: number     // machine coord — spindle stops here for manual tool swap
  toolchangeY: number     // machine coord
  toolchangeZ: number     // machine coord — Z at toolchange position (usually 0 = fully retracted)
}

export interface ToolsetterConfig extends ToolchangeSpatialConfig {
  toolsetterX: number          // machine coord — XY position above toolsetter
  toolsetterY: number          // machine coord
  toolsetterApproachZ: number  // machine coord — Z to descend to before probing starts
  toolsetterReferenceZ: number // machine coord — calibrated Z of toolsetter surface
  probeDistance: number        // mm — max downward travel from approachZ before probe error
  probeConfig: ProbeConfig     // wiggle probe settings (same shape as per-tool probe type)
  zOffset: number              // ±mm trim applied to probed value before G43.1 (default 0)
  confirmAfterProbe: boolean   // show resume-confirmation dialog after probing (default false)
}

export interface MagazineConfig {
  enabled: boolean
  size: number             // number of pockets/slots
}

// Toolchange strategy discriminated union
export type ToolchangeConfig =
  | { strategy: 'manual-basic' }
  | { strategy: 'manual-toolsetter'; position: ToolsetterConfig }
  | {
      strategy: 'atc-passthrough'
      magazine: MagazineConfig
      magazineSlots: (number | null)[]  // index 0 = slot 1; value = tool number or null
    }
  | {
      strategy: 'atc-managed'
      macro: string
      magazine: MagazineConfig
      magazineSlots: (number | null)[]
    }
  | {
      strategy: 'custom-macro'
      macro: string
      magazine: MagazineConfig           // optional to enable; can disable when not using ATC
      magazineSlots: (number | null)[]
    }
```

### Updated `MachineProfile`

```typescript
export interface MachineProfile {
  id: string
  name: string
  type: MachineType
  connection: ConnectionConfig
  macros: Macro[]
  toolchange: ToolchangeConfig   // NEW — replaces toolChangeMacro + magazine + probe
  fluidncConfig: FluidNCConfig | null
}
```

### Default values when adding a new machine

```typescript
toolchange: { strategy: 'manual-basic' }
```

### Migration in `applyServerState()`

When loading config from server, if a machine has the old shape (`toolChangeMacro` field present but no `toolchange` field), migrate:

```typescript
if ('toolChangeMacro' in m && !('toolchange' in m)) {
  const macro = (m as any).toolChangeMacro as string
  ;(m as any).toolchange = macro?.trim()
    ? { strategy: 'custom-macro', macro, magazine: { enabled: false, size: 0 }, magazineSlots: [] }
    : { strategy: 'manual-basic' }
  delete (m as any).toolChangeMacro
  delete (m as any).probe
  delete (m as any).magazine
}
```

---

## Server-Side Changes

### 1. `ui/server/utils/gcode/jobRunner.ts`

#### Strategy reading helper (new private method)
```typescript
private async _getToolchangeConfig(): Promise<ToolchangeConfig> {
  const config = await getConfig() as { machines?: MachineProfile[] }
  const machineId = await this._getActiveMachineId()
  const machine = config.machines?.find(m => m.id === machineId)
    ?? config.machines?.[0]
  return machine?.toolchange ?? { strategy: 'manual-basic' }
}
```

#### `_enterToolChangeMode()` — complete replacement

The existing method sets `tool_change` status, reads `toolChangeMacro`, and runs it via `sendGCode`. Replace with:

```typescript
private async _enterToolChangeMode(sectionIndex: number): Promise<void> {
  const section = this._toolSections[sectionIndex]!
  const tc = await this._getToolchangeConfig()
  const toolChangeRequest: JobState['toolChangeRequest'] = {
    sectionIndex,
    toolNumber: section.toolNumber,
    toolChangeType: section.toolChangeType ?? 'T',
    macroRunning: false,
    macroError: null,
  }
  this._status = 'tool_change'
  setToolChangeModeActive(true)
  setMode('idle')
  broadcastPatch([setJobState({ status: 'tool_change', toolChangeRequest })])

  switch (tc.strategy) {
    case 'manual-basic':
      // Just open dialog — user confirms, then calls resumeAfterToolChange()
      this._openToolchangeDialog({ phase: 'waiting_for_swap', isJobContext: true, toolChangeRequest })
      break

    case 'manual-toolsetter':
      await this._runToolsetterSequence(tc.position, toolChangeRequest, true)
      break

    case 'atc-passthrough':
      // Should not reach here — passthrough uses flat send. Guard only.
      this.resumeAfterToolChange()
      break

    case 'atc-managed': {
      const tcVars = await this._buildTcVars(section.toolNumber, tc)
      this._runToolchangeMacro(tc.macro, toolChangeRequest, tcVars)
      break
    }

    case 'custom-macro': {
      const tcVars = await this._buildTcVars(section.toolNumber, tc)
      this._runToolchangeMacro(tc.macro, toolChangeRequest, tcVars)
      break
    }
  }
}
```

#### `_startMainSend()` — passthrough bypass

Before splitting into sections, check strategy:

```typescript
private async _startMainSend(): Promise<void> {
  const tc = await this._getToolchangeConfig()
  if (tc.strategy === 'atc-passthrough') {
    // Flat send — M6 flows to firmware as B1; T-word tracker handles loadedToolNumber
    this._startFlatSend()
    return
  }
  if (this._toolSections.length <= 1) {
    this._startFlatSend()
    return
  }
  this._sendSection(this._currentSectionIndex)
}
```

Note: `_startMainSend()` is currently synchronous. Making it async requires updating its two call sites (`start()` and `_handleRecoveryEvent()`). Both can use `.then(() => {}).catch(...)`.

#### T-word tracker for `atc-passthrough`

In `_handleSenderEvent()`, add tracking of the last-seen T word so when M6 acks, `loadedToolNumber` is updated:

```typescript
// Add at top of JobRunner class:
private _lastSeenToolNumber: number | null = null

// In _tryDispatch (sender.ts side) or in _handleSenderEvent — intercept T-word lines:
// When a line matching /^\s*T(\d+)\s*$/i is sent and acked (Category C), store the number.
// When M6 is sent and acked (Category B1), fire: setLoadedTool(machineId, _lastSeenToolNumber)
```

The cleanest hook is in `_handleSenderEvent()`: after tracking `event.sent`, inspect the line at `event.sent - 1` in `this.lines`. If it's a T-word (Category C), cache the number. If it's M6 (Category B1), persist the cached number.

#### `_runToolsetterSequence()` — new private async method

```typescript
private async _runToolsetterSequence(
  pos: ToolsetterConfig,
  tcRequest: NonNullable<JobState['toolChangeRequest']>,
  isJobContext: boolean,
): Promise<void> {
  // Phase 1: move to toolchange position
  const parkSeq = buildToolchangePositionSequence(pos)
  this._sendHandle = sendGCode(parkSeq, (ev) => {
    if (ev.status !== 'completed') return
    this._sendHandle = null
    if (ev.completedMode !== 'success') {
      this._broadcastToolchangeError('Failed to reach toolchange position', isJobContext)
      return
    }
    // Phase 2: open dialog — wait for user to swap tool
    this._openToolchangeDialog({ phase: 'waiting_for_swap', isJobContext, toolChangeRequest: tcRequest })
    // Dialog resolution handled in resumeToolsetterProbe() called from WS handler
  })
}

// Called by ws.ts when user sends toolchange:confirm
async resumeToolsetterProbe(isJobContext: boolean): Promise<void> {
  // Phase 3: move to toolsetter and probe
  const tc = await this._getToolchangeConfig() as Extract<ToolchangeConfig, { strategy: 'manual-toolsetter' }>
  const pos = tc.position
  const approachSeq = buildToolsetterApproachSequence(pos)
  this._updateToolchangeDialog({ phase: 'probing' })
  this._sendHandle = sendGCode(approachSeq, async (ev) => {
    if (ev.status !== 'completed') return
    this._sendHandle = null
    if (ev.completedMode !== 'success') {
      this._updateToolchangeDialog({ phase: 'error', errorMessage: 'Failed to reach toolsetter position' })
      return
    }
    // Phase 4: run probe via probingRunner's probeEdge
    try {
      const machineId = await this._getActiveMachineId() ?? ''
      const probeResult = await runToolsetterProbe(pos)  // see below
      const toolHeight = probeResult + pos.zOffset

      // Apply offset
      await sendGCodeAwait([`G43.1 Z${toolHeight.toFixed(4)}`, `G53 G0 Z${pos.safeZ.toFixed(4)}`])

      if (pos.confirmAfterProbe) {
        // Phase 5a: show result, wait for user resume
        this._updateToolchangeDialog({ phase: 'probe_result', probedOffset: toolHeight })
        // Resume triggered by toolchange:resume WS message
      } else {
        // Phase 5b: auto-resume
        this._finishToolchangeAndResume(isJobContext, machineId)
      }
    } catch (err) {
      this._updateToolchangeDialog({ phase: 'error', errorMessage: (err as Error).message })
    }
  })
}
```

#### GCode sequence builders (new file or inline)

Create `ui/server/utils/gcode/toolchangeSequences.ts`:

```typescript
import type { ToolchangeSpatialConfig, ToolsetterConfig } from '../../stores/settings' // or shared types

export function buildToolchangePositionSequence(pos: ToolchangeSpatialConfig): string[] {
  return [
    'M5',                                                           // stop spindle
    'G49',                                                          // clear tool length offset
    'G90',                                                          // absolute mode
    `G53 G0 Z${pos.safeZ.toFixed(4)}`,                            // safe Z first
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
```

Note: these types need to be importable on the server. Since `ToolchangeSpatialConfig` / `ToolsetterConfig` are defined in `settings.ts` (client store), extract the interfaces to a shared types file at `ui/shared/toolchange.ts` and import from there on both client and server. Alternatively, duplicate the lightweight interfaces on the server side.

#### Toolsetter probe helper

Create `ui/server/utils/machine/toolsetterProbe.ts`:

```typescript
import { probeEdge } from '../probing/probingRunner'
import { getLastMachineStatus } from './poller'
import { DEFAULT_PROBE_COMPENSATION } from '../tool/types'
import type { ToolsetterConfig } from '../../shared/toolchange'

export async function runToolsetterProbe(pos: ToolsetterConfig): Promise<number> {
  // wco for probeEdge — we're probing in machine coords (G53 moves already positioned us)
  // The wco offsets don't matter here because we use the raw mpos Z from the result.
  const status = getLastMachineStatus()
  const wco = { x: 0, y: 0, z: status?.mpos.z ?? 0 }

  const result = await probeEdge(
    'Z',
    '-',
    pos.probeDistance,
    0,                           // tipRadius = 0 (toolsetter, no lateral compensation)
    pos.probeConfig,
    DEFAULT_PROBE_COMPENSATION,  // no directional bias
    wco,
    () => false,                 // abortCheck — implement properly if abort needed
  )

  // probeEdge returns edgeWpos (work coords) but we need mpos.
  // Since wco.z = mpos.z at approach, mpos.z at trigger = wco.z + edgeWpos.z
  // Simpler: read mpos directly from last status after probe settles.
  const finalStatus = getLastMachineStatus()
  const probeEndZ = finalStatus?.mpos.z ?? 0

  return probeEndZ - pos.toolsetterReferenceZ
}
```

**Important**: `probeEdge` exists in `probingRunner.ts` but is currently a module-private function (not exported). It needs to be exported. The `DEFAULT_PROBE_COMPENSATION` is already exported from `tool/types.ts`.

#### `_buildTcVars()` — new method on JobRunner

Replaces the standalone `buildTcContext()` in macroRunner.ts for the job context:

```typescript
private async _buildTcVars(
  nextToolNumber: number,
  tc: Extract<ToolchangeConfig, { magazineSlots: (number | null)[] }>,
): Promise<TcVars> {
  const machineId = await this._getActiveMachineId() ?? ''
  const currentTool = await getLoadedToolNumber(machineId) ?? 0
  const slots = tc.magazineSlots

  const currentSlot = slots.findIndex(n => n === currentTool) + 1  // 1-based; 0 if not found
  const nextSlot = slots.findIndex(n => n === nextToolNumber) + 1

  return {
    currentTool,
    targetTool: nextToolNumber,
    currentSlot,
    targetSlot: nextSlot,
    slots: slots.map((n, i) => ({ x: 0, y: 0, z: 0 })),  // positions not implemented yet
  }
}
```

#### `runStandaloneToolchange()` — new public method on JobRunner

Called by WS handlers for Load/Unload button actions:

```typescript
async runStandaloneToolchange(targetToolNumber: number | null, operation: 'load' | 'unload'): Promise<void> {
  if (this._status !== 'idle' && this._status !== 'loaded' && this._status !== 'complete') {
    broadcastPatch([pushToast({ id: `tc-busy-${Date.now()}`, type: 'error', message: 'Cannot change tool while job is running', timeout: 4000 })])
    return
  }
  const tc = await this._getToolchangeConfig()

  switch (tc.strategy) {
    case 'manual-basic':
      // Dialog only — no machine motion
      this._openToolchangeDialog({ phase: 'waiting_for_swap', isJobContext: false, targetToolNumber, operation })
      break

    case 'manual-toolsetter':
      if (operation === 'load' && targetToolNumber !== null) {
        await this._runToolsetterSequence(tc.position, null, false)
        // Dialog opens inside _runToolsetterSequence via _openToolchangeDialog
      } else if (operation === 'unload') {
        const parkSeq = buildToolchangePositionSequence(tc.position)
        this._sendHandle = sendGCode(parkSeq, (ev) => {
          if (ev.status !== 'completed' || ev.completedMode !== 'success') return
          this._sendHandle = null
          this._openToolchangeDialog({ phase: 'waiting_for_swap', isJobContext: false, operation: 'unload' })
        })
      }
      break

    case 'atc-passthrough':
      if (operation === 'load' && targetToolNumber !== null) {
        sendGCode([`T${targetToolNumber}`, 'M6'], async () => {
          const machineId = await this._getActiveMachineId() ?? ''
          setLoadedTool(machineId, targetToolNumber).then(op => broadcastPatch([op])).catch(() => {})
        })
      } else if (operation === 'unload') {
        const machineId = await this._getActiveMachineId() ?? ''
        setLoadedTool(machineId, null).then(op => broadcastPatch([op])).catch(() => {})
      }
      break

    case 'atc-managed':
    case 'custom-macro': {
      const tcVars = await this._buildTcVars(targetToolNumber ?? 0, tc)
      // Run ATC/custom macro — no job resume needed after
      this._runStandaloneMacro(tc.macro, tcVars, targetToolNumber, operation)
      break
    }
  }
}
```

### 2. `ui/server/utils/appState.ts`

#### New modal helpers for toolchange dialog

```typescript
// Toolchange modal phases
export type ToolchangePhase = 'waiting_for_swap' | 'probing' | 'probe_result' | 'error'

export interface ToolchangeModalProps {
  phase: ToolchangePhase
  currentToolNumber: number | null
  nextToolNumber: number | null
  isJobContext: boolean           // true = show "Resume job"/"Abort"; false = show "Done"/"Cancel"
  operation?: 'load' | 'unload'  // for standalone (non-job) context
  probedOffset?: number          // populated in probe_result phase
  errorMessage?: string          // populated in error phase
}

export function openToolchangeModal(props: ToolchangeModalProps): { id: string; op: PatchOp } {
  const id = `toolchange-${Date.now()}`
  const entry: ModalEntry = { id, kind: 'toolchange', props }
  const op = openModal(entry)
  return { id, op: op! }
}

export function updateToolchangeModal(id: string, props: Partial<ToolchangeModalProps>): PatchOp {
  // Patch the modal's props in place — use { path: 'modals', set: updated modal } approach
  // or use a new op type. Simplest: store the modal id on JobRunner and replace via removeId + push.
  // See implementation note below.
}
```

**Implementation note for modal update**: The existing patch system supports `removeId` + `push` ops on the `modals` array. To update a modal's phase, emit `{ path: 'modals', removeId: id }` followed immediately by `{ path: 'modals', push: { id, kind: 'toolchange', props: newProps } }`. Both in one `broadcastPatch([...])` call so clients see it atomically.

### 3. `ui/server/utils/macro/macroRunner.ts`

#### Update `buildTcContext()` to read new config shape

The existing function reads `machine.magazine?.size`. Update to read from `machine.toolchange`:

```typescript
export async function buildTcContext(jobState: JobState, machineId: string): Promise<TcVars | null> {
  try {
    const config = await getConfig()
    const machines = (config.machines ?? []) as Array<MachineProfile>
    const machine = machines.find((m) => m.id === machineId)
    const tc = machine?.toolchange

    let magazineSlots: (number | null)[] = []
    if (tc && 'magazineSlots' in tc) {
      magazineSlots = tc.magazineSlots
    }

    const targetTool = jobState.toolChangeRequest?.toolNumber ?? 0
    const currentTool = await getLoadedToolNumber(machineId) ?? 0
    const currentSlot = magazineSlots.findIndex(n => n === currentTool) + 1
    const targetSlot = magazineSlots.findIndex(n => n === targetTool) + 1

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
```

#### Update `TcVars` interface

```typescript
export interface TcVars {
  currentTool: number    // T# currently loaded (0 if none)
  targetTool: number     // T# to load next
  currentSlot: number    // 1-based slot index of current tool (0 if not in magazine)
  targetSlot: number     // 1-based slot index of target tool (0 if not in magazine)
  slots: Array<{ x: number; y: number; z: number }>  // position data (future use)
}
```

### 4. `ui/server/routes/ws.ts`

#### Replace `tool:load` and `tool:unload` handlers

```typescript
case 'tool:load': {
  const { toolNumber } = msg.payload as { toolNumber: number }
  jobRunner.runStandaloneToolchange(toolNumber, 'load').catch(console.error)
  break
}
case 'tool:unload': {
  jobRunner.runStandaloneToolchange(null, 'unload').catch(console.error)
  break
}
```

#### Add new toolchange dialog response handlers

```typescript
case 'toolchange:confirm': {
  // User clicked "Tool installed — continue" (waiting_for_swap phase)
  jobRunner.resumeToolsetterProbe(true).catch(console.error)
  break
}
case 'toolchange:resume': {
  // User clicked "Resume job" or "Apply & Done" (probe_result phase)
  jobRunner.finishToolchangeAndResume().catch(console.error)
  break
}
case 'toolchange:reprobe': {
  // User clicked "Re-probe"
  jobRunner.runReprobe().catch(console.error)
  break
}
case 'toolchange:abort': {
  // User clicked "Abort job" or "Cancel"
  jobRunner.stop()
  break
}
case 'tool:magazineSlots:set': {
  // Persist magazine slot assignments from ToolManagementPanel drag-drop
  const { slots } = msg.payload as { slots: (number | null)[] }
  const machineId = getConnection().machineId ?? ''
  updateMagazineSlots(machineId, slots).then(op => broadcastPatch([op])).catch(console.error)
  break
}
```

#### Add `updateMagazineSlots()` helper in `appState.ts` or config layer

Reads config, finds machine by id, updates `toolchange.magazineSlots`, writes config, returns a patch op that updates the connection state (so all clients see the slot update).

### 5. `ui/server/utils/probing/probingRunner.ts`

**Export `probeEdge`**. Currently it is module-private. Change:
```typescript
async function probeEdge(...)  →  export async function probeEdge(...)
```

---

## UI Changes

### 1. `ui/app/pages/settings.vue`

#### Machine tabs update

```typescript
const machineTabs = [
  { key: 'fluidSender', label: 'FluidSender' },
  { key: 'toolchange', label: 'Tool Change' },   // NEW
  { key: 'firmware', label: 'Firmware Config' },
]
const machineTab = ref<'fluidSender' | 'toolchange' | 'firmware'>('fluidSender')
```

#### FluidSender tab — remove cards

Remove from `<template v-if="machineTab === 'fluidSender'">`:
- The "Tool Magazine" SettingsCard (was lines 157–168)
- The "Tool Change Macro" SettingsCard (was lines 262–274)
- The "Probing" SettingsCard (was lines 276–307)

Keep: Profile card, Connection card, Machine Macros card.

#### New toolchange tab template

Add `<template v-else-if="machineTab === 'toolchange'">` containing:

**Strategy selector card** (always shown):
```html
<SettingsCard title="Toolchange Strategy">
  <SettingsRow label="Strategy">
    <select v-model="editingMachine.toolchange.strategy" class="settings-input w-56">
      <option value="manual-basic">Manual — Basic</option>
      <option value="manual-toolsetter">Manual — With Toolsetter</option>
      <option value="atc-passthrough">ATC — M6 Passthrough</option>
      <option value="atc-managed">ATC — FluidSender Managed</option>
      <option value="custom-macro">Custom Macro</option>
    </select>
  </SettingsRow>
  <!-- one-line description of selected strategy -->
  <p class="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">{{ strategyDescription }}</p>
</SettingsCard>
```

Strategy descriptions:
- `manual-basic`: "No machine motion. FluidSender shows a dialog when M6 is encountered. The operator swaps the tool manually."
- `manual-toolsetter`: "Machine moves to the toolchange position for swap, then automatically probes the new tool's length using the toolsetter."
- `atc-passthrough`: "M6 is forwarded to FluidNC as-is. The machine firmware controls the ATC. FluidSender tracks the loaded tool from the T word preceding M6."
- `atc-managed`: "M6 is intercepted. FluidSender runs the configured ATC macro with slot variables substituted."
- `custom-macro`: "A user-defined GCode macro runs on every tool change. Works for manual and ATC setups."

**Conditional cards per strategy:**

```html
<!-- manual-basic: info only, no config -->
<template v-if="tc.strategy === 'manual-basic'">
  <div class="rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
    No additional configuration required.
  </div>
</template>

<!-- manual-toolsetter -->
<template v-else-if="tc.strategy === 'manual-toolsetter'">
  <SettingsCard title="Toolchange Position  (machine coordinates)">
    <SettingsRow label="Safe Z">
      <input v-model.number="tc.position.safeZ" type="number" step="0.1" class="settings-input w-28 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm</span>
    </SettingsRow>
    <SettingsRow label="Toolchange X">
      <input v-model.number="tc.position.toolchangeX" type="number" step="0.1" class="settings-input w-28 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm</span>
    </SettingsRow>
    <SettingsRow label="Toolchange Y">
      <input v-model.number="tc.position.toolchangeY" type="number" step="0.1" class="settings-input w-28 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm</span>
    </SettingsRow>
    <SettingsRow label="Toolchange Z">
      <input v-model.number="tc.position.toolchangeZ" type="number" step="0.1" class="settings-input w-28 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm</span>
    </SettingsRow>
  </SettingsCard>

  <SettingsCard title="Toolsetter  (machine coordinates)">
    <SettingsRow label="Toolsetter X">
      <input v-model.number="tc.position.toolsetterX" type="number" step="0.1" class="settings-input w-28 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm</span>
    </SettingsRow>
    <SettingsRow label="Toolsetter Y">
      <input v-model.number="tc.position.toolsetterY" type="number" step="0.1" class="settings-input w-28 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm</span>
    </SettingsRow>
    <SettingsRow label="Approach Z">
      <input v-model.number="tc.position.toolsetterApproachZ" type="number" step="0.1" class="settings-input w-28 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm</span>
    </SettingsRow>
    <SettingsRow label="Reference Z">
      <input v-model.number="tc.position.toolsetterReferenceZ" type="number" step="0.001" class="settings-input w-28 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm</span>
    </SettingsRow>
    <SettingsRow label="Max Probe Travel">
      <input v-model.number="tc.position.probeDistance" type="number" min="1" step="1" class="settings-input w-28 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm</span>
    </SettingsRow>
  </SettingsCard>

  <SettingsCard title="Probe Settings">
    <SettingsRow label="Wiggle Probing">
      <ToggleSwitch v-model="tc.position.probeConfig.wiggleEnabled" />
    </SettingsRow>
    <SettingsRow label="Fast Feed">
      <input v-model.number="tc.position.probeConfig.fastFeedMmPerMin" type="number" min="1" class="settings-input w-24 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm/min</span>
    </SettingsRow>
    <SettingsRow label="Slow Feed">
      <input v-model.number="tc.position.probeConfig.slowFeedMmPerMin" type="number" min="1" class="settings-input w-24 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm/min</span>
    </SettingsRow>
    <SettingsRow label="Cycles">
      <input v-model.number="tc.position.probeConfig.cycles" type="number" min="1" max="10" class="settings-input w-20 font-mono" />
    </SettingsRow>
    <SettingsRow label="Average N">
      <input v-model.number="tc.position.probeConfig.averageN" type="number" min="1" max="10" class="settings-input w-20 font-mono" />
    </SettingsRow>
  </SettingsCard>

  <SettingsCard title="Offset Adjustment">
    <SettingsRow label="Z Offset">
      <input v-model.number="tc.position.zOffset" type="number" step="0.001" class="settings-input w-24 font-mono" />
      <span class="text-xs text-gray-400 ml-1.5">mm  (added to probed value before G43.1)</span>
    </SettingsRow>
    <SettingsRow label="Confirm After Probe">
      <ToggleSwitch v-model="tc.position.confirmAfterProbe" />
      <span class="text-xs text-gray-400 ml-1.5">Show dialog to confirm before resuming</span>
    </SettingsRow>
  </SettingsCard>
</template>

<!-- atc-passthrough -->
<template v-else-if="tc.strategy === 'atc-passthrough'">
  <div class="rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
    M6 is forwarded to FluidNC as-is. No macro configuration required.
  </div>
  <!-- Magazine card (same for atc-managed and custom-macro too — extract component) -->
  <ToolchangeMagazineCard v-model:magazine="tc.magazine" />
</template>

<!-- atc-managed -->
<template v-else-if="tc.strategy === 'atc-managed'">
  <ToolchangeMacroCard v-model:macro="tc.macro" :show-slot-vars="true" />
  <ToolchangeMagazineCard v-model:magazine="tc.magazine" />
</template>

<!-- custom-macro -->
<template v-else-if="tc.strategy === 'custom-macro'">
  <ToolchangeMacroCard v-model:macro="tc.macro" :show-slot-vars="tc.magazine.enabled" />
  <ToolchangeMagazineCard v-model:magazine="tc.magazine" />
</template>
```

Extract `ToolchangeMacroCard` and `ToolchangeMagazineCard` as simple inline sub-components or separate `.vue` files:

**ToolchangeMacroCard props:** `macro: string`, `showSlotVars: boolean`
Shows variable reference box (always `{current_tool}`, `{next_tool}`; conditionally `{current_slot}`, `{next_slot}`) and a resizable textarea.

**ToolchangeMagazineCard props:** `magazine: MagazineConfig` (v-model)
Shows enable toggle + size input (when enabled).

#### Helper computed for strategy shorthand

```typescript
const tc = computed(() => editingMachine.value?.toolchange ?? { strategy: 'manual-basic' as const })
```

When strategy changes, the `editingMachine.toolchange` object needs to be replaced wholesale (since each union member has different shape). Provide a `changeStrategy(newStrategy)` function that sets safe defaults:

```typescript
function changeStrategy(s: ToolchangeConfig['strategy']) {
  if (!editingMachine.value) return
  switch (s) {
    case 'manual-basic':
      editingMachine.value.toolchange = { strategy: 'manual-basic' }
      break
    case 'manual-toolsetter':
      editingMachine.value.toolchange = {
        strategy: 'manual-toolsetter',
        position: {
          safeZ: 0, toolchangeX: 0, toolchangeY: 0, toolchangeZ: 0,
          toolsetterX: 0, toolsetterY: 0, toolsetterApproachZ: -90,
          toolsetterReferenceZ: -180, probeDistance: 110,
          probeConfig: { wiggleEnabled: true, fastFeedMmPerMin: 600, slowFeedMmPerMin: 5, cycles: 3, averageN: 2 },
          zOffset: 0, confirmAfterProbe: false,
        },
      }
      break
    case 'atc-passthrough':
    case 'atc-managed':
    case 'custom-macro':
      editingMachine.value.toolchange = {
        strategy: s,
        macro: s === 'atc-passthrough' ? undefined : '',
        magazine: { enabled: false, size: 0 },
        magazineSlots: [],
      } as ToolchangeConfig
      break
  }
}
```

Bind the strategy `<select>` to `@change="changeStrategy($event.target.value)"` rather than `v-model` so the full object is replaced rather than just mutating the `strategy` field (which would leave stale keys from the old shape).

### 2. `ui/app/components/ToolManagementPanel.vue`

#### Magazine grid visibility

Current condition: `v-if="magazine?.enabled && magazine.size > 0"`

Change to:
```typescript
const settings = useSettingsStore()
const isAtcStrategy = computed(() => {
  const tc = settings.activeMachine?.toolchange
  return tc?.strategy === 'atc-passthrough'
    || tc?.strategy === 'atc-managed'
    || tc?.strategy === 'custom-macro'
})
const magazineConfig = computed(() => {
  const tc = settings.activeMachine?.toolchange
  if (!tc || !('magazine' in tc)) return null
  return tc.magazine
})
```

Template condition becomes:
```html
<template v-if="isAtcStrategy && magazineConfig?.enabled && magazineConfig.size > 0">
```

#### Magazine slot persistence

After `dropOnSlot()` and `clearSlot()` mutations, also persist:
```typescript
function dropOnSlot(slot: number) {
  if (!draggingToolId.value) return
  const entry = allTools.value.find(e => e.id === draggingToolId.value)
  if (!entry) return
  machine.magazineSlots.splice(slot - 1, 1, entry.number!)
  wsSend({ t: 'tool:magazineSlots:set', payload: { slots: [...machine.magazineSlots] } })
  draggingToolId.value = null
  dragOverSlot.value = null
}

function clearSlot(slot: number) {
  machine.magazineSlots.splice(slot - 1, 1, null)
  wsSend({ t: 'tool:magazineSlots:set', payload: { slots: [...machine.magazineSlots] } })
}
```

The server response broadcasts a patch back with the updated slots, which keeps all clients in sync.

#### Load/Unload button change

The Load button currently sends:
```typescript
wsSend({ t: 'tool:load', payload: { toolNumber: entry.number } })
wsSend({ t: 'tool:unload', payload: {} })
```

This remains the same wire format — the server-side handler for `tool:load` / `tool:unload` now routes through `jobRunner.runStandaloneToolchange()` instead of directly setting the loaded tool. No client-side change needed.

### 3. New component: `ui/app/components/ToolchangeDialog.vue`

A synced modal consumed via `useModals().active('toolchange')`. Handles all five strategies and both job/standalone contexts.

**Props (from modal.props):**
- `phase: ToolchangePhase`
- `currentToolNumber: number | null`
- `nextToolNumber: number | null`
- `isJobContext: boolean`
- `operation?: 'load' | 'unload'`
- `probedOffset?: number`
- `errorMessage?: string`

**Phase: `waiting_for_swap`**
- Title: "Tool Change" (job) or "Load Tool" / "Unload Tool" (standalone)
- Shows current tool card and next tool card (look up from tool library by number)
- For unload: just "Remove T[N] from spindle"
- For manual-toolsetter: shows step indicator (● Toolchange position ✓ / ○ Probe / ○ Resume)
- Buttons:
  - Job context: **[Tool installed — Continue]** → sends `toolchange:confirm` | **[Abort Job]** → sends `toolchange:abort`
  - Standalone load: **[Tool installed — Probe Length]** (toolsetter) or **[Confirm]** (basic) → sends `toolchange:confirm`
  - Standalone unload: **[Confirm]** → sends `toolchange:confirm`

**Phase: `probing`**
- Shows animated "Probing tool length..." progress indicator
- Step indicator updates: ● Toolchange position ✓ / ● Probing... / ○ Resume
- No buttons (in progress)

**Phase: `probe_result`** (only when `confirmAfterProbe: true`)
- Shows: "T[M] length offset: [±X.XXX] mm (G43.1 applied)"
- Step indicator: ● Toolchange position ✓ / ● Probe ✓ / ○ Resume
- Buttons: **[Resume Job]** / **[Apply & Done]** → `toolchange:resume` | **[Re-probe]** → `toolchange:reprobe` | **[Abort]** → `toolchange:abort`

**Phase: `error`**
- Shows error message
- Buttons: **[Retry]** → `toolchange:reprobe` | **[Abort]** → `toolchange:abort`

Register the component in `app.vue` or wherever other modals are handled (check existing `ProgramPauseModal` mounting pattern).

---

## Per-Strategy Behavior Reference

### `manual-basic`

| Trigger | Behavior |
|---------|----------|
| M6 mid-job/macro | Section N completes → `waiting_for_swap` dialog → user confirms → `resumeAfterToolChange()` → Section N+1 starts |
| Load button | `waiting_for_swap` dialog (no machine motion) → confirm → `loadedToolNumber` updated |
| Unload button | Instant: clear `loadedToolNumber`, toast. No dialog. |

### `manual-toolsetter`

| Trigger | Behavior |
|---------|----------|
| M6 mid-job/macro | Section N completes → run `buildToolchangePositionSequence()` → `waiting_for_swap` dialog → user confirms → run `buildToolsetterApproachSequence()` + `runToolsetterProbe()` → apply `G43.1` → if `confirmAfterProbe`: show `probe_result` dialog → resume; else: auto-resume |
| Load button | Run toolchange position sequence → `waiting_for_swap` dialog → user confirms → probe sequence → `G43.1` applied → `probe_result` or auto-done → machine stays at safeZ |
| Unload button | Run toolchange position sequence → `waiting_for_swap` dialog (remove prompt) → confirm → `G49` → clear `loadedToolNumber` → machine stays at safeZ |

**Resume sequence after toolsetter probe (job context):**
1. Read saved modal state (WCS, units, distance, feedrate, spindle, coolant) from `getModalStateAtLine(execPtr - 1)`
2. Apply `buildModalRestoreSequence()` (same as existing `_buildRecoverySequence()`)
3. Return machine to job XY position at safe Z then descend to job Z
4. Call `resumeAfterToolChange()` / send chunk resume

### `atc-passthrough`

| Trigger | Behavior |
|---------|----------|
| M6 mid-job/macro | No section splitting; job sends as flat chunk; M6 acks as B1 after planner drains; server updates `loadedToolNumber` from last-seen T word |
| Load button | Send `T[n]` then `M6` to machine; wait for ack; update `loadedToolNumber` |
| Unload button | Clear `loadedToolNumber` tracking only; no machine command |

### `atc-managed`

| Trigger | Behavior |
|---------|----------|
| M6 mid-job/macro | Section N completes → substitute `{current_tool}`, `{next_tool}`, `{current_slot}`, `{next_slot}` into macro → `sendGCode(macroLines)` → on completion: update `loadedToolNumber` → auto-resume Section N+1 |
| Load button | Same macro substitution, no job resume |
| Unload button | Macro with `{next_tool}=0`, `{next_slot}=0`; clear `loadedToolNumber` on completion |

### `custom-macro`

Same server path as `atc-managed`. The macro content drives behavior. No dialog before or after — the macro handles all user interaction if needed (via M0 if desired). `loadedToolNumber` is updated on macro completion.

---

## WS Protocol — New Messages

### Client → Server

| Message | Payload | Description |
|---------|---------|-------------|
| `toolchange:confirm` | `{}` | User clicked "Tool installed — Continue" or "Confirm" in dialog |
| `toolchange:resume` | `{}` | User clicked "Resume Job" / "Apply & Done" (probe_result phase) |
| `toolchange:reprobe` | `{}` | User clicked "Re-probe" |
| `toolchange:abort` | `{}` | User clicked "Abort Job" / "Cancel" |
| `tool:magazineSlots:set` | `{ slots: (number \| null)[] }` | Persist magazine slot assignments |

`tool:load` and `tool:unload` remain the same wire format; server behavior changes.

### Server → Client (via existing patch system)

| Patch | When |
|-------|------|
| `{ path: 'modals', push: ToolchangeModalEntry }` | Toolchange dialog opens |
| `{ path: 'modals', removeId: id }` + `{ path: 'modals', push: updated }` | Dialog phase changes |
| `{ path: 'modals', removeId: id, meta: { result: 'resolved' } }` | Dialog closes |

---

## Implementation Order

1. **Shared types** — Create `ui/shared/toolchange.ts` with `ToolchangeSpatialConfig`, `ToolsetterConfig`, `MagazineConfig`, `ToolchangeConfig`. Import in both `settings.ts` and server utils.

2. **Settings store** (`settings.ts`) — Add new types, update `MachineProfile`, add migration in `applyServerState()`, update `addMachine()` defaults. Remove old `ProbeConfig` interface and `MagazineConfig` from root.

3. **Settings UI** (`settings.vue`) — Add toolchange tab, remove old cards from fluidSender tab, implement strategy selector with defaults, implement all conditional config cards.

4. **Export `probeEdge`** in `probingRunner.ts`.

5. **`toolchangeSequences.ts`** — Create sequence builders.

6. **`toolsetterProbe.ts`** — Create `runToolsetterProbe()`.

7. **`appState.ts`** — Add `openToolchangeModal()`, `updateToolchangeModal()` helpers.

8. **`jobRunner.ts`** — Update `_enterToolChangeMode()`, `_startMainSend()`, add `_getToolchangeConfig()`, `_buildTcVars()`, `_runToolsetterSequence()`, `resumeToolsetterProbe()`, `runStandaloneToolchange()`, T-word tracker for passthrough.

9. **`macroRunner.ts`** — Update `buildTcContext()` and `TcVars` to use new config shape.

10. **`ws.ts`** — Update `tool:load`/`tool:unload` handlers, add new `toolchange:*` and `tool:magazineSlots:set` handlers.

11. **`ToolchangeDialog.vue`** — New component, register in app modal mounting.

12. **`ToolManagementPanel.vue`** — Update magazine visibility condition, add slot persistence calls.

13. **Integration test** — Verify each strategy end-to-end using the Rust simulator.

---

## Key Implementation Notes

### The `probeEdge` function for toolsetter
Call with `tipRadius = 0` (no lateral compensation for a fixed-position toolsetter) and `DEFAULT_PROBE_COMPENSATION` (no directional bias). The returned `edgeWpos` is in work coordinates relative to the WCS in effect at probe time. Since we just moved to the toolsetter position using `G53` (machine coords), and the WCS offset is known from machine status, the machine position at trigger can be derived as `edgeWpos + wco.z`. Alternatively, read `getLastMachineStatus().mpos.z` immediately after the probe sequence completes — the machine has not moved.

### Tool height formula
```
toolHeight = probeEndMachineZ − toolsetterReferenceZ + zOffset
```
`toolsetterReferenceZ` is the machine Z coordinate of the toolsetter surface, measured once with a reference condition (no tool, or a known-length reference). Negative values are normal (below machine origin). Apply via `G43.1 Z[toolHeight]`.

### Passthrough and section splitting
The existing `_startMainSend()` calls `_sendSection()` for multi-section files. For `atc-passthrough`, `_startMainSend()` must call `_startFlatSend()` regardless of section count. The T-word/M6 tracker in `_handleSenderEvent()` should look at `this.lines[event.sent - 1]` to detect Category C T-word acks (update `_lastSeenToolNumber`) and Category B1 M6 acks (fire `setLoadedTool(machineId, _lastSeenToolNumber)`).

### `_startMainSend()` async change
Currently sync. Making it async to call `_getToolchangeConfig()` requires calling it with `.then()` or converting the callers. The two call sites are `start()` (sync method that can become fire-and-forget) and `_handleRecoveryEvent()` (already async-adjacent via callbacks). Use `.catch(console.error)` at call sites.

### Magazine slots storage location
`magazineSlots: (number | null)[]` lives inside the strategy config object (under `atc-passthrough`, `atc-managed`, `custom-macro`). The array index is 0-based internally (index 0 = slot 1). When persisted to `config.yaml`, it is serialized as part of the `machines[].toolchange` object. When the `tool:magazineSlots:set` WS message arrives, the server updates `machine.toolchange.magazineSlots` and saves config.

### `machine.magazineSlots` in the client machine store
Currently `machine.magazineSlots` is runtime state in the machine store (not persisted). After this change, the canonical source of truth is the persisted `toolchange.magazineSlots`. On connect, the server should push the persisted slot assignments as part of the connection state snapshot. The machine store's `magazineSlots` ref becomes a reactive mirror of the server-side data (updated via WS patches), matching the existing authority model.

### Reference: `toolsetter.nc` macro breakdown
The original CNCjs macro (in `toolsetter.nc` at repo root) maps to our implementation as follows:
- `%global.state.*` variables → FluidSender `ToolsetterConfig` fields
- `%wait` → not needed; FluidSender sender is already sequential
- `modal.*` save/restore → `getModalStateAtLine()` + `_buildRecoverySequence()`
- `M0 Change Tool and continue` → FluidSender's `waiting_for_swap` dialog
- Multi-step G38.2/G38.4 probe → `probeEdge()` with `wiggleEnabled: true`
- `posz` variable → `getLastMachineStatus().mpos.z`
- `G43.1 Z[TOOL_HEIGHT]` → same command, value computed server-side
