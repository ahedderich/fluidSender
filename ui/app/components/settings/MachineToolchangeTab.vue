<template>
  <!-- Tool Magazine: available to every strategy. On manual strategies this is purely a
       per-machine "shorthand" tool picker (the slot grid in the Tool Management panel) —
       no automation. Automation config (below, atc-managed only) is a separate concern. -->
  <SettingsCard title="Tool Magazine">
    <SettingsRow label="Enable Magazine">
      <UiToggleSwitch v-model="tc.magazine.enabled" />
    </SettingsRow>
    <template v-if="tc.magazine.enabled">
      <SettingsRow label="Slots">
        <div class="flex items-center gap-1.5">
          <input v-model.number="tc.magazine.size" type="number" min="1" max="32" class="settings-input w-20 font-mono" />
          <span class="text-xs text-gray-400">pockets</span>
        </div>
      </SettingsRow>
      <p class="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">
        Assign tools to slots from the Tool Management panel.
      </p>
    </template>
  </SettingsCard>

  <SettingsCard title="Toolchange Strategy">
    <SettingsRow label="Strategy">
      <select
        :value="tc.strategy"
        @change="changeStrategy(($event.target as HTMLSelectElement).value as ToolchangeConfig['strategy'])"
        class="settings-input w-56"
      >
        <option value="manual-basic">Manual — Basic</option>
        <option value="manual-toolsetter">Manual — With Toolsetter</option>
        <option value="atc-passthrough">ATC — M6 Passthrough</option>
        <option value="atc-managed">ATC — FluidSender Managed</option>
        <option value="custom-macro">Custom Macro</option>
      </select>
    </SettingsRow>
    <p class="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">{{ strategyDescription }}</p>
  </SettingsCard>

  <!-- manual-basic: no extra config -->
  <template v-if="tc.strategy === 'manual-basic'">
    <div class="rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
      No additional configuration required.
    </div>
  </template>

  <!-- manual-toolsetter -->
  <template v-else-if="tc.strategy === 'manual-toolsetter'">
    <SettingsToolsetterFields v-model:position="(tc as any).position" :is-connected="isConnected" />
  </template>

  <!-- atc-passthrough -->
  <template v-else-if="tc.strategy === 'atc-passthrough'">
    <div class="rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
      M6 is forwarded to FluidNC as-is. No macro configuration required.
    </div>
  </template>

  <!-- atc-managed -->
  <template v-else-if="tc.strategy === 'atc-managed'">
    <div v-if="!tc.magazine.enabled" class="rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
      Enable the Tool Magazine above and configure automation to define the toolchange sequence. No macro — the entire
      sequence is defined by the configuration parameters below.
    </div>

    <SettingsCard v-if="tc.magazine.enabled" title="Magazine Automation">
      <SettingsRow label="Configure Automation">
        <UiToggleSwitch :model-value="!!tc.magazine.automation" @update:model-value="toggleAutomation" />
        <span class="text-xs text-gray-400 ml-1.5">Not yet executed automatically — falls back to a manual swap-confirm dialog until the generation engine lands.</span>
      </SettingsRow>

      <template v-if="tc.magazine.automation">
        <SettingsRow label="Magazine Type">
          <select :value="tc.magazine.automation.type" @change="changeAutomationType(($event.target as HTMLSelectElement).value as MagazineAutomation['type'])" class="settings-input w-40">
            <option value="fixed">Fixed Rack</option>
            <option value="moving">Moving Carousel</option>
          </select>
        </SettingsRow>
        <SettingsRow label="Grip Command">
          <input v-model="tc.magazine.automation.gripCommand" type="text" placeholder="e.g. M62" class="settings-input w-64 font-mono" />
        </SettingsRow>
        <SettingsRow label="Release Command">
          <input v-model="tc.magazine.automation.releaseCommand" type="text" placeholder="e.g. M63" class="settings-input w-64 font-mono" />
        </SettingsRow>

        <template v-if="tc.magazine.automation.type === 'fixed'">
          <div class="px-3 pt-2 pb-1 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Slot Positions (machine coordinates)</div>
          <SettingsRow v-for="(slotPos, i) in tc.magazine.automation.slots" :key="i" :label="`Slot ${i + 1}`">
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-gray-400">X</span>
              <input v-model.number="slotPos.x" type="number" step="0.1" class="settings-input w-20 font-mono" />
              <span class="text-xs text-gray-400">Y</span>
              <input v-model.number="slotPos.y" type="number" step="0.1" class="settings-input w-20 font-mono" />
              <span class="text-xs text-gray-400">Z</span>
              <input v-model.number="slotPos.z" type="number" step="0.1" class="settings-input w-20 font-mono" />
            </div>
          </SettingsRow>

          <div class="px-3 pt-2 pb-1 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Approach</div>
          <SettingsRow label="Axis">
            <select v-model="tc.magazine.automation.approach.axis" class="settings-input w-24">
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Direction">
            <select v-model.number="tc.magazine.automation.approach.direction" class="settings-input w-24">
              <option :value="1">+</option>
              <option :value="-1">-</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Distance">
            <div class="flex items-center gap-1.5">
              <input v-model.number="tc.magazine.automation.approach.distance" type="number" min="0" step="0.1" class="settings-input w-24 font-mono" />
              <span class="text-xs text-gray-400">mm</span>
            </div>
          </SettingsRow>
          <p class="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">
            Example — a front-loaded rack: axis X, direction +, distance 50. To unload, the machine parks 50mm out along -X from
            the slot, moves down to slot Z, then travels +50mm in X to seat the tool. Loading reverses the sequence.
          </p>
        </template>

        <template v-else-if="tc.magazine.automation.type === 'moving'">
          <div class="px-3 pt-2 pb-1 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Load/Unload Position (machine coordinates)</div>
          <SettingsRow label="Safe Z">
            <div class="flex items-center gap-1.5">
              <input v-model.number="tc.magazine.automation.loadPosition.safeZ" type="number" step="0.1" class="settings-input w-24 font-mono" />
              <span class="text-xs text-gray-400">mm</span>
            </div>
          </SettingsRow>
          <SettingsRow label="Position">
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-gray-400">X</span>
              <input v-model.number="tc.magazine.automation.loadPosition.toolchangeX" type="number" step="0.1" class="settings-input w-20 font-mono" />
              <span class="text-xs text-gray-400">Y</span>
              <input v-model.number="tc.magazine.automation.loadPosition.toolchangeY" type="number" step="0.1" class="settings-input w-20 font-mono" />
              <span class="text-xs text-gray-400">Z</span>
              <input v-model.number="tc.magazine.automation.loadPosition.toolchangeZ" type="number" step="0.1" class="settings-input w-20 font-mono" />
              <span class="text-xs text-gray-400">mm</span>
            </div>
          </SettingsRow>

          <div class="px-3 pt-2 pb-1 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Approach</div>
          <SettingsRow label="Axis">
            <select v-model="tc.magazine.automation.approach.axis" class="settings-input w-24">
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Direction">
            <select v-model.number="tc.magazine.automation.approach.direction" class="settings-input w-24">
              <option :value="1">+</option>
              <option :value="-1">-</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Distance">
            <div class="flex items-center gap-1.5">
              <input v-model.number="tc.magazine.automation.approach.distance" type="number" min="0" step="0.1" class="settings-input w-24 font-mono" />
              <span class="text-xs text-gray-400">mm</span>
            </div>
          </SettingsRow>
          <p class="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">
            Same pick/place approach leg as a fixed rack, applied at the load/unload position above once the magazine has
            indexed to the requested slot.
          </p>

          <SettingsRow label="Slot Select Command">
            <input v-model="tc.magazine.automation.slotSelectCommand" type="text" placeholder="e.g. M-slot [next_slot]" class="settings-input w-64 font-mono" />
          </SettingsRow>
          <p class="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">
            Moves the magazine to the requested slot. Variables:
            <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded">{current_slot}</code>
            <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded ml-1">{next_slot}</code>
          </p>

          <SettingsRow label="Toolswap Command">
            <input v-model="tc.magazine.automation.toolswapCommand" type="text" placeholder="optional — e.g. swingarm exchange macro" class="settings-input w-64 font-mono" />
          </SettingsRow>
          <p class="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">
            Optional. For a single-shot exchange (e.g. a swingarm that swaps the spindle tool with the targeted slot in one
            motion) instead of separate grip/release steps.
          </p>
        </template>
      </template>
    </SettingsCard>

    <SettingsCard title="Toolsetter">
      <SettingsRow label="Enable Toolsetter">
        <UiToggleSwitch :model-value="!!tc.toolsetter" @update:model-value="toggleToolsetter" />
        <span class="text-xs text-gray-400 ml-1.5">Probe tool length after the swap and apply G43.1.</span>
      </SettingsRow>
    </SettingsCard>

    <SettingsToolsetterFields v-if="tc.toolsetter" v-model:position="(tc as any).toolsetter" :is-connected="isConnected" />
  </template>

  <!-- custom-macro -->
  <template v-else-if="tc.strategy === 'custom-macro'">
    <SettingsCard title="Custom Macro">
      <div class="px-3 py-1 text-xs text-gray-500 dark:text-slate-400">
        Variables: <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded">{current_tool}</code>
        <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded ml-1">{next_tool}</code>
        <template v-if="tc.magazine.enabled">
          <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded ml-1">{current_slot}</code>
          <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded ml-1">{next_slot}</code>
        </template>
      </div>
      <div class="px-3 pb-3">
        <textarea
          v-model="tc.macro"
          rows="6"
          class="w-full px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
        />
      </div>
    </SettingsCard>
  </template>

  <!-- shared across every strategy except manual-basic, where there is no offset to track -->
  <SettingsCard v-if="tc.strategy !== 'manual-basic'" title="Job Safety">
    <SettingsRow label="Warn on Unconfirmed Tool Offset">
      <UiToggleSwitch v-model="confirmMissingOffset" />
      <span class="text-xs text-gray-400 ml-1.5">Confirm before starting/resuming a job if the tool length offset hasn't been verified this session</span>
    </SettingsRow>
  </SettingsCard>
