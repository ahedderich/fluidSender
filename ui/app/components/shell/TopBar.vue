<template>
  <header
    class="h-14 flex items-center px-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 z-50 shadow-lg shrink-0"
  >
    <!-- ── 1. Connect area (left-bound, natural width) ───────────────────── -->
    <!-- Contains: machine select, connect button, firmware version, restart -->
    <div class="shrink-0 flex items-center gap-2 pr-3">
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
        :disabled="!s.hasMachines || machine.connecting || currentUser.isViewer"
        v-if="machine.connected || true"
        :class="connectBtnClass"
        class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
      >
        <span v-if="isMounted && machine.connecting" class="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        {{ isMounted ? (machine.connecting ? 'Connecting…' : machine.connected ? 'Disconnect' : 'Connect') : 'Connect' }}
      </button>

      <div v-if="machine.connected" class="flex items-center gap-1">
        <span class="text-xs text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded font-mono whitespace-nowrap border border-gray-200 dark:border-slate-700">
          FluidNC {{ machine.firmwareVersion }}
        </span>
        <button
          @click="restartFirmware"
          class="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
          title="Restart firmware"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

      </div>

      <span
        v-if="machine.simulatorMode"
        class="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-600/50 px-2 py-1 rounded whitespace-nowrap font-medium"
        title="FluidNC is running in simulator mode — check your config.yaml"
      >Simulator mode</span>

      <span
        v-if="!wsConnected"
        class="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 px-2 py-1 rounded whitespace-nowrap"
        title="Lost connection to server — reconnecting…"
      >Server offline</span>

      <span
        v-if="machine.connectionError"
        class="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 px-2 py-1 rounded max-w-xs truncate"
        :title="machine.connectionError"
      >{{ machine.connectionError }}</span>

      <span
        v-if="sync.calibrationActive"
        class="text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700/50 px-2 py-1 rounded whitespace-nowrap"
        title="Probe calibration in progress — jogging is disabled"
      >Calibrating probe</span>
    </div>

    <!-- ── 2. Cycle area (65% of remaining space, content centered) ────────── -->
    <!-- Contains: machine state badge, unlock, job hints, cycle start, pause, stop -->
    <div class="flex-[75] flex items-center justify-center gap-2 min-w-0">
      <div
        :class="statusClass"
        class="px-3 py-1 rounded-md text-sm font-bold tracking-widest select-none"
      >
        {{ machine.machineState }}
      </div>

      <button
        v-if="machine.machineState === 'Alarm'"
        @click="machine.sendCommand('$X')"
        class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-sm font-medium transition-colors"
      >
        Unlock
      </button>

      <span
        v-if="job?.status === 'pausing'"
        class="text-xs px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 font-medium whitespace-nowrap"
        title="Waiting for queued moves to finish before pausing."
      >Pausing…</span>

      <span
        v-if="job?.status === 'paused'"
        class="text-xs px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 font-medium whitespace-nowrap"
        title="Machine is paused. Jog freely — Resume will safely return to pause position."
      >Paused · Jog enabled</span>

      <span
        v-if="job?.status === 'recovering'"
        class="text-xs px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700/60 font-medium whitespace-nowrap"
        title="Machine is returning to the pause position before resuming the job."
      >Resuming — returning to position…</span>

      <button
        :disabled="!machine.connected || !cycleStartEnabled"
        @click="cycleStartAction"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md text-sm font-medium transition-colors"
        :class="machine.connected && cycleStartEnabled ? 'hover:bg-green-500' : 'opacity-40 cursor-not-allowed'"
        :title="job?.status === 'paused' ? 'Resume — machine will safely return to pause position' : 'Cycle Start'"
      >
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        {{ job?.status === 'paused' ? 'Resume' : 'Cycle Start' }}
      </button>

      <button
        :disabled="!job || job.status !== 'running'"
        @click="pauseJob"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-md text-sm font-medium transition-colors"
        :class="job?.status === 'running' ? 'hover:bg-amber-400' : 'opacity-40 cursor-not-allowed'"
        title="Pause — feed hold, machine decelerates and holds position"
      >
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
        Pause
      </button>

      <button
        :disabled="!['running', 'pausing', 'paused', 'stopping', 'recovering'].includes(job?.status ?? '')"
        @click="stopJob"
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors"
        :class="['running', 'pausing', 'paused', 'stopping', 'recovering'].includes(job?.status ?? '')
          ? 'border-red-400 dark:border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'border-gray-200 dark:border-slate-600 text-gray-300 dark:text-slate-600 cursor-not-allowed'"
        title="Stop — feed hold then reset, machine returns to Idle"
      >
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
        Stop
      </button>
    </div>

    <!-- ── 3. Emergency area (35% of remaining space, content centered) ───── -->
    <!-- Contains: E-Stop button only -->
    <div class="flex-[25] flex items-center justify-center">
      <button
        :disabled="!machine.connected"
        @click="emergencyStop"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-md text-sm font-bold transition-colors"
        :class="machine.connected ? 'hover:bg-red-500' : 'opacity-40 cursor-not-allowed'"
        title="Emergency Stop — immediate halt, no deceleration, machine may alarm"
      >
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm-1 14V8h2v8h-2z" />
        </svg>
        E-Stop
      </button>
    </div>

    <!-- ── 4. Menu area (right-bound, natural width) ──────────────────────── -->
    <!-- Contains: sensors panel, dark/light toggle, user icon, settings -->
    <div class="shrink-0 flex items-center gap-1 pl-3">
      <!-- Sensors panel -->
      <div v-if="machine.connected" class="relative">
        <button
          @click="sensorOpen = !sensorOpen"
          :class="anyTriggered ? 'text-red-400 bg-red-900/30' : 'text-gray-500 dark:text-slate-400'"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-sm"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
          Sensors
          <span v-if="anyTriggered" class="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        </button>

        <div
          v-if="sensorOpen"
          class="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-2xl p-3 z-50 space-y-3"
        >
          <div class="flex items-center justify-between pb-1.5 border-b border-gray-100 dark:border-slate-700">
            <span class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Machine Sensors</span>
            <button
              @click="sensorOpen = false"
              class="p-0.5 rounded text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div>
            <div class="text-xs text-gray-500 dark:text-slate-400 font-semibold mb-1.5 uppercase tracking-wide">Limit Switches</div>
            <div class="grid grid-cols-2 gap-x-2 gap-y-0.5">
              <div v-for="axis in configuredAxes" :key="axis" class="flex items-center justify-between py-1 px-1.5 rounded">
                <span class="text-sm text-gray-800 dark:text-slate-200 font-mono">{{ axis }}</span>
                <span
                  :class="machine.limitSwitches.some(sw => sw.name === axis && sw.triggered) ? 'bg-red-500 text-white' : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400'"
                  class="text-xs px-2 py-0.5 rounded-full font-medium"
                >{{ machine.limitSwitches.some(sw => sw.name === axis && sw.triggered) ? 'TRIGGERED' : 'OK' }}</span>
              </div>
            </div>
          </div>

          <div v-if="hasProbe || hasToolsetter || hasDoor">
            <div class="text-xs text-gray-500 dark:text-slate-400 font-semibold mb-1.5 uppercase tracking-wide border-t border-gray-100 dark:border-slate-700 pt-2.5">Inputs</div>
            <div class="space-y-1">
              <div v-if="hasProbe" class="flex items-center justify-between py-1 px-1.5 rounded">
                <span class="text-sm text-gray-800 dark:text-slate-200">Probe</span>
                <span :class="machine.probe ? 'bg-amber-500 text-white' : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400'" class="text-xs px-2 py-0.5 rounded-full font-medium">
                  {{ machine.probe ? 'TRIGGERED' : 'OK' }}
                </span>
              </div>
              <div v-if="hasToolsetter" class="flex items-center justify-between py-1 px-1.5 rounded">
                <span class="text-sm text-gray-800 dark:text-slate-200">Toolsetter</span>
                <span :class="machine.toolsetter ? 'bg-amber-500 text-white' : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400'" class="text-xs px-2 py-0.5 rounded-full font-medium">
                  {{ machine.toolsetter ? 'TRIGGERED' : 'OK' }}
                </span>
              </div>
              <div v-if="hasDoor" class="flex items-center justify-between py-1 px-1.5 rounded">
                <span class="text-sm text-gray-800 dark:text-slate-200">Safety Door</span>
                <span :class="machine.door ? 'bg-red-500 text-white' : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400'" class="text-xs px-2 py-0.5 rounded-full font-medium">
                  {{ machine.door ? 'OPEN' : 'CLOSED' }}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <button
        @click="ui.toggleDarkMode()"
        class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
        :title="ui.darkMode ? 'Light mode' : 'Dark mode'"
      >
        <svg v-if="ui.darkMode" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </button>

      <!-- User menu (auth enabled only) -->
      <div v-if="ui.authEnabled" class="relative">
        <button
          @click="userMenuOpen = !userMenuOpen"
          class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
          :title="currentUser.username"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </button>

        <div
          v-if="userMenuOpen"
          class="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-2xl z-50 overflow-hidden"
        >
          <div class="px-3 py-2 border-b border-gray-100 dark:border-slate-700">
            <p class="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-wide">Signed in as</p>
            <p class="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{{ currentUser.username }}</p>
          </div>
          <button
            @click="logout"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </div>

      <!-- Tools button: wrench normally; back arrow when on /tools -->
      <NuxtLink
        v-if="route.path !== '/tools'"
        to="/tools"
        class="p-1.5 rounded-md transition-colors text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
        title="Tools"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-6.837m5.041-.241c.658-.479 1.363-.904 2.076-1.255L21 4.5l-3.75 3.75L15 7.5l-1.5-1.5 3.75-3.75L12.75 3l-.75 3.75-.879 3.879" />
        </svg>
      </NuxtLink>
      <NuxtLink
        v-else
        to="/"
        class="p-1.5 rounded-md transition-colors text-blue-500 bg-blue-50 dark:bg-blue-900/30"
        title="Back to main"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </NuxtLink>

      <!-- Settings button: gear normally; back arrow when on /settings (with machines configured) -->
      <NuxtLink
        v-if="route.path === '/settings' && s.hasMachines"
        to="/"
        class="p-1.5 rounded-md transition-colors text-blue-500 bg-blue-50 dark:bg-blue-900/30"
        title="Back to main"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </NuxtLink>
      <NuxtLink
        v-else-if="route.path !== '/settings'"
        to="/settings"
        class="p-1.5 rounded-md transition-colors text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
        title="Settings"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
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
import { useSyncStore } from '~/stores/sync'
import { useConfirm } from '~/composables/useConfirm'
import { wsConnected } from '~/composables/useWsSend'
import { useJobControl } from '~/composables/useJobControl'
import { useCurrentUser } from '~/composables/useCurrentUser'

