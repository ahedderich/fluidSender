<template>
  <!-- Safety key selector -->
  <SettingsCard title="Safety Key">
    <div class="px-3 py-2 flex items-center gap-3">
      <span class="flex-1 text-sm text-gray-700 dark:text-slate-300">
        Modifier key required for protected shortcuts (shown as lock icon)
      </span>
      <select
        :value="s.app.shortcuts.safetyKey"
        @change="(e) => (s.app.shortcuts.safetyKey = (e.target as HTMLSelectElement).value as SafetyKeyOption)"
        class="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="shift">Shift</option>
        <option value="ctrl">Ctrl</option>
        <option value="alt">Alt</option>
        <option value="none">None (disabled)</option>
      </select>
    </div>
  </SettingsCard>

  <!-- Shortcut groups -->
  <div v-for="group in shortcutGroups" :key="group.label">
    <SettingsCard :title="group.label">
      <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
        <div
          v-for="action in group.actions"
          :key="action.key"
          class="flex items-center gap-3 px-3 py-2"
        >
          <span class="flex-1 text-sm text-gray-700 dark:text-slate-300">{{ action.label }}</span>

          <!-- Safety key lock toggle -->
          <button
            v-if="s.app.shortcuts.safetyKey !== 'none'"
            type="button"
            @click="toggleSafetyRequired(action.key)"
            :title="isSafetyRequired(action.key) ? 'Click to remove safety key requirement' : 'Click to require safety key'"
            :class="isSafetyRequired(action.key)
              ? 'text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300'
              : 'text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400'"
            class="p-1 rounded transition-colors"
          >
            <svg v-if="isSafetyRequired(action.key)" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 11V7a4 4 0 018 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
          </button>

          <!-- Current binding (display-only) -->
          <span class="min-w-[8rem] text-center px-3 py-1.5 rounded-md text-xs font-mono bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300">
            {{ format(action.key) }}
          </span>

          <!-- Edit -->
          <button
            type="button"
            @click="openEditor(action.key, action.label)"
            class="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-md transition-colors"
          >
            Edit
          </button>
        </div>
      </div>
    </SettingsCard>
  </div>

  <p class="text-xs text-gray-400 dark:text-slate-500 pb-2">
    Click Edit to record a new key or clear a binding. Use the lock icon to toggle safety key requirement.
    {{ s.app.shortcuts.safetyKey !== 'none' ? `Safety key: ${safetyKeyLabel}.` : '' }}
  </p>

  <SettingsShortcutEditDialog
    :open="editing !== null"
    :action-id="editing?.key ?? 'dialogConfirm'"
    :label="editing?.label ?? ''"
    @update:open="(v) => { if (!v) editing = null }"
  />
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'
import type { ShortcutActionId, SafetyKeyOption } from '~/stores/settings'
import { useShortcutDisplay } from '~/composables/useShortcutDisplay'

const s = useSettingsStore()
const { format, isSafetyRequired } = useShortcutDisplay()

const shortcutGroups = [
  {
    label: 'Jogging',
    actions: [
      { key: 'jogXPos', label: 'Jog X+' },
      { key: 'jogXNeg', label: 'Jog X-' },
      { key: 'jogYPos', label: 'Jog Y+' },
      { key: 'jogYNeg', label: 'Jog Y-' },
      { key: 'jogZPos', label: 'Jog Z+' },
      { key: 'jogZNeg', label: 'Jog Z-' },
    ],
  },
  {
    label: 'Cycle Controls',
    actions: [
      { key: 'feedHold', label: 'Feed Hold' },
      { key: 'cycleStart', label: 'Cycle Start / Resume' },
      { key: 'softReset', label: 'Soft Reset' },
      { key: 'home', label: 'Run Home Cycle' },
    ],
  },
  {
    label: 'Speed',
    actions: [
      { key: 'speedSlow', label: 'Speed: Slow' },
      { key: 'speedMedium', label: 'Speed: Medium' },
      { key: 'speedFast', label: 'Speed: Fast' },
    ],
  },
  {
    label: 'Dialogs',
    actions: [
      { key: 'dialogCancel', label: 'Dialog Cancel' },
      { key: 'dialogConfirm', label: 'Dialog Confirm / Continue' },
    ],
  },
] as const satisfies Array<{ label: string; actions: Array<{ key: ShortcutActionId; label: string }> }>

const safetyKeyLabel = computed(() => {
  const labels: Record<SafetyKeyOption, string> = { shift: 'Shift', ctrl: 'Ctrl', alt: 'Alt', none: 'None' }
  return labels[s.app.shortcuts.safetyKey]
})

function toggleSafetyRequired(key: ShortcutActionId) {
  s.app.shortcuts.requiresSafetyKey[key] = !isSafetyRequired(key)
}

const editing = ref<{ key: ShortcutActionId; label: string } | null>(null)

function openEditor(key: ShortcutActionId, label: string) {
  editing.value = { key, label }
}
</script>
