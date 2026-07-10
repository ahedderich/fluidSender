<template>
  <DialogsDialogFrame :open="!!entry" size="sm" :dismissible="false" :closable="false">
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
      <DialogsDialogButton
        variant="primary"
        shortcut="dialogConfirm"
        class="w-full"
        :disabled="!machineConnected"
        :title="!machineConnected ? 'Connect to machine before resuming' : undefined"
        @click="resume()"
      >
        Resume from line {{ resumePtr.toLocaleString() }}
      </DialogsDialogButton>
      <DialogsDialogButton variant="neutral" class="w-full" @click="loadFresh()">
        Restart from beginning
      </DialogsDialogButton>
      <DialogsDialogButton variant="ghost-danger" class="w-full" @click="clearJob()">
        Clear job
      </DialogsDialogButton>
    </div>

    <!-- Machine not connected hint -->
    <p
      v-if="!machineConnected"
      class="mt-3 text-xs text-center text-amber-600 dark:text-amber-400"
    >
      Connect to machine to enable resume
    </p>
  </DialogsDialogFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSyncStore } from '~/stores/sync'
import { useMachineStore } from '~/stores/machine'
import { useModals } from '~/composables/useModals'
import { useJobControl } from '~/composables/useJobControl'
import { wsSend } from '~/composables/useWsSend'
import { useDialogShortcuts } from '~/composables/useDialogShortcuts'

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

// No dialogCancel wiring here — there's no single "cancel" action among the three
// choices (resume/restart/clear), so only the primary Resume gets the confirm shortcut.
useDialogShortcuts(() => !!entry.value, { onConfirm: () => { if (machineConnected.value) resume() } })
</script>
