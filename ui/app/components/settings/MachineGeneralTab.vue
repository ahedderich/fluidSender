<template>
  <SettingsCard title="Speed Presets">
    <SettingsRow label="Override Defaults">
      <UiToggleSwitch v-model="jog.enabled" />
      <span class="text-xs text-gray-400 ml-1.5">Use machine-specific speeds instead of the app defaults</span>
    </SettingsRow>
    <div class="grid grid-cols-4 gap-2 px-3 py-2 items-center" :class="{ 'opacity-50 pointer-events-none': !jog.enabled }">
      <div />
      <div class="text-xs text-gray-400 dark:text-slate-500 text-center">Speed (mm/min)</div>
      <div class="text-xs text-gray-400 dark:text-slate-500 text-center">XY Step (mm)</div>
      <div class="text-xs text-gray-400 dark:text-slate-500 text-center">Z Step (mm)</div>

      <template v-for="level in levels" :key="level.key">
        <div class="text-sm text-gray-700 dark:text-slate-300">{{ level.label }}</div>
        <input v-model.number="jog[level.key].speed" type="number" min="1" :disabled="!jog.enabled" class="settings-input w-full font-mono text-center" />
        <input v-model.number="jog[level.key].xyStep" type="number" min="0.001" step="0.1" :disabled="!jog.enabled" class="settings-input w-full font-mono text-center" />
        <input v-model.number="jog[level.key].zStep" type="number" min="0.001" step="0.1" :disabled="!jog.enabled" class="settings-input w-full font-mono text-center" />
      </template>
    </div>
  </SettingsCard>

  <SettingsCard title="Parking Position  (machine coordinates, G53)">
    <div class="grid grid-cols-3 gap-2 px-3 py-2">
      <div v-for="axis in (['x', 'y', 'z'] as const)" :key="axis">
        <label class="text-xs text-gray-400 dark:text-slate-500 block mb-1 text-center">{{ axis.toUpperCase() }} (mm)</label>
        <input v-model.number="park[axis]" type="number" step="0.1" class="settings-input w-full font-mono text-center" />
      </div>
    </div>
    <p class="px-3 pb-2 text-xs text-gray-500 dark:text-slate-400">
      "Park" raises Z to 0, moves to X/Y, then lowers to the Z above.
    </p>
  </SettingsCard>
</template>

<script setup lang="ts">
import type { JogSettings, MachineProfile } from '~/stores/settings'
import { useSettingsStore } from '~/stores/settings'

const machine = defineModel<MachineProfile>('machine', { required: true })
const settings = useSettingsStore()

const levels: Array<{ key: keyof JogSettings; label: string }> = [
  { key: 'slow', label: 'Slow' },
  { key: 'medium', label: 'Medium' },
  { key: 'fast', label: 'Fast' },
]

if (!machine.value.jogOverride) {
  machine.value.jogOverride = {
    enabled: false,
    slow: { ...settings.app.jog.slow },
    medium: { ...settings.app.jog.medium },
    fast: { ...settings.app.jog.fast },
  }
}
if (!machine.value.parkPosition) {
  machine.value.parkPosition = { x: 0, y: 0, z: 0 }
}

const jog = computed(() => machine.value.jogOverride!)
const park = computed(() => machine.value.parkPosition!)
</script>