</template>

<script setup lang="ts">
import type { MachineProfile } from '~/stores/settings'
import type { ToolchangeConfig, ToolchangeStrategy, MagazineAutomation, ToolsetterConfig } from '~/../../shared/toolchange'

const machine = defineModel<MachineProfile>('machine', { required: true })
defineProps<{ isConnected: boolean }>()

const MAGAZINE_DEFAULTS = { enabled: false, size: 4 }

const tc = computed<ToolchangeConfig>(() => {
  return (machine.value.toolchange as ToolchangeConfig | undefined) ?? {
    strategy: 'manual-basic',
    magazine: { ...MAGAZINE_DEFAULTS },
    magazineSlots: [],
  }
})

// A fresh object every call — a shared const would share its nested probeConfig
// reference across every machine/strategy that enables a toolsetter.
function toolsetterDefaults(): ToolsetterConfig {
  return {
    safeZ: -10, toolchangeX: 0, toolchangeY: 0, toolchangeZ: -30,
    toolsetterX: 0, toolsetterY: 0, toolsetterApproachZ: -20,
    probeDistance: 30, zOffset: 0, confirmAfterProbe: true, tolBaseline: -50,
    probeConfig: { wiggleEnabled: false, fastFeedMmPerMin: 300, slowFeedMmPerMin: 60, cycles: 2, averageN: 1 },
  }
}

