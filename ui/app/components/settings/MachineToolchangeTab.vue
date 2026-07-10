<template>
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
    <SettingsCard title="Toolchange Position  (machine coordinates)">
      <SettingsRow label="Safe Z">
        <input v-model.number="(tc as any).position.safeZ" type="number" step="0.1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm</span>
      </SettingsRow>
      <SettingsRow label="Toolchange X">
        <input v-model.number="(tc as any).position.toolchangeX" type="number" step="0.1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm</span>
      </SettingsRow>
      <SettingsRow label="Toolchange Y">
        <input v-model.number="(tc as any).position.toolchangeY" type="number" step="0.1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm</span>
      </SettingsRow>
      <SettingsRow label="Toolchange Z">
        <input v-model.number="(tc as any).position.toolchangeZ" type="number" step="0.1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm</span>
      </SettingsRow>
    </SettingsCard>

    <SettingsCard title="Toolsetter  (machine coordinates)" allow-overflow>
      <SettingsRow label="Toolsetter X">
        <input v-model.number="(tc as any).position.toolsetterX" type="number" step="0.1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm</span>
      </SettingsRow>
      <SettingsRow label="Toolsetter Y">
        <input v-model.number="(tc as any).position.toolsetterY" type="number" step="0.1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm</span>
      </SettingsRow>
      <SettingsRow label="Approach Z">
        <input v-model.number="(tc as any).position.toolsetterApproachZ" type="number" step="0.1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm</span>
      </SettingsRow>
      <SettingsRow label="Max Probe Travel">
        <input v-model.number="(tc as any).position.probeDistance" type="number" min="1" step="1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm</span>
      </SettingsRow>
      <SettingsRow label="TOL Baseline">
        <div class="flex items-center gap-1.5">
          <input v-model.number="(tc as any).position.tolBaseline" type="number" step="0.001" class="settings-input w-28 font-mono" />
          <span class="text-xs text-gray-400">mm</span>
          <button
            type="button"
            :disabled="!isConnected"
            :title="isConnected
              ? 'Apply the TOL last measured via \'Measure Tool Offset\' as the new baseline'
              : 'Connect to this machine to apply a measured TOL as the baseline'"
            class="text-xs px-3 py-1.5 font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-slate-200 rounded-md transition-colors"
            @click="applyCurrentTolAsBaseline"
          >
            Apply Current TOL
          </button>
          <div class="relative group/tip shrink-0">
            <button type="button" class="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">?</button>
            <div class="absolute right-0 bottom-6 z-10 hidden group-hover/tip:block w-72 bg-gray-900 dark:bg-slate-700 text-white text-xs rounded-lg p-3 shadow-xl leading-relaxed space-y-2">
              <p>
                Machine-Z position of the tool-setter's trigger point when the zero-reference tool is loaded. Every other
                tool's length is measured relative to this point, so it stays correct across reboots — G43.1 itself resets
                to 0 on every FluidNC boot.
              </p>
              <p>
                To (re)calibrate: set this to 0, then use "Measure Tool Offset" with whichever tool or probe you want as
                your new zero reference. Come back here and click "Apply Current TOL" — it stores that measurement as the
                new baseline without touching the machine's current tool length offset, since it already reflects what
                was just measured. The measured TOL reads ~0 from then on, and every tool measured afterward is relative
                to this baseline.
              </p>
            </div>
          </div>
        </div>
      </SettingsRow>
    </SettingsCard>

    <SettingsCard title="Probe Settings">
      <SettingsRow label="Wiggle Probing">
        <UiToggleSwitch v-model="(tc as any).position.probeConfig.wiggleEnabled" />
      </SettingsRow>
      <SettingsRow label="Fast Feed">
        <input v-model.number="(tc as any).position.probeConfig.fastFeedMmPerMin" type="number" min="1" class="settings-input w-24 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm/min</span>
      </SettingsRow>
      <SettingsRow label="Slow Feed">
        <input v-model.number="(tc as any).position.probeConfig.slowFeedMmPerMin" type="number" min="1" class="settings-input w-24 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm/min</span>
      </SettingsRow>
      <SettingsRow label="Cycles">
        <input v-model.number="(tc as any).position.probeConfig.cycles" type="number" min="1" max="10" class="settings-input w-20 font-mono" />
      </SettingsRow>
      <SettingsRow label="Average N">
        <input v-model.number="(tc as any).position.probeConfig.averageN" type="number" min="1" max="10" class="settings-input w-20 font-mono" />
      </SettingsRow>
    </SettingsCard>

    <SettingsCard title="Offset Adjustment">
      <SettingsRow label="Z Offset">
        <input v-model.number="(tc as any).position.zOffset" type="number" step="0.001" class="settings-input w-24 font-mono" />
        <span class="text-xs text-gray-400 ml-1.5">mm  (added to probed value before G43.1)</span>
      </SettingsRow>
      <SettingsRow label="Confirm After Probe">
        <UiToggleSwitch v-model="(tc as any).position.confirmAfterProbe" />
        <span class="text-xs text-gray-400 ml-1.5">Show dialog to confirm before resuming</span>
      </SettingsRow>
    </SettingsCard>
  </template>

  <!-- atc-passthrough -->
  <template v-else-if="tc.strategy === 'atc-passthrough'">
    <div class="rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
      M6 is forwarded to FluidNC as-is. No macro configuration required.
    </div>
    <SettingsCard title="Tool Magazine">
      <SettingsRow label="Enable Magazine">
        <UiToggleSwitch v-model="(tc as any).magazine.enabled" />
      </SettingsRow>
      <template v-if="(tc as any).magazine.enabled">
        <SettingsRow label="Slots">
          <input v-model.number="(tc as any).magazine.size" type="number" min="1" max="32" class="settings-input w-20 font-mono" />
          <span class="text-xs text-gray-400 ml-1.5">pockets</span>
        </SettingsRow>
      </template>
    </SettingsCard>
  </template>

  <!-- atc-managed -->
  <template v-else-if="tc.strategy === 'atc-managed'">
    <SettingsCard title="ATC Macro">
      <div class="px-3 py-1 text-xs text-gray-500 dark:text-slate-400">
        Variables: <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded">{current_tool}</code>
        <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded ml-1">{next_tool}</code>
        <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded ml-1">{current_slot}</code>
        <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded ml-1">{next_slot}</code>
      </div>
      <div class="px-3 pb-3">
        <textarea
          v-model="(tc as any).macro"
          rows="6"
          class="w-full px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
        />
      </div>
    </SettingsCard>
    <SettingsCard title="Tool Magazine">
      <SettingsRow label="Enable Magazine">
        <UiToggleSwitch v-model="(tc as any).magazine.enabled" />
      </SettingsRow>
      <template v-if="(tc as any).magazine.enabled">
        <SettingsRow label="Slots">
          <input v-model.number="(tc as any).magazine.size" type="number" min="1" max="32" class="settings-input w-20 font-mono" />
          <span class="text-xs text-gray-400 ml-1.5">pockets</span>
        </SettingsRow>
      </template>
    </SettingsCard>
  </template>

  <!-- custom-macro -->
  <template v-else-if="tc.strategy === 'custom-macro'">
    <SettingsCard title="Custom Macro">
      <div class="px-3 py-1 text-xs text-gray-500 dark:text-slate-400">
        Variables: <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded">{current_tool}</code>
        <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded ml-1">{next_tool}</code>
        <template v-if="(tc as any).magazine.enabled">
          <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded ml-1">{current_slot}</code>
          <code class="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded ml-1">{next_slot}</code>
        </template>
      </div>
      <div class="px-3 pb-3">
        <textarea
          v-model="(tc as any).macro"
          rows="6"
          class="w-full px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
        />
      </div>
    </SettingsCard>
    <SettingsCard title="Tool Magazine">
      <SettingsRow label="Enable Magazine">
        <UiToggleSwitch v-model="(tc as any).magazine.enabled" />
      </SettingsRow>
      <template v-if="(tc as any).magazine.enabled">
        <SettingsRow label="Slots">
          <input v-model.number="(tc as any).magazine.size" type="number" min="1" max="32" class="settings-input w-20 font-mono" />
          <span class="text-xs text-gray-400 ml-1.5">pockets</span>
        </SettingsRow>
      </template>
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
import type { ToolchangeConfig } from '~/../../shared/toolchange'
import { wsSend } from '~/composables/useWsSend'