const machine = useMachineStore()
const sync = useSyncStore()
const s = useSettingsStore()
const ui = useUiStore()
const { confirm } = useConfirm()
const { job, startJob, pauseJob, resumeJob, stopJob: _stopJob, emergencyStop } = useJobControl()
const currentUser = useCurrentUser()

const userMenuOpen = ref(false)
const router = useRouter()

async function logout() {
  userMenuOpen.value = false
  await $fetch('/api/auth/logout', { method: 'POST' })
  router.push('/login')
}

async function stopJob() {
  const ok = await confirm({
    title: 'Stop job?',
    message: 'The machine will decelerate, reset to Idle, and return to the start of the job.',
    confirmLabel: 'Stop',
    danger: true,
  })
  if (ok) _stopJob()
}

const cycleStartEnabled = computed(() =>
  !!job.value && (
    job.value.status === 'loaded' ||
    job.value.status === 'complete' ||
    job.value.status === 'paused'
  )
)

function cycleStartAction() {
  if (job.value?.status === 'paused') resumeJob()
  else startJob()
}
const route = useRoute()
const isMounted = ref(false)
onMounted(() => { isMounted.value = true })

const sensorOpen = ref(false)

const fluidncCfg = computed(() => s.activeMachine?.fluidncConfig ?? null)

