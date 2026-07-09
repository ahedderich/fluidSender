<template>
  <SettingsCard title="Speed Presets">
    <div class="grid grid-cols-4 gap-2 px-3 py-2 items-center">
      <div />
      <div class="text-xs text-gray-400 dark:text-slate-500 text-center">Speed (mm/min)</div>
      <div class="text-xs text-gray-400 dark:text-slate-500 text-center">XY Step (mm)</div>
      <div class="text-xs text-gray-400 dark:text-slate-500 text-center">Z Step (mm)</div>

      <template v-for="level in levels" :key="level.key">
        <div class="text-sm text-gray-700 dark:text-slate-300">{{ level.label }}</div>
        <input v-model.number="s.app.jog[level.key].speed" type="number" min="1" class="settings-input w-full font-mono text-center" />
        <input v-model.number="s.app.jog[level.key].xyStep" type="number" min="0.001" step="0.1" class="settings-input w-full font-mono text-center" />
        <input v-model.number="s.app.jog[level.key].zStep" type="number" min="0.001" step="0.1" class="settings-input w-full font-mono text-center" />
      </template>
    </div>
  </SettingsCard>
</template>

<script setup lang="ts">
import type { JogSettings } from '~/stores/settings'
import { useSettingsStore } from '~/stores/settings'

const s = useSettingsStore()

const levels: Array<{ key: keyof JogSettings; label: string }> = [
  { key: 'slow', label: 'Slow' },
  { key: 'medium', label: 'Medium' },
  { key: 'fast', label: 'Fast' },
]
</script>
