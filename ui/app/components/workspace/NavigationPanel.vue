<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-2"
  >
    <!-- Header + mode toggle -->
    <div class="flex items-center justify-between shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Navigation
      </h2>
      <div v-if="isJobActive" class="flex items-center gap-1 ml-2 mr-auto">
        <span class="text-xs text-gray-400 dark:text-slate-500">F</span>
        <span class="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">{{ machine.feed }}</span>
        <span class="text-xs text-gray-400 dark:text-slate-500">mm/m</span>
      </div>
      <div class="flex items-center gap-0.5 bg-gray-100 dark:bg-slate-900 rounded-md p-0.5">
        <button
          @click="navMode = 'buttons'"
          :class="navMode === 'buttons' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 shadow-sm' : 'text-gray-400 dark:text-slate-500'"
          class="px-2.5 py-1 rounded text-xs font-medium transition-all"
        >
          Buttons
        </button>
        <button
          @click="navMode = 'joystick'"
          :class="navMode === 'joystick' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 shadow-sm' : 'text-gray-400 dark:text-slate-500'"
          class="px-2.5 py-1 rounded text-xs font-medium transition-all"
        >
          Joystick
        </button>
      </div>
    </div>

    <!-- 5-column body -->
    <div class="flex gap-2 items-stretch shrink-0">

      <!-- Col 1: Speed value inputs -->
      <div class="flex flex-col gap-1.5 shrink-0 w-28">
        <div>
          <label class="text-xs text-gray-400 dark:text-slate-500 block mb-0.5">Speed</label>
          <div class="flex items-center gap-1">
            <input
              v-model.number="jogSpeed"
              type="number"
              min="1"
              max="10000"
              :disabled="!movementEnabled"
              class="flex-1 min-w-0 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-xs font-mono text-right px-1.5 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
            />
            <span class="text-xs text-gray-400 shrink-0">mm/m</span>
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-400 dark:text-slate-500 block mb-0.5">XY Step</label>
          <div class="flex items-center gap-1">
            <input
              v-model.number="xyStepSize"
              type="number"
              min="0.001"
              max="100"
              step="0.1"
              :disabled="!movementEnabled"
              class="flex-1 min-w-0 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-xs font-mono text-right px-1.5 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
            />
            <span class="text-xs text-gray-400 shrink-0">mm</span>
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-400 dark:text-slate-500 block mb-0.5">Z Step</label>
          <div class="flex items-center gap-1">
            <input
              v-model.number="zStepSize"
              type="number"
              min="0.001"
              max="100"
              step="0.1"
              :disabled="!movementEnabled"
              class="flex-1 min-w-0 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-xs font-mono text-right px-1.5 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
            />
            <span class="text-xs text-gray-400 shrink-0">mm</span>
          </div>
        </div>
      </div>

      <!-- Col 2: Speed preset buttons -->
      <div class="flex flex-col gap-1 shrink-0 w-14">
        <button
          v-for="(speed, i) in speeds"
          :key="speed.label"
          @click="selectSpeed(i)"
          :disabled="!movementEnabled"
          :class="activeSpeedIndex === i ? 'bg-blue-600 text-white' : (!movementEnabled ? 'bg-gray-100 dark:bg-slate-700 opacity-40 cursor-not-allowed text-gray-700 dark:text-slate-300' : 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300')"
          class="w-full flex-1 rounded-md text-xs font-medium transition-colors"
        >
          {{ speed.label }}
        </button>
      </div>

      <!-- Col 3: XY direction buttons or joystick — fixed footprint keeps panel height stable -->
      <div class="flex-none flex items-center justify-center w-[9.75rem] min-h-[9.75rem] mx-4">
        <div v-if="navMode === 'buttons'" class="grid grid-cols-3 gap-1.5">
          <button
            v-for="dir in xyDirs"
            :key="dir.label"
            @pointerdown="dir.label !== '○' ? startJog(dir.dx, dir.dy, 0) : null"
            @pointerup="stopJog"
            @pointerleave="stopJog"
            @pointercancel="stopJog"
            :disabled="!canJog || dir.label === '○'"
            :class="dir.label === '○' ? 'bg-gray-200 dark:bg-slate-900 cursor-default text-gray-400 dark:text-slate-600' : !canJog ? 'bg-gray-100 dark:bg-slate-700 opacity-40 cursor-not-allowed text-gray-800 dark:text-slate-200' : 'bg-gray-100 dark:bg-slate-700 hover:bg-blue-700 active:bg-blue-600 text-gray-800 dark:text-slate-200 cursor-pointer'"
            class="w-12 h-12 rounded-lg text-lg font-bold flex items-center justify-center transition-colors select-none touch-none"
          >
            {{ dir.label }}
          </button>
        </div>
        <div v-else>
          <UiJoystickControl :disabled="!canJog" @move="onJoystickMove" />
        </div>
      </div>

      <!-- Col 4: Z axis (and future rotary axes) -->
      <div class="flex flex-col items-center gap-3 shrink-0 w-12">
        <button
          @pointerdown="startJog(0, 0, 1)"
          @pointerup="stopJog"
          @pointerleave="stopJog"
          @pointercancel="stopJog"
          :disabled="!canJog"
          :class="!canJog ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-700 active:bg-blue-600 cursor-pointer'"
          class="w-full flex-1 min-h-0 bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200 rounded-lg text-lg font-bold flex items-center justify-center transition-colors select-none touch-none"
        >
          ▲
        </button>
        <span class="text-xs font-bold text-gray-400 dark:text-slate-500 shrink-0 py-0.5">Z</span>
        <button
          @pointerdown="startJog(0, 0, -1)"
          @pointerup="stopJog"
          @pointerleave="stopJog"
          @pointercancel="stopJog"
          :disabled="!canJog"
          :class="!canJog ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-700 active:bg-blue-600 cursor-pointer'"
          class="w-full flex-1 min-h-0 bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200 rounded-lg text-lg font-bold flex items-center justify-center transition-colors select-none touch-none"
        >
          ▼
        </button>
      </div>

      <!-- Col 5: Goto / parking buttons -->
      <div class="flex flex-col gap-1 shrink-0 w-16 ml-4">
        <button
          :disabled="!movementEnabled"
          @click="machine.sendCommand('$H')"
          class="w-full flex-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-md text-xs font-medium transition-colors truncate disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Parking
        </button>
        <button
          :disabled="!movementEnabled"
          @click="machine.sendCommand('G0 G54 X0 Y0')"
          class="w-full flex-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          → XY
        </button>
        <button
          :disabled="!movementEnabled"
          @click="machine.sendCommand('G0 G54 Z0')"
          class="w-full flex-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          → Z
        </button>
        <button
          :disabled="!movementEnabled"
          @click="showGotoPos = !showGotoPos"
          class="w-full flex-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Goto Pos
        </button>
      </div>

    </div>

    <!-- Goto Pos dialog -->
    <Teleport to="body">
      <div
        v-if="showGotoPos"
        class="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
        @click.self="showGotoPos = false"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-sm">
          <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-100">Go to Position</h3>
            <button
              @click="showGotoPos = false"
              class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded transition-colors"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div class="flex gap-2">
              <div class="flex items-center gap-0.5 bg-gray-100 dark:bg-slate-900 rounded p-0.5 flex-1">
                <button
                  @click="gotoCoord = 'work'"
                  :class="gotoCoord === 'work' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-slate-400'"
                  class="flex-1 py-1 rounded text-xs font-medium transition-all"
                >Work</button>
                <button
                  @click="gotoCoord = 'machine'"
                  :class="gotoCoord === 'machine' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-slate-400'"
                  class="flex-1 py-1 rounded text-xs font-medium transition-all"
                >Machine</button>
              </div>
              <div class="flex items-center gap-0.5 bg-gray-100 dark:bg-slate-900 rounded p-0.5 flex-1">
                <button
                  @click="setGotoMode('abs')"
                  :class="gotoMode === 'abs' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-slate-400'"
                  class="flex-1 py-1 rounded text-xs font-medium transition-all"
                >Abs</button>
                <button
                  @click="setGotoMode('rel')"
                  :class="gotoMode === 'rel' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-slate-400'"
                  class="flex-1 py-1 rounded text-xs font-medium transition-all"
                >Rel</button>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div v-for="axis in ['X', 'Y', 'Z']" :key="axis">
                <label class="text-xs text-gray-500 dark:text-slate-400 block mb-1">{{ axis }}</label>
                <input
                  v-model.number="gotoValues[axis]"
                  type="number"
                  step="0.001"
                  class="w-full bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-sm font-mono text-right px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <p class="text-xs text-gray-400 dark:text-slate-500">
              {{ gotoMode === 'abs' ? (gotoCoord === 'work' ? 'Absolute work coordinates (G54)' : 'Absolute machine coordinates') : 'Relative move from current position' }}
            </p>
            <div class="flex gap-2 pt-1">
              <button
                @click="showGotoPos = false"
                class="flex-1 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                @click="executeGoto"
                class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Go
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useSettingsStore } from '~/stores/settings'
import { useSyncStore } from '~/stores/sync'
import { useNav } from '~/composables/useNav'
import { useModals } from '~/composables/useModals'
import { wsSend } from '~/composables/useWsSend'
import { useMovementEnabled } from '~/composables/useMovementEnabled'

