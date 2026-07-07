<template>
  <SettingsCard title="Speed Presets">
    <SettingsRow label="Slow">
      <div class="flex items-center gap-1.5">
        <input v-model.number="s.app.jog.slowSpeed" type="number" min="1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 dark:text-slate-500">mm/min</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Medium">
      <div class="flex items-center gap-1.5">
        <input v-model.number="s.app.jog.mediumSpeed" type="number" min="1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 dark:text-slate-500">mm/min</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Fast">
      <div class="flex items-center gap-1.5">
        <input v-model.number="s.app.jog.fastSpeed" type="number" min="1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 dark:text-slate-500">mm/min</span>
      </div>
    </SettingsRow>
  </SettingsCard>

  <SettingsCard title="Step Size">
    <SettingsRow label="XY Step">
      <div class="flex items-center gap-1.5">
        <input v-model.number="s.app.jog.xyStep" type="number" min="0.001" step="0.1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 dark:text-slate-500">mm / press</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Z Step">
      <div class="flex items-center gap-1.5">
        <input v-model.number="s.app.jog.zStep" type="number" min="0.001" step="0.1" class="settings-input w-28 font-mono" />
        <span class="text-xs text-gray-400 dark:text-slate-500">mm / press</span>
      </div>
    </SettingsRow>
  </SettingsCard>
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'

const s = useSettingsStore()
</script>
