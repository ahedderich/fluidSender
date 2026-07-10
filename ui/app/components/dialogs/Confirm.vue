<template>
  <DialogsDialogFrame
    :open="!!entry"
    size="3xl"
    :closable="false"
    @close="dismiss()"
  >
    <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-100">
      {{ opts.title }}
    </h3>
    <p v-if="opts.message" class="mt-1.5 text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
      {{ opts.message }}
    </p>

    <div class="flex gap-2 mt-4">
      <DialogsDialogButton variant="neutral" shortcut="dialogCancel" class="flex-1" @click="dismiss()">
        {{ opts.cancelLabel }}
      </DialogsDialogButton>
      <DialogsDialogButton
        :variant="opts.danger ? 'danger' : 'primary'"
        shortcut="dialogConfirm"
        class="flex-1"
        @click="accept()"
      >
        {{ opts.confirmLabel }}
      </DialogsDialogButton>
    </div>
  </DialogsDialogFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useModals } from '~/composables/useModals'
import { useDialogShortcuts } from '~/composables/useDialogShortcuts'

interface ConfirmProps {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

const modals = useModals()
const entry = computed(() => modals.modals.find((m) => m.kind === 'confirm') ?? null)
const opts = computed<ConfirmProps>(() => (entry.value?.props as unknown as ConfirmProps) ?? { title: '' })

function accept() {
  if (entry.value) modals.resolve(entry.value.id, true)
}
function dismiss() {
  if (entry.value) modals.resolve(entry.value.id, false)
}

useDialogShortcuts(() => !!entry.value, { onConfirm: accept, onCancel: dismiss })
</script>