const machine = useMachineStore()
const settings = useSettingsStore()
const sync = useSyncStore()
const { navMode } = useNav()
const modals = useModals()
const movementEnabled = useMovementEnabled()

const isJobActive = computed(() => {
  const s = sync.job?.status
  return s === 'running' || s === 'pausing' || s === 'recovering' || s === 'stopping' || s === 'program_pause'
})

// true only on the browser that is actively jogging right now
const isJogging = ref(false)
// block jog when another browser is jogging, on top of the shared movementEnabled gate
const canJog = computed(() => movementEnabled.value && (!sync.jogActive || isJogging.value))

const xyDirs = [
  { label: '↖', dx: -1, dy: 1 },
  { label: '↑', dx: 0, dy: 1 },
  { label: '↗', dx: 1, dy: 1 },
  { label: '←', dx: -1, dy: 0 },
  { label: '○', dx: 0, dy: 0 },
  { label: '→', dx: 1, dy: 0 },
  { label: '↙', dx: -1, dy: -1 },
  { label: '↓', dx: 0, dy: -1 },
  { label: '↘', dx: 1, dy: -1 },
]

const speedPresets = computed(() => [
  { label: 'Slow', feedRate: settings.app.jog.slowSpeed, xyStep: 0.1, zStep: 0.05 },
  { label: 'Med', feedRate: settings.app.jog.mediumSpeed, xyStep: 1.0, zStep: 0.5 },
  { label: 'Fast', feedRate: settings.app.jog.fastSpeed, xyStep: 5.0, zStep: 2.0 },
])
const speeds = speedPresets

