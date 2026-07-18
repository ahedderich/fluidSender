<template>
  <SettingsCard title="Toolchange Position  (machine coordinates)">
    <SettingsRow label="Safe Z">
      <div class="flex items-center gap-1.5">
        <input v-model.number="position.safeZ" type="number" step="0.1" class="settings-input w-24 font-mono" />
        <span class="text-xs text-gray-400">mm</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Position">
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-gray-400">X</span>
        <input v-model.number="position.toolchangeX" type="number" step="0.1" class="settings-input w-20 font-mono" />
        <span class="text-xs text-gray-400">Y</span>
        <input v-model.number="position.toolchangeY" type="number" step="0.1" class="settings-input w-20 font-mono" />
        <span class="text-xs text-gray-400">Z</span>
        <input v-model.number="position.toolchangeZ" type="number" step="0.1" class="settings-input w-20 font-mono" />
        <span class="text-xs text-gray-400">mm</span>
      </div>
    </SettingsRow>
  </SettingsCard>

  <SettingsCard title="Toolsetter  (machine coordinates)" allow-overflow>
    <SettingsRow label="Position">
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-gray-400">X</span>
        <input v-model.number="position.toolsetterX" type="number" step="0.1" class="settings-input w-20 font-mono" />
        <span class="text-xs text-gray-400">Y</span>
        <input v-model.number="position.toolsetterY" type="number" step="0.1" class="settings-input w-20 font-mono" />
        <span class="text-xs text-gray-400">Z</span>
        <input v-model.number="position.toolsetterApproachZ" type="number" step="0.1" class="settings-input w-20 font-mono" />
        <span class="text-xs text-gray-400">mm</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Max Probe Travel">
      <div class="flex items-center gap-1.5">
        <input v-model.number="position.probeDistance" type="number" min="1" step="1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400">mm</span>
      </div>
    </SettingsRow>
    <SettingsRow label="TOL Baseline">
      <div class="flex items-center gap-1.5">
        <input v-model.number="position.tolBaseline" type="number" step="0.001" class="settings-input w-28 font-mono" />
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
      <UiToggleSwitch v-model="position.probeConfig.wiggleEnabled" />
    </SettingsRow>
    <SettingsRow label="Fast Feed">
      <div class="flex items-center gap-1.5">
        <input v-model.number="position.probeConfig.fastFeedMmPerMin" type="number" min="1" class="settings-input w-24 font-mono" />
        <span class="text-xs text-gray-400">mm/min</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Slow Feed">
      <div class="flex items-center gap-1.5">
        <input v-model.number="position.probeConfig.slowFeedMmPerMin" type="number" min="1" class="settings-input w-24 font-mono" />
        <span class="text-xs text-gray-400">mm/min</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Cycles">
      <input v-model.number="position.probeConfig.cycles" type="number" min="1" max="10" class="settings-input w-20 font-mono" />
    </SettingsRow>
    <SettingsRow label="Average N">
      <input v-model.number="position.probeConfig.averageN" type="number" min="1" max="10" class="settings-input w-20 font-mono" />
    </SettingsRow>
  </SettingsCard>

  <SettingsCard title="Offset Adjustment">
    <SettingsRow label="Z Offset">
      <div class="flex items-center gap-1.5">
        <input v-model.number="position.zOffset" type="number" step="0.001" class="settings-input w-24 font-mono" />
        <span class="text-xs text-gray-400">mm (added to probed value before G43.1)</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Confirm After Probe">
      <UiToggleSwitch v-model="position.confirmAfterProbe" />
      <span class="text-xs text-gray-400 ml-1.5">Show dialog to confirm before resuming</span>
    </SettingsRow>
  </SettingsCard>
</template>

<script setup lang="ts">
import type { ToolsetterConfig } from '~/../../shared/toolchange'
import { wsSend } from '~/composables/useWsSend'

const position = defineModel<ToolsetterConfig>('position', { required: true })
defineProps<{ isConnected: boolean }>()

function applyCurrentTolAsBaseline() {
  wsSend({ t: 'toolchange:setBaseline', payload: {} })
}
</script>
