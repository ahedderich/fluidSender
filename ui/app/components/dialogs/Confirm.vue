<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="entry"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @keydown.esc="dismiss()"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/20" @click="dismiss()" />

        <!-- Modal -->
        <Transition
          enter-active-class="transition duration-150"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition duration-100"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="entry"
            class="relative bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-2xl p-5 w-80 max-w-full"
            @click.stop
          >
            <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {{ opts.title }}
            </h3>
            <p v-if="opts.message" class="mt-1.5 text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
              {{ opts.message }}
            </p>

            <div class="flex gap-2 mt-4">
              <button
                type="button"
                @click="accept()"
                class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                :class="opts.danger
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'"
              >
                {{ opts.confirmLabel }}
              </button>
              <button
                type="button"
                @click="dismiss()"
                class="flex-1 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                {{ opts.cancelLabel }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useModals } from '~/composables/useModals'

interface ConfirmProps {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

const modals = useModals()
const entry = computed(() => modals.modals.find((m) => m.kind === 'confirm') ?? null)
const opts = computed<ConfirmProps>(() => (entry.value?.props as ConfirmProps) ?? { title: '' })

function accept() {
  if (entry.value) modals.resolve(entry.value.id, true)
}
function dismiss() {
  if (entry.value) modals.resolve(entry.value.id, false)
}
</script>
