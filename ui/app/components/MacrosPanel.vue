<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-2"
  >
    <!-- Header -->
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 shrink-0">
      Macros
    </h2>

    <!-- Macro buttons grid -->
    <div v-if="allMacros.length" class="grid grid-cols-2 gap-1.5 content-start flex-1">
      <button
        v-for="macro in allMacros"
        :key="macro.id"
        @click="runMacro(macro.command)"
        class="relative px-2 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-gray-700 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors text-center leading-tight break-words min-h-[2.25rem] flex items-center justify-center group"
      >
        <span
          class="absolute top-0.5 right-1 text-[9px] font-bold leading-none opacity-40 group-hover:opacity-60"
        >{{ macro.source }}</span>
        {{ macro.label }}
      </button>
    </div>

    <!-- Empty state -->
    <div v-else class="flex-1 flex flex-col items-center justify-center py-4 text-center gap-2">
      <svg class="w-6 h-6 text-gray-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
      <p class="text-xs text-gray-400 dark:text-slate-500">No macros configured</p>
      <RouterLink
        to="/settings"
        class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        Add in Settings
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'
import { useMachineStore } from '~/stores/machine'

const settings = useSettingsStore()
const machine = useMachineStore()

const allMacros = computed(() => [
  ...settings.app.macros.map((m) => ({ ...m, source: 'A' })),
  ...(settings.activeMachine?.macros ?? []).map((m) => ({ ...m, source: 'M' })),
])

function runMacro(command: string) {
  machine.sendCommand(command)
}
</script>
