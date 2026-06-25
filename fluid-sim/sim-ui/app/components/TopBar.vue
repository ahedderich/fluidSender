<template>
  <header
    class="h-14 flex items-center px-3 gap-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 z-50 shadow-sm shrink-0"
  >
    <!-- Left: title + connection status -->
    <div class="flex items-center gap-2.5 shrink-0">
      <span class="text-sm font-bold text-gray-900 dark:text-slate-100 whitespace-nowrap">FluidNC Sim</span>
      <span class="h-4 w-px bg-gray-200 dark:bg-slate-700" />
      <div
        :class="s.connected
          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
          : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'"
        class="px-2 py-0.5 rounded text-xs font-semibold"
      >
        {{ s.connected ? 'Connected' : 'Disconnected' }}
      </div>
    </div>

    <!-- Center: machine state + controls -->
    <div class="flex-1 flex items-center justify-center gap-2">
      <div :class="stateClass" class="px-3 py-1 rounded-md text-sm font-bold tracking-widest select-none">
        {{ s.machineState }}
      </div>

      <button
        v-if="s.machineState === 'Alarm'"
        @click="s.softReset"
        class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-xs font-medium transition-colors"
      >
        Clear Alarm
      </button>

      <button
        @click="() => { s.machineState = 'Alarm' }"
        class="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-red-600 hover:text-white text-gray-600 dark:text-slate-300 rounded-md text-xs font-medium transition-colors"
      >
        Trigger Alarm
      </button>

      <button
        @click="s.softReset"
        class="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-md text-xs font-medium transition-colors"
      >
        Soft Reset
      </button>
    </div>

    <!-- Sim speed -->
    <div class="flex items-center gap-2 shrink-0">
      <span class="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">Sim speed</span>
      <input
        v-model.number="s.simSpeed"
        type="range"
        min="1"
        max="10"
        step="1"
        class="w-24 h-1.5 rounded-full appearance-none cursor-pointer accent-blue-600 bg-gray-200 dark:bg-slate-700"
      />
      <span class="text-xs font-bold font-mono text-blue-600 dark:text-blue-400 w-6 text-right">{{ s.simSpeed }}×</span>
    </div>

    <span class="h-4 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

    <!-- Right: theme toggle -->
    <button
      @click="toggleTheme"
      class="p-2 rounded-md text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors shrink-0"
      title="Toggle theme"
    >
      <svg v-if="dark" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" />
      </svg>
      <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    </button>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSimStore } from '~/stores/sim'

const s = useSimStore()
const dark = ref(false)

const stateClass = computed(
  () =>
    ({
      Idle: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
      Run: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
      Hold: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
      Alarm: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
      Homing: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
      Door: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
    })[s.machineState] ?? 'bg-gray-100 text-gray-600',
)

function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
}
</script>
