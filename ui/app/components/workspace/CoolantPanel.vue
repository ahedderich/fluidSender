<template>
  <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-3">

    <!-- Header -->
    <div class="flex items-center justify-between shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Coolant
      </h2>
      <span
        class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
        :class="machine.connected && machine.coolant !== 'off'
          ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'"
      >{{ !machine.connected ? 'null' : machine.coolant === 'off' ? 'OFF' : machine.coolant.toUpperCase() }}</span>
    </div>

    <!-- Three-state buttons -->
    <div
      class="flex flex-col gap-2 flex-1 justify-center"
      :class="{ 'opacity-50 pointer-events-none': jobActive || isViewer }"
      :title="isViewer ? 'Viewers cannot control coolant' : jobActive ? 'Coolant control is disabled while a job is running' : undefined"
    >
      <button
        @click="machine.sendCommand('M9')"
        :class="machine.coolant === 'off'
          ? 'bg-gray-300 dark:bg-slate-600 text-gray-700 dark:text-slate-300 ring-1 ring-gray-400 dark:ring-slate-500'
          : 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-400'"
        class="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
      >
        Off
      </button>
      <button
        @click="machine.sendCommand('M7')"
        :class="machine.coolant === 'mist'
          ? 'bg-cyan-500 text-white ring-1 ring-cyan-400'
          : 'bg-gray-100 dark:bg-slate-700 hover:bg-cyan-500 hover:text-white dark:hover:bg-cyan-500 text-gray-600 dark:text-slate-400'"
        class="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
      >
        Mist
      </button>
      <button
        @click="machine.sendCommand('M8')"
        :class="machine.coolant === 'flood'
          ? 'bg-blue-600 text-white ring-1 ring-blue-500'
          : 'bg-gray-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-gray-600 dark:text-slate-400'"
        class="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
      >
        Flood
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useSyncStore } from '~/stores/sync'
import { useCurrentUser } from '~/composables/useCurrentUser'

const machine = useMachineStore()
const sync = useSyncStore()
const currentUser = useCurrentUser()
const isViewer = computed(() => currentUser.value.isViewer)

const jobActive = computed(() => {
  const s = sync.job?.status
  return s === 'running' || s === 'pausing' || s === 'paused' || s === 'stopping' || s === 'recovering'
})
</script>
