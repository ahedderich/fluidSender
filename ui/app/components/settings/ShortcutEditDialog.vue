<template>
  <DialogsDialogFrame :open="open" :title="`Edit Shortcut — ${label}`" size="3xl" @close="close">
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

    <template #footer>
      <DialogsDialogButton variant="neutral" class="flex-1" @click="clear">
        Clear
      </DialogsDialogButton>
      <DialogsDialogButton variant="primary" shortcut="dialogConfirm" class="flex-1" @click="close">
        Done
      </DialogsDialogButton>
    </template>
  </DialogsDialogFrame>
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
