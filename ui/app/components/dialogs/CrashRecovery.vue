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
        <!-- Backdrop — no click-to-dismiss; user must make a choice -->
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
              <div class="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 mt-0.5">
                <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-100">Server restart detected</h3>
                <p class="mt-1 text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
                  <span class="font-medium text-gray-700 dark:text-slate-200">{{ filename }}</span>
                  was running when the server stopped. A checkpoint was saved at line {{ checkpointPtr.toLocaleString() }}.
                </p>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex flex-col gap-2">
              <button
                type="button"
                :disabled="!machineConnected"
                :title="!machineConnected ? 'Connect to machine before resuming' : undefined"
                class="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
                :class="machineConnected
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'"
                @click="resume()"
              >
                Resume from line {{ resumePtr.toLocaleString() }}
              </button>
              <button
                type="button"
                class="w-full py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                @click="loadFresh()"
              >
                Restart from beginning
              </button>
              <button
                type="button"
                class="w-full py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors"
                @click="clearJob()"
              >
                Clear job
              </button>
            </div>

            <!-- Machine not connected hint -->
            <p
              v-if="!machineConnected"
              class="mt-3 text-xs text-center text-amber-600 dark:text-amber-400"
            >
              Connect to machine to enable resume
            </p>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSyncStore } from '~/stores/sync'
import { useMachineStore } from '~/stores/machine'
import { useModals } from '~/composables/useModals'
import { useJobControl } from '~/composables/useJobControl'
import { wsSend } from '~/composables/useWsSend'

const sync = useSyncStore()
const machine = useMachineStore()
const modals = useModals()
const { clearJob: sendClear } = useJobControl()

const entry = computed(() => sync.modals.find((m) => m.kind === 'crash-recovery') ?? null)
const recovery = computed(() => sync.job?.recovery ?? null)

const filename = computed(() => sync.job?.filename ?? 'unknown file')
const checkpointPtr = computed(() => recovery.value?.checkpointPtr ?? 0)
const resumePtr = computed(() => recovery.value?.resumePtr ?? 0)
const machineConnected = computed(() => machine.connected)

function resolve(result: 'resume' | 'fresh' | 'clear') {
  if (entry.value) modals.resolve(entry.value.id, result)
}

function resume() {
  if (!machineConnected.value || !recovery.value) return
  wsSend({ t: 'job:recover:confirm', payload: { resumePtr: recovery.value.resumePtr } })
  resolve('resume')
}

function loadFresh() {
  wsSend({ t: 'job:recover:fresh' })
  resolve('fresh')
}

function clearJob() {
  sendClear()
  resolve('clear')
}
</script>
