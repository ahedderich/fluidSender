<template>
  <div
    v-for="group in shortcutGroups"
    :key="group.label"
  >
    <SettingsCard :title="group.label">
      <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
        <div
          v-for="action in group.actions"
          :key="action.key"
          class="flex items-center gap-3 px-3 py-2"
        >
          <span class="flex-1 text-sm text-gray-700 dark:text-slate-300">{{ action.label }}</span>
          <button
            type="button"
            @click="startRecording(action.key)"
            class="min-w-[7rem] text-center px-3 py-1.5 rounded-md text-xs font-mono transition-colors border"
            :class="recordingKey === action.key
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400 animate-pulse'
              : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500'"
          >
            {{ recordingKey === action.key ? 'Press a key…' : formatShortcut(s.app.shortcuts[action.key as keyof typeof s.app.shortcuts]) }}
          </button>
          <button
            type="button"
            @click="clearShortcut(action.key)"
            class="p-1 text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 rounded transition-colors"
            title="Clear shortcut"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </SettingsCard>
  </div>

  <p class="text-xs text-gray-400 dark:text-slate-500 pb-2">
    Click a shortcut to record a new key binding. Modifier keys (Ctrl, Alt, Shift) can be combined.
  </p>
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'

const s = useSettingsStore()

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
    label: 'Machine Control',
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
]

const recordingKey = ref<string | null>(null)

function startRecording(key: string) {
  recordingKey.value = key
}

function formatShortcut(binding: string): string {
  if (!binding) return '—'
  return binding
    .replace('ctrl+', 'Ctrl+')
    .replace('alt+', 'Alt+')
    .replace('shift+', 'Shift+')
}

function clearShortcut(key: string) {
  ;(s.app.shortcuts as Record<string, string>)[key] = ''
}

function onKeyDown(e: KeyboardEvent) {
  if (!recordingKey.value) return

  // Ignore lone modifier presses
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

  e.preventDefault()
  e.stopPropagation()

  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(e.key)

  ;(s.app.shortcuts as Record<string, string>)[recordingKey.value] = parts.join('+')
  recordingKey.value = null
}

function onClickOutside() {
  recordingKey.value = null
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('click', onClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('click', onClickOutside)
})
</script>