const activeSpeedIndex = ref(1)
const jogSpeed = ref(speedPresets.value[1].feedRate)
const xyStepSize = ref(speedPresets.value[1].xyStep)
const zStepSize = ref(speedPresets.value[1].zStep)

function selectSpeed(i: number) {
  activeSpeedIndex.value = i
  const preset = speedPresets.value[i]
  jogSpeed.value = preset.feedRate
  xyStepSize.value = preset.xyStep
  zStepSize.value = preset.zStep
}

const JOG_INTERVAL_MS = 50
// Lookahead factor: segment duration = interval × lookahead, ensuring the next
// command arrives before the current move finishes (seamless chaining).
const JOG_LOOKAHEAD = 1.5

let jogInterval: ReturnType<typeof setInterval> | null = null
let jogTimeout: ReturnType<typeof setTimeout> | null = null

function startJog(dx: number, dy: number, dz: number) {
  if (!canJog.value) return
  isJogging.value = true
  wsSend({ t: 'ui:jog:start' })
  sendTapJog(dx, dy, dz)
  jogTimeout = setTimeout(() => {
    jogInterval = setInterval(() => sendContinuousJog(dx, dy, dz), JOG_INTERVAL_MS)
  }, 400)
}

// Single-tap jog: uses the configured step size so each click is a precise increment.
function sendTapJog(dx: number, dy: number, dz: number) {
  const parts: string[] = []
  if (dx !== 0) parts.push(`X${(dx * xyStepSize.value).toFixed(3)}`)
  if (dy !== 0) parts.push(`Y${(dy * xyStepSize.value).toFixed(3)}`)
  if (dz !== 0) parts.push(`Z${(dz * zStepSize.value).toFixed(3)}`)
  if (parts.length) {
    wsSend({ t: 'machine:jog:move', payload: { cmd: `$J=G91 ${parts.join(' ')} F${jogSpeed.value}` } })
  }
}

// Continuous jog: segment length derived from feed rate so commands chain without
// gaps (no stutter) and the buffer stays shallow (responsive cancel).
function sendContinuousJog(dx: number, dy: number, dz: number) {
  const feed = jogSpeed.value
  const seg = (feed / 60) * (JOG_INTERVAL_MS / 1000) * JOG_LOOKAHEAD
  const parts: string[] = []
  if (dx !== 0) parts.push(`X${(dx * seg).toFixed(3)}`)
  if (dy !== 0) parts.push(`Y${(dy * seg).toFixed(3)}`)
  if (dz !== 0) parts.push(`Z${(dz * seg).toFixed(3)}`)
  if (parts.length) {
    wsSend({ t: 'machine:jog:move', payload: { cmd: `$J=G91 ${parts.join(' ')} F${feed}` } })
  }
}

