<template>
  <header
    class="h-14 flex items-center px-3 gap-3 bg-slate-900 dark:bg-slate-900 bg-white border-b border-slate-700 dark:border-slate-700 border-gray-200 z-50 shadow-lg shrink-0"
  >
    <!-- Left: profile + connect -->
    <div class="flex items-center gap-2 min-w-0 shrink-0">
      <select
        v-model="machine.selectedProfile"
        class="bg-slate-800 dark:bg-slate-800 bg-gray-100 text-slate-200 dark:text-slate-200 text-gray-900 border border-slate-600 dark:border-slate-600 border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-44 cursor-pointer"
      >
        <option v-for="p in machine.profiles" :key="p" :value="p">{{ p }}</option>
      </select>

      <button
        @click="machine.connected ? machine.disconnect() : machine.connect()"
        :class="
          machine.connected
            ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        "
        class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
      >
        {{ machine.connected ? 'Disconnect' : 'Connect' }}
      </button>

      <span
        v-if="machine.connected"
        class="text-xs text-slate-400 dark:text-slate-400 text-gray-500 bg-slate-800 dark:bg-slate-800 bg-gray-100 px-2 py-1 rounded font-mono whitespace-nowrap border border-slate-700 dark:border-slate-700 border-gray-200"
      >
        FluidNC {{ machine.firmwareVersion }}
      </span>
    </div>

    <!-- Center: status + controls -->
    <div class="flex-1 flex items-center justify-center gap-2">
      <div
        :class="statusClass"
        class="px-3 py-1 rounded-md text-sm font-bold tracking-widest select-none"
      >
        {{ machine.status }}
      </div>

      <button
        v-if="machine.status === 'ALARM'"
        @click="machine.sendCommand('$X')"
        class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-sm font-medium transition-colors"
      >
        Unlock
      </button>

      <button
        v-if="machine.connected"
        @click="confirmRestart = true"
        class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-gray-100 rounded-md transition-colors"
        title="Restart firmware"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>

      <!-- Restart confirm -->
      <div
        v-if="confirmRestart"
        class="absolute top-16 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-800 bg-white border border-slate-600 dark:border-slate-600 border-gray-300 rounded-lg shadow-xl p-4 z-50 flex flex-col gap-3"
      >
        <p class="text-sm text-slate-200 dark:text-slate-200 text-gray-800 font-medium">
          Restart FluidNC firmware?
        </p>
        <div class="flex gap-2">
          <button
            @click="doRestart"
            class="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            Restart
          </button>
          <button
            @click="confirmRestart = false"
            class="flex-1 py-1.5 bg-slate-700 dark:bg-slate-700 bg-gray-200 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-300 text-slate-200 dark:text-slate-200 text-gray-700 rounded-md text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      <!-- Sensor status -->
      <div v-if="machine.connected" class="relative">
        <button
          @click="sensorOpen = !sensorOpen"
          :class="anyTriggered ? 'text-red-400 bg-red-900/30' : 'text-slate-400 dark:text-slate-400 text-gray-500'"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-gray-100 transition-colors text-sm"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"
            />
          </svg>
          Sensors
          <span v-if="anyTriggered" class="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        </button>

        <div
          v-if="sensorOpen"
          class="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-60 bg-slate-800 dark:bg-slate-800 bg-white border border-slate-600 dark:border-slate-600 border-gray-200 rounded-lg shadow-2xl p-3 z-50"
        >
          <div class="text-xs text-slate-400 dark:text-slate-400 text-gray-500 font-semibold mb-2 uppercase tracking-wide">
            Limit Switches
          </div>
          <div
            v-for="sw in machine.limitSwitches"
            :key="sw.name"
            class="flex items-center justify-between py-1.5 border-b border-slate-700 dark:border-slate-700 border-gray-100 last:border-0"
          >
            <span class="text-sm text-slate-200 dark:text-slate-200 text-gray-800 font-mono">{{ sw.name }}</span>
            <span
              :class="
                sw.triggered
                  ? 'bg-red-500 text-white'
                  : 'bg-emerald-900 dark:bg-emerald-900 bg-emerald-100 text-emerald-400 dark:text-emerald-400 text-emerald-700'
              "
              class="text-xs px-2 py-0.5 rounded-full font-medium"
            >
              {{ sw.triggered ? 'TRIGGERED' : 'OK' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: theme + user + settings -->
    <div class="flex items-center gap-1 shrink-0">
      <button
        v-if="ui.authEnabled"
        class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-gray-100 rounded-md transition-colors"
        title="Account"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      </button>

      <button
        @click="ui.toggleDarkMode()"
        class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-gray-100 rounded-md transition-colors"
        :title="ui.darkMode ? 'Light mode' : 'Dark mode'"
      >
        <svg v-if="ui.darkMode" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
        <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      </button>

      <button
        class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-gray-100 rounded-md transition-colors"
        title="Settings"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useUiStore } from '~/stores/ui'

const machine = useMachineStore()
const ui = useUiStore()

const sensorOpen = ref(false)
const confirmRestart = ref(false)

const anyTriggered = computed(() => machine.limitSwitches.some((s) => s.triggered))

const statusClass = computed(() => {
  const base = 'min-w-24 text-center '
  const map: Record<string, string> = {
    IDLE: base + 'bg-slate-700 dark:bg-slate-700 bg-gray-200 text-slate-200 dark:text-slate-200 text-gray-700',
    RUN: base + 'bg-blue-600 text-white',
    HOLD: base + 'bg-amber-600 text-white',
    ALARM: base + 'bg-red-600 text-white animate-pulse',
    HOME: base + 'bg-purple-600 text-white',
    DOOR: base + 'bg-orange-600 text-white',
    SLEEP: base + 'bg-slate-600 dark:bg-slate-600 bg-gray-300 text-slate-300 dark:text-slate-300 text-gray-600',
    CHECK: base + 'bg-teal-600 text-white',
    DISCONNECTED: base + 'bg-slate-800 dark:bg-slate-800 bg-gray-100 text-slate-500 dark:text-slate-500 text-gray-400',
  }
  return map[machine.status] ?? map['DISCONNECTED']
})

function doRestart() {
  confirmRestart.value = false
  machine.sendCommand('$RS')
}

onMounted(() => {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (sensorOpen.value && !target.closest('[data-sensor-btn]')) {
      sensorOpen.value = false
    }
    if (confirmRestart.value && !target.closest('[data-restart-confirm]')) {
      confirmRestart.value = false
    }
  })
})
</script>
