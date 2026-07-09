<template>
  <Teleport to="body">
    <div
      v-if="modal"
      class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-md">

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 class="text-base font-semibold text-gray-900 dark:text-slate-100">{{ dialogTitle }}</h3>
        </div>

        <!-- Body -->
        <div class="px-5 py-4 space-y-4">

          <!-- Step indicator (manual-toolsetter, skipped for the measure-only flow which has no position/swap step) -->
          <div v-if="showStepIndicator" class="flex items-center gap-3 text-xs">
            <div class="flex items-center gap-1.5">
              <span
                :class="phase !== 'waiting_for_swap' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400 font-semibold'"
                class="flex items-center gap-1"
              >
                <span v-if="phase !== 'waiting_for_swap'">✓</span>
                <span v-else>●</span>
                Toolchange position
              </span>
            </div>
            <div class="text-gray-300 dark:text-slate-600">›</div>
            <div class="flex items-center gap-1.5">
              <span
                :class="phase === 'probe_result' ? 'text-emerald-600 dark:text-emerald-400' : phase === 'probing' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-400 dark:text-slate-500'"
                class="flex items-center gap-1"
              >
                <span v-if="phase === 'probe_result'">✓</span>
                <span v-else-if="phase === 'probing'">●</span>
                <span v-else>○</span>
                Probe
              </span>
            </div>
            <div class="text-gray-300 dark:text-slate-600">›</div>
            <div class="flex items-center gap-1.5">
              <span class="flex items-center gap-1 text-gray-400 dark:text-slate-500">
                <span>○</span>
                Resume
              </span>
            </div>
          </div>

          <!-- Phase: waiting_for_swap -->
          <template v-if="phase === 'waiting_for_swap'">
            <div class="flex items-center gap-4">
              <div v-if="props.nextToolNumber !== null" class="text-center">
                <div class="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center text-xl font-bold text-white mx-auto">
                  {{ props.nextToolNumber }}
                </div>
                <p class="text-xs text-gray-500 dark:text-slate-400 mt-1">Install T{{ props.nextToolNumber }}</p>
              </div>
              <div v-else-if="props.operation === 'unload'" class="text-center">
                <div class="w-12 h-12 rounded-full bg-gray-400 flex items-center justify-center text-xl font-bold text-white mx-auto">
                  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <p class="text-xs text-gray-500 dark:text-slate-400 mt-1">Remove tool from spindle</p>
              </div>
            </div>
            <p class="text-sm text-gray-600 dark:text-slate-400">
              <template v-if="props.operation === 'unload'">Remove the current tool from the spindle and confirm when done.</template>
              <template v-else-if="isToolsetterStrategy">Move machine to toolchange position is complete. Install the new tool and click continue to probe its length.</template>
              <template v-else-if="!props.isJobContext">Install T{{ props.nextToolNumber }} in the spindle and re-zero Z manually, then confirm. The tool will be set as active without sending any GCode.</template>
              <template v-else>Install T{{ props.nextToolNumber }} in the spindle, re-zero Z manually, then click continue to resume the job.</template>
            </p>
          </template>

          <!-- Phase: probing -->
          <template v-else-if="phase === 'probing'">
            <div class="flex items-center gap-3 py-2">
              <div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
              <p class="text-sm text-gray-700 dark:text-slate-300">Probing tool length…</p>
            </div>
          </template>

          <!-- Phase: probe_result -->
          <template v-else-if="phase === 'probe_result'">
            <div class="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-lg px-4 py-3">
              <p class="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Tool length probed</p>
              <p class="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                T{{ props.nextToolNumber ?? '?' }} length offset: <span class="font-mono">{{ props.probedOffset !== undefined ? (props.probedOffset >= 0 ? '+' : '') + props.probedOffset.toFixed(3) : '—' }} mm</span>
                (G43.1 applied)
              </p>
            </div>
          </template>

          <!-- Phase: error -->
          <template v-else-if="phase === 'error'">
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg px-4 py-3">
              <p class="text-sm font-semibold text-red-800 dark:text-red-300">Error</p>
              <p class="text-xs text-red-600 dark:text-red-400 mt-0.5">{{ props.errorMessage }}</p>
            </div>
          </template>

        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center gap-2.5 justify-end">
          <template v-if="phase === 'waiting_for_swap'">
            <button
              v-if="props.isJobContext"
              @click="send('toolchange:abort')"
              class="px-4 py-2 text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg transition-colors"
            >
              Abort Job
            </button>
            <button
              v-else
              @click="send('toolchange:abort'); closeModal()"
              class="px-4 py-2 text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              @click="send('toolchange:confirm')"
              class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
            >
              <template v-if="props.operation === 'unload'">Confirm</template>
              <template v-else-if="isToolsetterStrategy">Tool installed — Probe Length</template>
              <template v-else-if="!props.isJobContext">Tool loaded — Confirm</template>
              <template v-else>Tool installed — Continue</template>
            </button>
          </template>

          <template v-else-if="phase === 'probing'">
            <!-- No buttons while probing -->
          </template>

          <template v-else-if="phase === 'probe_result'">
            <button
              @click="send('toolchange:abort')"
              class="px-4 py-2 text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg transition-colors"
            >
              Abort
            </button>
            <button
              @click="send('toolchange:reprobe')"
              class="px-4 py-2 text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg transition-colors"
            >
              Re-probe
            </button>
            <button
              @click="send('toolchange:resume')"
              class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
            >
              {{ props.isJobContext ? 'Resume Job' : 'Apply & Done' }}
            </button>
          </template>

          <template v-else-if="phase === 'error'">
            <button
              @click="send('toolchange:abort'); closeModal()"
              class="px-4 py-2 text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg transition-colors"
            >
              Abort
            </button>
            <button
              @click="send('toolchange:reprobe')"
              class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
            >
              Retry
            </button>
          </template>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useModals } from '~/composables/useModals'
import { wsSend } from '~/composables/useWsSend'
import { useSettingsStore } from '~/stores/settings'

const modals = useModals()
const settings = useSettingsStore()

const modal = modals.active('toolchange')

const props = computed(() => {
  const p = modal.value?.props as Record<string, unknown> | undefined
  return {
    phase: (p?.phase ?? 'waiting_for_swap') as string,
    currentToolNumber: (p?.currentToolNumber ?? null) as number | null,
    nextToolNumber: (p?.nextToolNumber ?? null) as number | null,
    isJobContext: (p?.isJobContext ?? true) as boolean,
    operation: (p?.operation ?? undefined) as 'load' | 'unload' | 'measure' | undefined,
    probedOffset: (p?.probedOffset ?? undefined) as number | undefined,
    errorMessage: (p?.errorMessage ?? undefined) as string | undefined,
  }
})

const phase = computed(() => props.value.phase)

const isToolsetterStrategy = computed(() => {
  const tc = settings.activeMachine?.toolchange
  return tc?.strategy === 'manual-toolsetter'
})

// The measure-only flow starts directly at the probing phase — there's no
// toolchange-position/swap step to show progress against.
const showStepIndicator = computed(() => isToolsetterStrategy.value && props.value.operation !== 'measure')

const dialogTitle = computed(() => {
  if (props.value.operation === 'measure') return 'Measure Tool Offset'
  if (props.value.isJobContext) return 'Tool Change'
  if (props.value.operation === 'unload') return 'Unload Tool'
  if (props.value.nextToolNumber !== null) return `Load Tool T${props.value.nextToolNumber}`
  return 'Tool Change'
})

function send(t: string) {
  wsSend({ t, payload: {} })
}

function closeModal() {
  if (modal.value) modals.resolve(modal.value.id)
}
</script>