// Magazine/magazineSlots describe the machine's physical hardware, not the active software
// strategy — carried over across strategy switches instead of being reset like macro/position.
function changeStrategy(newStrategy: ToolchangeConfig['strategy']) {
  let strategyPart: ToolchangeStrategy
  switch (newStrategy) {
    case 'manual-basic': strategyPart = { strategy: 'manual-basic' }; break
    case 'manual-toolsetter': strategyPart = { strategy: 'manual-toolsetter', position: toolsetterDefaults(), confirmMissingOffset: true }; break
    case 'atc-passthrough': strategyPart = { strategy: 'atc-passthrough', confirmMissingOffset: true }; break
    case 'atc-managed': strategyPart = { strategy: 'atc-managed', confirmMissingOffset: true }; break
    case 'custom-macro': strategyPart = { strategy: 'custom-macro', macro: '', confirmMissingOffset: true }; break
  }
  machine.value.toolchange = {
    ...strategyPart,
    magazine: tc.value.magazine,
    magazineSlots: tc.value.magazineSlots,
  } as ToolchangeConfig
}

function toggleToolsetter(enabled: boolean) {
  if (tc.value.strategy !== 'atc-managed') return
  tc.value.toolsetter = enabled ? toolsetterDefaults() : undefined
}

function fixedAutomationDefaults(): Extract<MagazineAutomation, { type: 'fixed' }> {
  return {
    type: 'fixed',
    gripCommand: '',
    releaseCommand: '',
    slots: Array.from({ length: tc.value.magazine.size }, () => ({ x: 0, y: 0, z: 0 })),
    approach: { axis: 'x', direction: 1, distance: 50 },
  }
}

