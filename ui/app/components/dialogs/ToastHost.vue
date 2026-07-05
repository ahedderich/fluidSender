<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      <TransitionGroup
        enter-active-class="transition duration-200"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 absolute"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0 translate-x-4"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="flex items-start gap-2 rounded-lg border px-3 py-2 shadow-lg text-sm"
          :class="styles[toast.type]"
        >
          <span class="flex-1 leading-snug">{{ toast.message }}</span>
          <button
            class="opacity-60 hover:opacity-100 transition-opacity"
            @click="dismiss(toast.id)"
          >
            ✕
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '~/composables/useToast'
import type { Toast } from '~/stores/sync'

const { toasts, dismiss } = useToast()

const styles: Record<Toast['type'], string> = {
  info: 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-800 dark:text-slate-200',
  success: 'bg-green-50 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200',
  warning: 'bg-amber-50 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200',
  error: 'bg-red-50 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200',
}
</script>
