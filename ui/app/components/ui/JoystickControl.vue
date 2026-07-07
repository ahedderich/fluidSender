<template>
  <div
    ref="joystickEl"
    class="relative w-36 h-36 rounded-full bg-gray-100 dark:bg-slate-900 border-2 border-gray-300 dark:border-slate-600 select-none touch-none"
    :class="disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-crosshair'"
    @pointerdown="!disabled && onStart($event)"
    @pointermove="!disabled && onMove($event)"
    @pointerup="onEnd"
    @pointercancel="onEnd"
    @pointerleave="onEnd"
  >
    <!-- Cross lines -->
    <div class="absolute inset-0 flex items-center">
      <div class="w-full h-px bg-slate-700 dark:bg-slate-700 bg-gray-300" />
    </div>
    <div class="absolute inset-0 flex justify-center">
      <div class="h-full w-px bg-slate-700 dark:bg-slate-700 bg-gray-300" />
    </div>

    <!-- Range ring -->
    <div class="absolute rounded-full border border-slate-700 dark:border-slate-700 border-gray-300 inset-3" />

    <!-- Direction hints -->
    <span class="absolute top-1.5 left-1/2 -translate-x-1/2 text-xs text-gray-400 dark:text-slate-600 select-none pointer-events-none">Y+</span>
    <span class="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-xs text-gray-400 dark:text-slate-600 select-none pointer-events-none">Y-</span>
    <span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-slate-600 select-none pointer-events-none">X+</span>
    <span class="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-slate-600 select-none pointer-events-none">X-</span>

    <!-- Draggable dot -->
    <div
      class="absolute w-8 h-8 rounded-full shadow-lg transition-transform duration-75 pointer-events-none"
      :class="isDown ? 'bg-blue-500 scale-110' : 'bg-blue-600'"
      :style="{
        left: `calc(50% + ${dx}px - 1rem)`,
        top: `calc(50% + ${dy}px - 1rem)`,
      }"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ disabled?: boolean }>()

const emit = defineEmits<{
  move: [{ x: number; y: number; magnitude: number }]
}>()

const joystickEl = ref<HTMLDivElement>()
const dx = ref(0)
const dy = ref(0)
const isDown = ref(false)
const MAX_R = 52

let tickInterval: ReturnType<typeof setInterval> | null = null

function emitCurrent() {
  const magnitude = Math.sqrt(dx.value * dx.value + dy.value * dy.value) / MAX_R
  emit('move', { x: dx.value / MAX_R, y: -dy.value / MAX_R, magnitude })
}

function startTick() {
  if (tickInterval !== null) return
  // Emit at 20 Hz while held so jogging persists without pointer movement
  tickInterval = setInterval(emitCurrent, 50)
}

function stopTick() {
  if (tickInterval !== null) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

function onStart(e: PointerEvent) {
  isDown.value = true
  joystickEl.value?.setPointerCapture(e.pointerId)
  update(e)
  startTick()
}

function onMove(e: PointerEvent) {
  if (!isDown.value) return
  update(e)
}

function update(e: PointerEvent) {
  if (!joystickEl.value) return
  const rect = joystickEl.value.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  let x = e.clientX - cx
  let y = e.clientY - cy
  const dist = Math.sqrt(x * x + y * y)
  if (dist > MAX_R) {
    x = (x / dist) * MAX_R
    y = (y / dist) * MAX_R
  }
  dx.value = x
  dy.value = y
  emitCurrent()
}

function onEnd() {
  stopTick()
  isDown.value = false
  dx.value = 0
  dy.value = 0
  emit('move', { x: 0, y: 0, magnitude: 0 })
}

onUnmounted(stopTick)
</script>
