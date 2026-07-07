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

          <!-- Key binding recorder -->
          <button
            type="button"
            @click="startRecording(action.key)"
            class="min-w-[8rem] text-center px-3 py-1.5 rounded-md text-xs font-mono transition-colors border"
            :class="recordingKey === action.key
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400 animate-pulse'
              : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500'"
          >
            {{ recordingKey === action.key ? 'Press a key…' : formatShortcut(action.key) }}
          </button>

          <!-- Clear -->
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
    Click a binding to record a new key. Use the lock icon to toggle safety key requirement.
    {{ s.app.shortcuts.safetyKey !== 'none' ? `Safety key: ${safetyKeyLabel}.` : '' }}
  </p>
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'
import type { ShortcutActionId, SafetyKeyOption } from '~/stores/settings'

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
]

const safetyKeyLabel = computed(() => {
  const labels: Record<SafetyKeyOption, string> = { shift: 'Shift', ctrl: 'Ctrl', alt: 'Alt', none: 'None' }
  return labels[s.app.shortcuts.safetyKey]
})

const KEY_DISPLAY: Record<string, string> = {
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Del',
  ' ': 'Space',
}

function displayKey(raw: string): string {
  const lower = raw.toLowerCase()
  return KEY_DISPLAY[lower] ?? (raw.length === 1 ? raw.toUpperCase() : raw)
}

function isSafetyRequired(actionId: string): boolean {
  return s.app.shortcuts.requiresSafetyKey[actionId as ShortcutActionId] ?? false
}

function formatShortcut(actionId: string): string {
  const binding = (s.app.shortcuts as Record<string, string>)[actionId]
  if (!binding) return '—'

  const safetyKey = s.app.shortcuts.safetyKey
  const requiresSafety = isSafetyRequired(actionId)
  const parts = binding.toLowerCase().split('+')
  const rawKey = parts[parts.length - 1]

  const display: string[] = []
  if (requiresSafety && safetyKey !== 'none') {
    display.push(safetyKey.charAt(0).toUpperCase() + safetyKey.slice(1))
  }
  if (parts.includes('ctrl')) display.push('Ctrl')
  if (parts.includes('alt')) display.push('Alt')
  if (parts.includes('shift') && safetyKey !== 'shift') display.push('Shift')
  display.push(displayKey(rawKey))

  return display.join('+')
}

function toggleSafetyRequired(key: string) {
  s.app.shortcuts.requiresSafetyKey[key as ShortcutActionId] = !isSafetyRequired(key)
}

function clearShortcut(key: string) {
  ;(s.app.shortcuts as Record<string, string>)[key] = ''
}

const recordingKey = ref<string | null>(null)

function startRecording(key: string) {
  recordingKey.value = key
}

function onKeyDown(e: KeyboardEvent) {
  if (!recordingKey.value) return
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

  e.preventDefault()
  e.stopPropagation()

  const safetyKey = s.app.shortcuts.safetyKey
  const parts: string[] = []
  // Include modifiers except the safety key — that is stored separately via requiresSafetyKey
  if (e.ctrlKey && safetyKey !== 'ctrl') parts.push('ctrl')
  if (e.altKey && safetyKey !== 'alt') parts.push('alt')
  if (e.shiftKey && safetyKey !== 'shift') parts.push('shift')
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