function movingAutomationDefaults(): Extract<MagazineAutomation, { type: 'moving' }> {
  return {
    type: 'moving',
    gripCommand: '',
    releaseCommand: '',
    loadPosition: { safeZ: -10, toolchangeX: 0, toolchangeY: 0, toolchangeZ: -30 },
    slotSelectCommand: '',
    approach: { axis: 'x', direction: 1, distance: 50 },
  }
}

function toggleAutomation(enabled: boolean) {
  tc.value.magazine.automation = enabled ? fixedAutomationDefaults() : undefined
}

function changeAutomationType(newType: MagazineAutomation['type']) {
  const prev = tc.value.magazine.automation
  if (!prev) return
  const shared = { gripCommand: prev.gripCommand, releaseCommand: prev.releaseCommand, approach: prev.approach }
  tc.value.magazine.automation = newType === 'fixed'
    ? { ...fixedAutomationDefaults(), ...shared }
    : { ...movingAutomationDefaults(), ...shared }
}

// Keep the fixed-magazine slot-position array in sync with the slot count so every
// position row has a real object to v-model against.
watch(() => tc.value.magazine.size, (size) => {
  const auto = tc.value.magazine.automation
  if (!auto || auto.type !== 'fixed') return
  while (auto.slots.length < size) auto.slots.push({ x: 0, y: 0, z: 0 })
  if (auto.slots.length > size) auto.slots.splice(size)
}, { immediate: true })

const confirmMissingOffset = computed<boolean>({
  get: () => {
    const t = tc.value
    return t.strategy === 'manual-basic' ? true : (t.confirmMissingOffset ?? true)
  },
  set: (val: boolean) => {
    const t = tc.value
    if (t.strategy !== 'manual-basic') t.confirmMissingOffset = val
  },
})

const strategyDescription = computed(() => {
  switch (tc.value.strategy) {
    case 'manual-basic': return 'Pauses the job and shows a dialog prompting the operator to swap the tool manually. No automated motion.'
    case 'manual-toolsetter': return 'Moves the machine to a defined toolchange position, prompts for a manual swap, then automatically probes tool length and applies G43.1.'
    case 'atc-passthrough': return 'Passes M6 directly to FluidNC. The ATC controller handles the entire toolchange sequence independently.'
    case 'atc-managed': return 'The entire toolchange sequence is defined by the Magazine Automation configuration below — no macro. Not yet executed automatically; falls back to a manual swap-confirm dialog until the generation engine lands.'
    case 'custom-macro': return 'Runs a custom GCode macro for every M6 command. Variables for current/next tool numbers are substituted.'
    default: return ''
  }
})
</script>