const machine = defineModel<MachineProfile>('machine', { required: true })
defineProps<{ isConnected: boolean }>()

const tc = computed<ToolchangeConfig>(() => {
  return (machine.value.toolchange as ToolchangeConfig | undefined) ?? { strategy: 'manual-basic' }
})

function applyCurrentTolAsBaseline() {
  wsSend({ t: 'toolchange:setBaseline', payload: {} })
}

const TOOLSETTER_DEFAULTS = {
  safeZ: -10, toolchangeX: 0, toolchangeY: 0, toolchangeZ: -30,
  toolsetterX: 0, toolsetterY: 0, toolsetterApproachZ: -20,
  probeDistance: 30, zOffset: 0, confirmAfterProbe: true, tolBaseline: -50,
  probeConfig: { wiggleEnabled: false, fastFeedMmPerMin: 300, slowFeedMmPerMin: 60, cycles: 2, averageN: 1 },
}

const MAGAZINE_DEFAULTS = { enabled: false, size: 4 }

function changeStrategy(newStrategy: ToolchangeConfig['strategy']) {
  let newTc: ToolchangeConfig
  switch (newStrategy) {
    case 'manual-basic':  newTc = { strategy: 'manual-basic' }; break
    case 'manual-toolsetter': newTc = { strategy: 'manual-toolsetter', position: { ...TOOLSETTER_DEFAULTS }, confirmMissingOffset: true }; break
    case 'atc-passthrough': newTc = { strategy: 'atc-passthrough', magazine: { ...MAGAZINE_DEFAULTS }, magazineSlots: [], confirmMissingOffset: true }; break
    case 'atc-managed': newTc = { strategy: 'atc-managed', macro: '', magazine: { ...MAGAZINE_DEFAULTS }, magazineSlots: [], confirmMissingOffset: true }; break
    case 'custom-macro': newTc = { strategy: 'custom-macro', macro: '', magazine: { ...MAGAZINE_DEFAULTS }, magazineSlots: [], confirmMissingOffset: true }; break
  }
  machine.value.toolchange = newTc
}

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
    case 'atc-managed': return 'FluidSender executes the ATC macro (GCode + variable substitution) then tracks magazine slot assignments.'
    case 'custom-macro': return 'Runs a custom GCode macro for every M6 command. Variables for current/next tool numbers are substituted.'
    default: return ''
  }
})
</script>
