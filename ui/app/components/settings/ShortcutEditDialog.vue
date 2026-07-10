<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
      @click.self="close"
    >
      <div
        class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-sm"
        @click.stop
      >
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-100">Edit Shortcut — {{ label }}</h3>
          <button
            type="button"
            @click="close"
            class="p-1 text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-md transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-5 space-y-4">
          <button
            type="button"
            @click="startRecording"
            class="w-full text-center px-3 py-3 rounded-lg text-sm font-mono transition-colors border"
            :class="recording
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400 animate-pulse'
              : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500'"
          >
            {{ recording ? 'Press a key… (Esc to cancel)' : currentLabel }}
          </button>

          <div class="flex gap-2.5">
            <button
              type="button"
              @click="clear"
              class="flex-1 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              @click="close"
              class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Done
              <UiShortcutBadge action="dialogConfirm" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'
import type { ShortcutActionId } from '~/stores/settings'
import { useShortcutDisplay } from '~/composables/useShortcutDisplay'
import { useShortcutMatch } from '~/composables/useShortcutMatch'

const props = defineProps<{ open: boolean; actionId: ShortcutActionId; label: string }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const s = useSettingsStore()
const { format } = useShortcutDisplay()
const { fires } = useShortcutMatch()
const recording = ref(false)

const currentLabel = computed(() => format(props.actionId))

function close() {
  recording.value = false
  emit('update:open', false)
}

function startRecording() {
  recording.value = true
}

function clear() {
  ;(s.app.shortcuts as unknown as Record<string, string>)[props.actionId] = ''
  recording.value = false
}

function onKeyDown(e: KeyboardEvent) {
  if (!props.open) return

  if (!recording.value) {
    if (e.key === 'Escape' || fires('dialogCancel', e) || fires('dialogConfirm', e)) {
      e.preventDefault()
      close()
    }
    return
  }

  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    // Escape always aborts capture rather than being recordable — it's reserved as
    // the default dialog-cancel key and this keeps the recorder's own Esc-to-close
    // behavior unambiguous.
    recording.value = false
    return
  }

  const safetyKey = s.app.shortcuts.safetyKey
  const parts: string[] = []
  if (e.ctrlKey && safetyKey !== 'ctrl') parts.push('ctrl')
  if (e.altKey && safetyKey !== 'alt') parts.push('alt')
  if (e.shiftKey && safetyKey !== 'shift') parts.push('shift')
  parts.push(e.key)

  ;(s.app.shortcuts as unknown as Record<string, string>)[props.actionId] = parts.join('+')
  recording.value = false
}

onMounted(() => window.addEventListener('keydown', onKeyDown, true))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown, true))
</script>