const isRealPin = (pin: string | undefined): boolean => !!pin && pin !== 'NO_PIN' && pin !== ''

// Axes that have at least one limit switch pin configured; fall back to mpos-derived list
const configuredAxes = computed(() => {
  const cfg = fluidncCfg.value
  if (cfg?.axes && Object.keys(cfg.axes).length > 0) {
    const withLimits = Object.keys(cfg.axes).filter((a) => {
      const m = cfg.axes![a]?.motor0 as Record<string, string | undefined> | undefined
      return isRealPin(m?.limit_neg_pin) || isRealPin(m?.limit_pos_pin)
    })
    if (withLimits.length > 0) return withLimits.map((a) => a.toUpperCase())
  }
  const axes = ['X', 'Y', 'Z']
  if (machine.machinePos.a !== undefined) axes.push('A')
  return axes
})

const probeCfg = computed(() => fluidncCfg.value?.probe as Record<string, string> | undefined)
const controlCfg = computed(() => fluidncCfg.value?.control as Record<string, string> | undefined)
const hasProbe = computed(() => isRealPin(probeCfg.value?.pin) || machine.probe)
const hasToolsetter = computed(() => isRealPin(probeCfg.value?.toolsetter_pin) || machine.toolsetter)
const hasDoor = computed(() => isRealPin(controlCfg.value?.safety_door_pin) || machine.door)

const anyTriggered = computed(() =>
  machine.limitSwitches.some((s) => s.triggered) || machine.probe || machine.toolsetter || machine.door
)

const connectBtnClass = computed(() => {
  // Read all deps unconditionally so Vue tracks them regardless of which branch executes.
  // Early-return branches would silently drop deps, leaving the computed stale when they change.
  const isConnecting = machine.connecting
  const isConnected = machine.connected
  const hasMachines = s.hasMachines
  const isViewer = currentUser.value.isViewer
  if (isViewer) return 'bg-gray-300 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
  if (isConnecting) return 'bg-blue-500 text-white opacity-75 cursor-not-allowed'
  if (isConnected) return 'bg-emerald-700 hover:bg-emerald-600 text-white'
  if (!hasMachines) return 'bg-gray-300 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
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
  if (ok) machine.sendCommand('$bye')
}

</script>
