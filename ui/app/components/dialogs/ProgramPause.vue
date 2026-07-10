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
      >
        <!-- Backdrop — no click-to-dismiss; operator must make a choice -->
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" />

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
            class="relative bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-2xl p-5 w-96 max-w-full"
            @click.stop
          >
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
              <button
                type="button"
                class="flex-1 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium transition-colors"
                @click="abort()"
              >
                Abort job
                <UiShortcutBadge action="dialogCancel" />
              </button>
              <button
                type="button"
                class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors"
                @click="resume()"
              >
                Continue →
                <UiShortcutBadge action="dialogConfirm" />
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