function stopJog() {
  if (jogTimeout) clearTimeout(jogTimeout)
  const wasRunning = jogInterval !== null
  if (jogInterval) clearInterval(jogInterval)
  jogTimeout = null
  jogInterval = null
  if (isJogging.value) {
    isJogging.value = false
    // Single-tap jog completes its small step naturally; only cancel when
    // continuous mode was active (where the buffer may hold pending segments).
    if (wasRunning) wsSend({ t: 'machine:jog:cancel' })
    wsSend({ t: 'ui:jog:stop' })
  }
}

function onJoystickMove({ x, y, magnitude }: { x: number; y: number; magnitude: number }) {
  if (magnitude < 0.1) {
    if (isJogging.value) {
      isJogging.value = false
      wsSend({ t: 'machine:jog:cancel' })
      wsSend({ t: 'ui:jog:stop' })
    }
    return
  }
  if (!canJog.value) return
  if (!isJogging.value) {
    isJogging.value = true
    wsSend({ t: 'ui:jog:start' })
  }
  const feed = jogSpeed.value
  const effectiveFeed = magnitude * feed
  // Segment length derived from speed so commands chain without gaps.
  // x/y already encode direction × deflection fraction, so magnitude cancels:
  // seg_axis = (x / magnitude) * (effectiveFeed / 60) * intervalSec * lookahead
  //          = x * (feed / 60) * intervalSec * lookahead
  const seg = (feed / 60) * (JOG_INTERVAL_MS / 1000) * JOG_LOOKAHEAD
  wsSend({ t: 'machine:jog:move', payload: { cmd: `$J=G91 X${(x * seg).toFixed(3)} Y${(y * seg).toFixed(3)} F${Math.round(effectiveFeed)}` } })
}

// Open/close synced across browsers via the modal stack; the form values below
// stay local to each browser (open/close + result sync depth).
const gotoModal = modals.active('gotopos')
const showGotoPos = computed<boolean>({
  get: () => !!gotoModal.value,
  set: (open) => {
    if (open) modals.open('gotopos')
    else if (gotoModal.value) modals.resolve(gotoModal.value.id)
  },
})
const gotoCoord = ref<'work' | 'machine'>('work')
const gotoMode = ref<'abs' | 'rel'>('abs')
const gotoValues = reactive({ X: 0, Y: 0, Z: 0 })

watch(showGotoPos, (open) => {
  if (open) {
    const pos = gotoCoord.value === 'work' ? machine.workPos : machine.machinePos
    if (gotoMode.value === 'abs') {
      gotoValues.X = parseFloat((pos.x ?? 0).toFixed(3))
      gotoValues.Y = parseFloat((pos.y ?? 0).toFixed(3))
      gotoValues.Z = parseFloat((pos.z ?? 0).toFixed(3))
    } else {
      gotoValues.X = 0
      gotoValues.Y = 0
      gotoValues.Z = 0
    }
  }
})

watch(gotoCoord, () => {
  if (!showGotoPos.value) return
  const pos = gotoCoord.value === 'work' ? machine.workPos : machine.machinePos
  if (gotoMode.value === 'abs') {
    gotoValues.X = parseFloat((pos.x ?? 0).toFixed(3))
    gotoValues.Y = parseFloat((pos.y ?? 0).toFixed(3))
    gotoValues.Z = parseFloat((pos.z ?? 0).toFixed(3))
  }
})

function setGotoMode(mode: 'abs' | 'rel') {
  gotoMode.value = mode
  if (mode === 'rel') {
    gotoValues.X = 0
    gotoValues.Y = 0
    gotoValues.Z = 0
  } else {
    const pos = gotoCoord.value === 'work' ? machine.workPos : machine.machinePos
    gotoValues.X = parseFloat((pos.x ?? 0).toFixed(3))
    gotoValues.Y = parseFloat((pos.y ?? 0).toFixed(3))
    gotoValues.Z = parseFloat((pos.z ?? 0).toFixed(3))
  }
}

function executeGoto() {
  const x = gotoValues.X
  const y = gotoValues.Y
  const z = gotoValues.Z
  if (gotoMode.value === 'abs') {
    const coordSys = gotoCoord.value === 'work' ? 'G54' : 'G53'
    machine.sendCommand(`G0 ${coordSys} X${x.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)}`)
  } else {
    machine.sendCommand(`G0 G91 X${x.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)} G90`)
  }
  showGotoPos.value = false
}

onUnmounted(() => stopJog())
</script>
