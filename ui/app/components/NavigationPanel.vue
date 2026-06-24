<template>
  <div
    class="bg-slate-800 dark:bg-slate-800 bg-white rounded-lg border border-slate-700 dark:border-slate-700 border-gray-200 p-3 flex flex-col gap-2.5 min-h-0"
  >
    <!-- Header -->
    <div class="flex items-center justify-between shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-400 text-gray-500">
        Navigation
      </h2>
      <div class="flex items-center gap-0.5 bg-slate-900 dark:bg-slate-900 bg-gray-100 rounded-md p-0.5">
        <button
          @click="ui.navMode = 'buttons'"
          :class="ui.navMode === 'buttons' ? 'bg-slate-700 dark:bg-slate-700 bg-white text-slate-200 dark:text-slate-200 text-gray-800 shadow-sm' : 'text-slate-500 dark:text-slate-500 text-gray-400'"
          class="px-2.5 py-1 rounded text-xs font-medium transition-all"
        >
          Buttons
        </button>
        <button
          @click="ui.navMode = 'joystick'"
          :class="ui.navMode === 'joystick' ? 'bg-slate-700 dark:bg-slate-700 bg-white text-slate-200 dark:text-slate-200 text-gray-800 shadow-sm' : 'text-slate-500 dark:text-slate-500 text-gray-400'"
          class="px-2.5 py-1 rounded text-xs font-medium transition-all"
        >
          Joystick
        </button>
      </div>
    </div>

    <!-- Quick goto buttons -->
    <div class="flex gap-1.5 shrink-0">
      <button
        @click="machine.sendCommand('$H')"
        class="flex-1 py-2 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-300 dark:text-slate-300 text-gray-700 rounded-md text-xs font-medium transition-colors"
      >
        Parking
      </button>
      <button
        @click="machine.sendCommand('G0 G54 X0 Y0')"
        class="flex-1 py-2 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-300 dark:text-slate-300 text-gray-700 rounded-md text-xs font-medium transition-colors"
      >
        XY Zero
      </button>
      <button
        @click="machine.sendCommand('G0 G54 Z0')"
        class="flex-1 py-2 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-300 dark:text-slate-300 text-gray-700 rounded-md text-xs font-medium transition-colors"
      >
        Z Zero
      </button>
    </div>

    <!-- Main jog area -->
    <div class="flex items-center gap-3 flex-1 min-h-0 justify-center">
      <!-- XY: Button mode -->
      <div v-if="ui.navMode === 'buttons'" class="grid grid-cols-3 gap-1.5">
        <button
          v-for="dir in xyDirs"
          :key="dir.label"
          @pointerdown="dir.label !== '○' ? startJog(dir.dx, dir.dy, 0) : null"
          @pointerup="stopJog"
          @pointerleave="stopJog"
          @pointercancel="stopJog"
          :class="dir.label === '○' ? 'bg-slate-900 dark:bg-slate-900 bg-gray-200 cursor-default text-slate-600 dark:text-slate-600 text-gray-400' : 'bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-blue-700 active:bg-blue-600 text-slate-200 dark:text-slate-200 text-gray-800 cursor-pointer'"
          class="w-14 h-14 rounded-lg text-lg font-bold flex items-center justify-center transition-colors select-none touch-none"
        >
          {{ dir.label }}
        </button>
      </div>

      <!-- XY: Joystick mode -->
      <div v-else class="flex items-center justify-center">
        <JoystickControl @move="onJoystickMove" />
      </div>

      <!-- Z axis -->
      <div class="flex flex-col items-center gap-1.5">
        <button
          @pointerdown="startJog(0, 0, 1)"
          @pointerup="stopJog"
          @pointerleave="stopJog"
          @pointercancel="stopJog"
          class="w-12 h-14 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-blue-700 active:bg-blue-600 text-slate-200 dark:text-slate-200 text-gray-800 rounded-lg text-lg font-bold flex items-center justify-center transition-colors select-none touch-none"
        >
          ▲
        </button>
        <span class="text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-400">Z</span>
        <button
          @pointerdown="startJog(0, 0, -1)"
          @pointerup="stopJog"
          @pointerleave="stopJog"
          @pointercancel="stopJog"
          class="w-12 h-14 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-blue-700 active:bg-blue-600 text-slate-200 dark:text-slate-200 text-gray-800 rounded-lg text-lg font-bold flex items-center justify-center transition-colors select-none touch-none"
        >
          ▼
        </button>
      </div>
    </div>

    <!-- Speed + step size -->
    <div class="flex items-center gap-2 shrink-0">
      <span class="text-xs text-slate-500 dark:text-slate-500 text-gray-400 shrink-0">Speed</span>
      <div class="flex gap-1 flex-1">
        <button
          v-for="speed in speeds"
          :key="speed.label"
          @click="activeSpeed = speed"
          :class="activeSpeed.label === speed.label ? 'bg-blue-600 text-white' : 'bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-300 dark:text-slate-300 text-gray-700'"
          class="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors"
        >
          {{ speed.label }}
        </button>
      </div>
      <input
        v-model.number="stepSize"
        type="number"
        min="0.01"
        max="100"
        step="0.1"
        class="w-16 bg-slate-900 dark:bg-slate-900 bg-gray-50 border border-slate-600 dark:border-slate-600 border-gray-300 text-slate-200 dark:text-slate-200 text-gray-900 text-xs font-mono text-right px-2 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <span class="text-xs text-slate-500 dark:text-slate-500 text-gray-400 shrink-0">mm</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useUiStore } from '~/stores/ui'

const machine = useMachineStore()
const ui = useUiStore()

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

const speeds = [
  { label: 'Slow', feedRate: 100 },
  { label: 'Med', feedRate: 500 },
  { label: 'Fast', feedRate: 2000 },
]

const activeSpeed = ref(speeds[1])
const stepSize = ref(1.0)
let jogInterval: ReturnType<typeof setInterval> | null = null
let jogTimeout: ReturnType<typeof setTimeout> | null = null

function startJog(dx: number, dy: number, dz: number) {
  doJog(dx, dy, dz)
  jogTimeout = setTimeout(() => {
    jogInterval = setInterval(() => doJog(dx, dy, dz), 100)
  }, 400)
}

function doJog(dx: number, dy: number, dz: number) {
  const step = stepSize.value
  const feed = activeSpeed.value.feedRate
  const parts: string[] = []
  if (dx !== 0) parts.push(`X${(dx * step).toFixed(3)}`)
  if (dy !== 0) parts.push(`Y${(dy * step).toFixed(3)}`)
  if (dz !== 0) parts.push(`Z${(dz * step).toFixed(3)}`)
  if (parts.length) {
    machine.sendCommand(`$J=G91 ${parts.join(' ')} F${feed}`)
    if (dx !== 0) machine.workPos.x += dx * step
    if (dy !== 0) machine.workPos.y += dy * step
    if (dz !== 0) machine.workPos.z += dz * step
  }
}

function stopJog() {
  if (jogTimeout) clearTimeout(jogTimeout)
  if (jogInterval) {
    clearInterval(jogInterval)
    machine.sendCommand('\x85')
  }
  jogTimeout = null
  jogInterval = null
}

function onJoystickMove({ x, y, magnitude }: { x: number; y: number; magnitude: number }) {
  stopJog()
  if (magnitude < 0.1) return
  const speed = magnitude * activeSpeed.value.feedRate
  machine.sendCommand(`$J=G91 X${(x * stepSize.value).toFixed(3)} Y${(y * stepSize.value).toFixed(3)} F${Math.round(speed)}`)
}

onUnmounted(() => stopJog())
</script>
