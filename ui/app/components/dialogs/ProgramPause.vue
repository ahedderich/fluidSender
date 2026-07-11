<template>
  <DialogsDialogFrame :open="!!entry" size="3xl" :dismissible="false" :closable="false">
    <!-- Header -->
    <div class="flex items-start gap-3 mb-4">
      <div class="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0 mt-0.5">
        <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div class="min-w-0">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-100">Program Pause (M0)</h3>
        <p v-if="comment" class="mt-1 text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
          {{ comment }}
        </p>
        <p v-else class="mt-1 text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
          The program has paused. Inspect the workpiece, then continue or cancel the job.
        </p>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-2">
      <DialogsDialogButton variant="neutral-danger" shortcut="dialogCancel" class="flex-1" @click="abort()">
        Abort job
      </DialogsDialogButton>
      <DialogsDialogButton variant="primary" shortcut="dialogConfirm" class="flex-1" @click="resume()">
        Continue →
      </DialogsDialogButton>
    </div>
  </DialogsDialogFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useModals } from '~/composables/useModals'
import { useDialogShortcuts } from '~/composables/useDialogShortcuts'

const modals = useModals()
const entry = computed(() => modals.modals.find((m) => m.kind === 'program_pause') ?? null)
const comment = computed(() => (entry.value?.props?.comment as string | undefined) ?? null)

function resume() {
  if (entry.value) modals.resolve(entry.value.id, 'continue')
}

function abort() {
  if (entry.value) modals.resolve(entry.value.id, 'cancel')
}

useDialogShortcuts(() => !!entry.value, { onConfirm: resume, onCancel: abort })
</script>
