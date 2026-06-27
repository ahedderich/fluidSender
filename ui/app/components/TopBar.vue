<template>
  <header
    class="h-14 flex items-center px-3 gap-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 z-50 shadow-lg shrink-0"
  >
    <!-- Left: machine selector + connect -->
    <div class="flex items-center gap-2 min-w-0 shrink-0">
      <select
        v-if="s.hasMachines"
        :value="s.activeMachineId"
        @change="(e) => s.selectMachine((e.target as HTMLSelectElement).value)"
        class="bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-200 border border-gray-300 dark:border-slate-600 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-44 cursor-pointer"
      >
        <option v-for="m in s.machines" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <span
        v-else
        class="text-sm text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-3 py-1.5 rounded-md border border-gray-200 dark:border-slate-700"
      >No machine configured</span>

      <button
        @click="machine.connected ? machine.disconnect() : machine.connect()"
        :disabled="!s.hasMachines || machine.connecting"
        :class="connectBtnClass"
        class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
      >
        <span v-if="machine.connecting" class="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        {{ machine.connecting ? 'Connecting…' : machine.connected ? 'Disconnect' : 'Connect' }}
      </button>

      <span
        v-if="machine.connected"
        class="text-xs text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded font-mono whitespace-nowrap border border-gray-200 dark:border-slate-700"
      >
        FluidNC {{ machine.firmwareVersion }}
      </span>

      <!-- WS offline indicator -->
      <span
        v-if="!wsConnected"
        class="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 px-2 py-1 rounded whitespace-nowrap"
        title="Lost connection to server — reconnecting…"
      >
        Server offline
      </span>

      <!-- Connection error -->
      <span
        v-if="machine.connectionError"
        class="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 px-2 py-1 rounded max-w-xs truncate"
        :title="machine.connectionError"
      >
        {{ machine.connectionError }}
      </span>
    </div>

    <!-- Center: status + controls -->
    <div class="flex-1 flex items-center justify-center gap-2">
      <div
        :class="statusClass"
        class="px-3 py-1 rounded-md text-sm font-bold tracking-widest select-none"
      >
        {{ machine.connected && !machine.telemetryLoaded ? 'null' : machine.machineState }}
      </div>

      <button
        v-if="machine.machineState === 'Alarm'"
        @click="machine.sendCommand('$X')"
        class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-sm font-medium transition-colors"
      >
        Unlock
      </button>

      <!-- Job controls -->
      <button
        v-if="job?.status === 'paused'"
        @click="resumeJob"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-md text-sm font-medium transition-colors"
        title="Resume"
      >
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        Resume
      </button>
      <button
        :disabled="!machine.connected || !job || (job.status !== 'loaded' && job.status !== 'complete')"
        @click="startJob"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md text-sm font-medium transition-colors"
        :class="machine.connected && job && (job.status === 'loaded' || job.status === 'complete') ? 'hover:bg-green-500' : 'opacity-40 cursor-not-allowed'"
        title="Cycle Start"
      >
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        Cycle Start
      </button>
      <button
        :disabled="!job || job.status !== 'running'"
        @click="pauseJob"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-md text-sm font-medium transition-colors"
        :class="job?.status === 'running' ? 'hover:bg-amber-400' : 'opacity-40 cursor-not-allowed'"
        title="Pause"
      >
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
        Pause
      </button>
      <button
        :disabled="!machine.connected"
        @click="() => { cancelJob(); machine.sendCommand('\x18') }"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-md text-sm font-medium transition-colors"
        :class="machine.connected ? 'hover:bg-red-500' : 'opacity-40 cursor-not-allowed'"
        title="Stop — cancels job and sends soft reset to flush FluidNC buffer"
      >
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 6h12v12H6z" />
        </svg>
        Stop
      </button>

      <button
        v-if="machine.connected"
        @click="restartFirmware"
        class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
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

      <!-- Sensor status -->
      <div v-if="machine.connected" class="relative">
        <button
          @click="sensorOpen = !sensorOpen"
          :class="anyTriggered ? 'text-red-400 bg-red-900/30' : 'text-gray-500 dark:text-slate-400'"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-sm"
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
          class="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-60 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-2xl p-3 z-50"
        >
          <div class="text-xs text-gray-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wide">
            Limit Switches
          </div>
          <p
            v-if="!machine.telemetryLoaded"
            class="text-sm font-mono text-gray-400 dark:text-slate-500 py-1.5"
          >
            null
          </p>
          <div
            v-for="sw in machine.limitSwitches"
            :key="sw.name"
            class="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-slate-700 last:border-0"
          >
            <span class="text-sm text-gray-800 dark:text-slate-200 font-mono">{{ sw.name }}</span>
            <span
              :class="
                sw.triggered
                  ? 'bg-red-500 text-white'
                  : 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-400'
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
        class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
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
        class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
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

      <!-- Back arrow only shown when machines exist; otherwise settings icon is always shown -->
      <NuxtLink
        v-if="isSettings && s.hasMachines"
        to="/"
        class="p-1.5 rounded-md transition-colors text-blue-500 bg-blue-50 dark:bg-blue-900/30"
        title="Back to main"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </NuxtLink>
      <NuxtLink
        v-else-if="!isSettings"
        to="/settings"
        class="p-1.5 rounded-md transition-colors text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
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
      </NuxtLink>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useSettingsStore } from '~/stores/settings'
import { useUiStore } from '~/stores/ui'
import { useConfirm } from '~/composables/useConfirm'
import { wsConnected } from '~/composables/useWsSend'
import { useJobControl } from '~/composables/useJobControl'

const machine = useMachineStore()
const s = useSettingsStore()
const ui = useUiStore()
const { confirm } = useConfirm()
const { job, startJob, pauseJob, resumeJob, cancelJob } = useJobControl()
const route = useRoute()
const isSettings = computed(() => route.path === '/settings')

const sensorOpen = ref(false)

const anyTriggered = computed(() => machine.limitSwitches.some((s) => s.triggered))

const connectBtnClass = computed(() => {
  if (machine.connecting) return 'bg-blue-500 text-white opacity-75 cursor-not-allowed'
  if (!s.hasMachines) return 'bg-gray-300 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
  if (machine.connected) return 'bg-emerald-700 hover:bg-emerald-600 text-white'
  return 'bg-blue-600 hover:bg-blue-500 text-white'
})

const statusClass = computed(() => {
  const base = 'min-w-24 text-center '
  const map: Record<string, string> = {
    Idle: base + 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200',
    Run: base + 'bg-blue-600 text-white',
    Hold: base + 'bg-amber-600 text-white',
    Jog: base + 'bg-blue-500 text-white',
    Alarm: base + 'bg-red-600 text-white animate-pulse',
    Home: base + 'bg-purple-600 text-white',
    Door: base + 'bg-orange-600 text-white',
    Sleep: base + 'bg-gray-300 dark:bg-slate-600 text-gray-600 dark:text-slate-300',
    Check: base + 'bg-teal-600 text-white',
    Disconnected: base + 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500',
  }
  return map[machine.machineState] ?? map['Disconnected']
})

async function restartFirmware() {
  const ok = await confirm({
    title: 'Restart FluidNC firmware?',
    message: 'The controller will reboot. Any running job will be interrupted.',
    confirmLabel: 'Restart',
    danger: true,
  })
  if (ok) machine.sendCommand('$RS')
}

onMounted(() => {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (sensorOpen.value && !target.closest('[data-sensor-btn]')) {
      sensorOpen.value = false
    }
  })
})
</script>
