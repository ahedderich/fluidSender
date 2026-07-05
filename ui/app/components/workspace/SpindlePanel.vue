<template>
  <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-3">

    <!-- Header -->
    <div class="flex items-center justify-between shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        {{ isLaser ? 'Laser' : 'Spindle' }}
      </h2>
      <div class="flex items-center gap-1.5">
        <span
          v-if="machine.connected && machine.spindleOn && !isLaser"
          class="text-xs font-mono text-gray-600 dark:text-slate-300"
        >{{ machine.spindleRpm.toLocaleString() }} rpm</span>
        <span
          class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          :class="!machine.connected
            ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
            : machine.spindleOn
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'"
        >{{ !machine.connected ? 'null' : machine.spindleOn ? 'ON' : 'OFF' }}</span>
      </div>
    </div>

    <!-- Controls (disabled while a job is active) -->
    <div
      :class="{ 'opacity-50 pointer-events-none': jobActive || isViewer }"
      :title="isViewer ? 'Viewers cannot control spindle' : jobActive ? 'Spindle control is disabled while a job is running' : undefined"
    >

    <!-- ── Spindle (router / plasma) ── -->
    <template v-if="!isLaser">

      <!-- Direction -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-400 dark:text-slate-500 w-16 shrink-0">Direction</span>
        <div class="flex items-center gap-0.5 bg-gray-100 dark:bg-slate-900 rounded-md p-0.5">
          <button
            @click="machine.spindleDir = 'cw'"
            :class="machine.spindleDir === 'cw' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 shadow-sm' : 'text-gray-400 dark:text-slate-500'"
            class="px-2.5 py-1 rounded text-xs font-medium transition-all"
          >CW</button>
          <button
            @click="machine.spindleDir = 'ccw'"
            :class="machine.spindleDir === 'ccw' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 shadow-sm' : 'text-gray-400 dark:text-slate-500'"
            class="px-2.5 py-1 rounded text-xs font-medium transition-all"
          >CCW</button>
        </div>
      </div>

      <!-- RPM -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-400 dark:text-slate-500 w-16 shrink-0">RPM</span>
        <button
          @click="machine.spindleRpm = Math.max(0, machine.spindleRpm - 500)"
          class="w-7 h-7 flex items-center justify-center bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded-md text-sm font-bold transition-colors shrink-0"
        >−</button>
        <input
          v-model.number="machine.spindleRpm"
          type="number"
          min="0"
          max="30000"
          step="100"
          class="flex-1 min-w-0 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-sm font-mono text-right px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span class="text-xs text-gray-400 dark:text-slate-500 shrink-0">rpm</span>
        <button
          @click="machine.spindleRpm = Math.min(30000, machine.spindleRpm + 500)"
          class="w-7 h-7 flex items-center justify-center bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded-md text-sm font-bold transition-colors shrink-0"
        >+</button>
      </div>

      <!-- On / Off -->
      <div class="flex gap-2">
        <button
          @click="spindleOn"
          :class="machine.spindleOn ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-gray-100 dark:bg-slate-700 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 text-gray-700 dark:text-slate-300'"
          class="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
          :style="machine.spindleOn ? 'color: white' : ''"
        >
          On
        </button>
        <button
          @click="machine.sendCommand('M5')"
          :class="!machine.spindleOn ? 'bg-gray-300 dark:bg-slate-600 text-gray-600 dark:text-slate-400' : 'bg-gray-100 dark:bg-slate-700 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 text-gray-700 dark:text-slate-300'"
          class="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Off
        </button>
      </div>
    </template>

    <!-- ── Laser ── -->
    <template v-else>

      <!-- Mode -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-400 dark:text-slate-500 w-16 shrink-0">Mode</span>
        <div class="flex items-center gap-0.5 bg-gray-100 dark:bg-slate-900 rounded-md p-0.5">
          <button
            @click="laserMode = 'dynamic'"
            :class="laserMode === 'dynamic' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 shadow-sm' : 'text-gray-400 dark:text-slate-500'"
            class="px-2.5 py-1 rounded text-xs font-medium transition-all"
          >Dynamic</button>
          <button
            @click="laserMode = 'constant'"
            :class="laserMode === 'constant' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 shadow-sm' : 'text-gray-400 dark:text-slate-500'"
            class="px-2.5 py-1 rounded text-xs font-medium transition-all"
          >Constant</button>
        </div>
      </div>

      <!-- Power -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-400 dark:text-slate-500 w-16 shrink-0">Power</span>
        <input
          v-model.number="laserPower"
          type="range"
          min="0"
          max="100"
          step="1"
          class="override-slider flex-1"
        />
        <span class="text-xs font-mono text-gray-700 dark:text-slate-300 w-8 text-right shrink-0">{{ laserPower }}%</span>
      </div>

      <!-- Enable / Disable -->
      <div class="flex gap-2">
        <button
          @click="laserEnable"
          :class="machine.spindleOn ? 'bg-amber-500 hover:bg-amber-400 text-white' : 'bg-gray-100 dark:bg-slate-700 hover:bg-amber-500 hover:text-white dark:hover:bg-amber-500 text-gray-700 dark:text-slate-300'"
          class="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Enable
        </button>
        <button
          @click="machine.sendCommand('M5')"
          :class="!machine.spindleOn ? 'bg-gray-300 dark:bg-slate-600 text-gray-600 dark:text-slate-400' : 'bg-gray-100 dark:bg-slate-700 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 text-gray-700 dark:text-slate-300'"
          class="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Disable
        </button>
      </div>
    </template>

    </div><!-- end controls wrapper -->

  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useSettingsStore } from '~/stores/settings'
import { useSyncStore } from '~/stores/sync'
import { useCurrentUser } from '~/composables/useCurrentUser'

const machine = useMachineStore()
const settings = useSettingsStore()
const sync = useSyncStore()
const currentUser = useCurrentUser()
const isViewer = computed(() => currentUser.value.isViewer)

const isLaser = computed(() => settings.activeMachine?.type === 'laser')
const jobActive = computed(() => {
  const s = sync.job?.status
  return s === 'running' || s === 'pausing' || s === 'paused' || s === 'stopping' || s === 'recovering'
})

const laserMode = ref<'dynamic' | 'constant'>('dynamic')
const laserPower = ref(50)

function spindleOn() {
  const cmd = machine.spindleDir === 'cw' ? 'M3' : 'M4'
  machine.sendCommand(`${cmd} S${machine.spindleRpm}`)
}

function laserEnable() {
  const cmd = laserMode.value === 'dynamic' ? 'M4' : 'M3'
  const s = Math.round(laserPower.value * 10)
  machine.sendCommand(`${cmd} S${s}`)
}
</script>
