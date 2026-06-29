<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <svg class="w-3.5 h-3.5 text-gray-400 dark:text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span class="text-xs font-medium text-gray-700 dark:text-slate-300 truncate">
          {{ job?.filename ?? 'No file loaded' }}
        </span>
      </div>
      <button
        v-if="job && job.status !== 'idle'"
        class="text-xs px-2 py-0.5 text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors shrink-0"
        title="Clear loaded file"
        @click="clearJob"
      >
        Clear
      </button>
    </div>

    <!-- Crash / checkpoint recovery banner -->
    <div
      v-if="job?.recovery?.available"
      class="px-3 py-2.5 border-b border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 shrink-0"
    >
      <div class="flex items-start gap-2 mb-2.5">
        <svg class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <div class="min-w-0">
          <p class="text-xs font-semibold text-amber-800 dark:text-amber-300">Crash detected</p>
          <p class="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
            Interrupted at line {{ job!.recovery!.checkpointPtr.toLocaleString() }}.
            Home and position the machine before resuming.
          </p>
        </div>
      </div>
      <div class="space-y-1.5">
        <button
          :disabled="!machine.connected"
          :title="!machine.connected ? 'Connect to machine before resuming' : undefined"
          class="w-full py-1.5 rounded-md text-xs font-semibold transition-colors"
          :class="machine.connected
            ? 'bg-amber-600 hover:bg-amber-500 text-white'
            : 'bg-amber-200/60 dark:bg-amber-900/40 text-amber-400 dark:text-amber-700 cursor-not-allowed'"
          @click="doRecover()"
        >
          Resume from line {{ job!.recovery!.resumePtr.toLocaleString() }}
        </button>
        <div class="flex gap-1.5">
          <button
            class="flex-1 py-1.5 bg-white dark:bg-slate-700 border border-amber-200 dark:border-slate-600 hover:bg-amber-50 dark:hover:bg-slate-600 text-amber-900 dark:text-slate-200 rounded-md text-xs font-medium transition-colors"
            @click="doLoadFresh()"
          >
            Restart from beginning
          </button>
          <button
            class="flex-1 py-1.5 bg-white dark:bg-slate-700 border border-red-200 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-xs font-medium transition-colors"
            @click="clearJob()"
          >
            Clear job
          </button>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div v-if="job" class="px-3 py-2 border-b border-gray-100 dark:border-slate-700 shrink-0 flex gap-4">
      <!-- XYZ range -->
      <table class="text-xs flex-1 min-w-0">
        <tbody>
          <tr v-for="axis in axisRanges" :key="axis.label">
            <td class="text-gray-400 dark:text-slate-500 py-0.5 pr-2 whitespace-nowrap">{{ axis.label }} Range</td>
            <td class="font-mono text-gray-800 dark:text-slate-200 text-right pr-2">{{ axis.from }}</td>
            <td class="font-mono text-gray-800 dark:text-slate-200 text-right">{{ axis.to }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Scalar stats -->
      <table class="text-xs shrink-0">
        <tbody>
          <tr>
            <td class="text-gray-400 dark:text-slate-500 py-0.5 pr-2 whitespace-nowrap">Lines</td>
            <td class="font-mono text-gray-800 dark:text-slate-200 text-right">{{ job!.totalLines.toLocaleString() }}</td>
          </tr>
          <tr>
            <td class="text-gray-400 dark:text-slate-500 py-0.5 pr-2 whitespace-nowrap">Sent / Exec</td>
            <td class="font-mono text-gray-800 dark:text-slate-200 text-right">{{ job!.sendPtr.toLocaleString() }} / {{ job!.execPtr.toLocaleString() }}</td>
          </tr>
          <tr>
            <td class="text-gray-400 dark:text-slate-500 py-0.5 pr-2 whitespace-nowrap">Est. Time</td>
            <td class="font-mono text-gray-800 dark:text-slate-200 text-right">{{ formatRuntime(job!.estimatedTotalMs) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Tool list -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <template v-if="job">
        <div class="px-3 pt-2 pb-1 shrink-0">
          <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Tools ({{ machine.tools.length }})</p>
        </div>
        <div class="px-3 pb-3 space-y-1.5">
          <div
            v-for="tool in machine.tools"
            :key="tool.number"
            :class="tool.number === currentTool?.number
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700/60'
              : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700'"
            class="flex items-center gap-2.5 border rounded-lg px-2.5 py-2"
          >
            <div
              :class="tool.number === currentTool?.number ? 'bg-amber-500' : 'bg-blue-700'"
              class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            >
              {{ tool.number }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-medium text-gray-800 dark:text-slate-200 truncate">{{ tool.description }}</p>
              <p class="text-xs text-gray-400 dark:text-slate-500">{{ (tool.lineEnd - tool.lineStart + 1).toLocaleString() }} lines</p>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="flex flex-col items-center justify-center h-full py-8 text-center px-4">
          <svg class="w-8 h-8 text-gray-300 dark:text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="text-gray-400 dark:text-slate-500 text-sm mb-3">No file loaded</p>
          <button class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors font-medium">
            Upload GCode File
          </button>
        </div>
      </template>
    </div>

    <!-- Speed overrides -->
    <div class="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-slate-700 shrink-0 space-y-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Overrides</h3>

      <!-- Feed override -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-600 dark:text-slate-300 font-medium w-14 shrink-0">Feed</span>
        <input
          v-model.number="localFeed"
          type="range"
          min="10"
          max="200"
          step="1"
          :style="{ '--val': localFeed }"
          :disabled="!machine.connected"
          class="override-slider flex-1 disabled:opacity-40"
          @mousedown="isDraggingFeed = true"
          @touchstart="isDraggingFeed = true"
          @change="applyFeed"
        />
        <div
          v-if="!editingFeed"
          class="w-11 text-right text-xs font-mono cursor-pointer text-gray-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 select-none shrink-0"
          :class="{ 'opacity-40 pointer-events-none': !machine.connected }"
          @click="startEditFeed"
        >
          {{ localFeed }}%
        </div>
        <input
          v-else
          ref="feedInput"
          v-model.number="feedEditValue"
          type="number"
          min="10"
          max="200"
          class="w-16 bg-gray-50 dark:bg-slate-900 border border-blue-500 text-gray-900 dark:text-slate-100 text-xs font-mono text-right px-1 py-0.5 rounded focus:outline-none shrink-0"
          @blur="commitFeedEdit"
          @keydown.enter="commitFeedEdit"
          @keydown.escape="cancelFeedEdit"
        />
        <button
          :disabled="!machine.connected"
          class="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-sm leading-none shrink-0 transition-colors disabled:opacity-40"
          title="Reset to 100%"
          @click="resetFeed"
        >↺</button>
      </div>

      <!-- Spindle override -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-600 dark:text-slate-300 font-medium w-14 shrink-0">Spindle</span>
        <input
          v-model.number="localSpindle"
          type="range"
          min="10"
          max="200"
          step="1"
          :style="{ '--val': localSpindle }"
          :disabled="!machine.connected"
          class="override-slider flex-1 disabled:opacity-40"
          @mousedown="isDraggingSpindle = true"
          @touchstart="isDraggingSpindle = true"
          @change="applySpindle"
        />
        <div
          v-if="!editingSpindle"
          class="w-11 text-right text-xs font-mono cursor-pointer text-gray-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 select-none shrink-0"
          :class="{ 'opacity-40 pointer-events-none': !machine.connected }"
          @click="startEditSpindle"
        >
          {{ localSpindle }}%
        </div>
        <input
          v-else
          ref="spindleInput"
          v-model.number="spindleEditValue"
          type="number"
          min="10"
          max="200"
          class="w-16 bg-gray-50 dark:bg-slate-900 border border-blue-500 text-gray-900 dark:text-slate-100 text-xs font-mono text-right px-1 py-0.5 rounded focus:outline-none shrink-0"
          @blur="commitSpindleEdit"
          @keydown.enter="commitSpindleEdit"
          @keydown.escape="cancelSpindleEdit"
        />
        <button
          :disabled="!machine.connected"
          class="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-sm leading-none shrink-0 transition-colors disabled:opacity-40"
          title="Reset to 100%"
          @click="resetSpindle"
        >↺</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useJobControl } from '~/composables/useJobControl'
import { wsSend } from '~/composables/useWsSend'

const machine = useMachineStore()
const { job, clearJob, confirmRecovery } = useJobControl()

function doRecover() {
  const resumePtr = job.value?.recovery?.resumePtr
  if (resumePtr != null) confirmRecovery(resumePtr)
}

function doLoadFresh() {
  wsSend({ t: 'job:recover:fresh' })
}

// FluidNC real-time override bytes
const FEED_RESET = 0x90
const FEED_UP10 = 0x91
const FEED_DOWN10 = 0x92
const FEED_UP1 = 0x93
const FEED_DOWN1 = 0x94

const SPINDLE_RESET = 0x99
const SPINDLE_UP10 = 0x9a
const SPINDLE_DOWN10 = 0x9b
const SPINDLE_UP1 = 0x9c
const SPINDLE_DOWN1 = 0x9d

const editingFeed = ref(false)
const editingSpindle = ref(false)

const localFeed = ref(machine.feedOverride)
const localSpindle = ref(machine.spindleOverride)

const isDraggingFeed = ref(false)
const isDraggingSpindle = ref(false)

let lastSentFeed = machine.feedOverride
let lastSentSpindle = machine.spindleOverride

let pendingFeed: number | null = null
let pendingFeedTimer: ReturnType<typeof setTimeout> | null = null
let pendingSpindle: number | null = null
let pendingSpindleTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => machine.feedOverride,
  (v) => {
    if (isDraggingFeed.value || editingFeed.value) return
    if (pendingFeed !== null) {
      if (Math.abs(v - pendingFeed) <= 1) {
        if (pendingFeedTimer) { clearTimeout(pendingFeedTimer); pendingFeedTimer = null }
        pendingFeed = null
        localFeed.value = v
        lastSentFeed = v
      }
      return
    }
    localFeed.value = v
    lastSentFeed = v
  },
  { immediate: true },
)

watch(
  () => machine.spindleOverride,
  (v) => {
    if (isDraggingSpindle.value || editingSpindle.value) return
    if (pendingSpindle !== null) {
      if (Math.abs(v - pendingSpindle) <= 1) {
        if (pendingSpindleTimer) { clearTimeout(pendingSpindleTimer); pendingSpindleTimer = null }
        pendingSpindle = null
        localSpindle.value = v
        lastSentSpindle = v
      }
      return
    }
    localSpindle.value = v
    lastSentSpindle = v
  },
  { immediate: true },
)

function deltaBytes(delta: number, up10: number, down10: number, up1: number, down1: number) {
  const bytes: number[] = []
  const sign = Math.sign(delta)
  let rem = Math.abs(Math.round(delta))
  while (rem >= 10) { bytes.push(sign > 0 ? up10 : down10); rem -= 10 }
  while (rem >= 1) { bytes.push(sign > 0 ? up1 : down1); rem -= 1 }
  return bytes
}

function clamp(v: number) { return Math.max(10, Math.min(200, Math.round(v))) }

// Feed handlers
const feedInput = ref<HTMLInputElement>()
const feedEditValue = ref(100)

function applyFeed() {
  isDraggingFeed.value = false
  const target = clamp(localFeed.value)
  localFeed.value = target
  const bytes = deltaBytes(target - lastSentFeed, FEED_UP10, FEED_DOWN10, FEED_UP1, FEED_DOWN1)
  if (bytes.length) {
    machine.sendOverride(bytes)
    lastSentFeed = target
    pendingFeed = target
    if (pendingFeedTimer) clearTimeout(pendingFeedTimer)
    pendingFeedTimer = setTimeout(() => { pendingFeed = null }, 2000)
  }
}

function resetFeed() {
  machine.sendOverride([FEED_RESET])
  localFeed.value = 100
  lastSentFeed = 100
  pendingFeed = 100
  if (pendingFeedTimer) clearTimeout(pendingFeedTimer)
  pendingFeedTimer = setTimeout(() => { pendingFeed = null }, 2000)
}

function startEditFeed() {
  feedEditValue.value = localFeed.value
  editingFeed.value = true
  nextTick(() => feedInput.value?.select())
}

function commitFeedEdit() {
  const target = clamp(feedEditValue.value || lastSentFeed)
  localFeed.value = target
  editingFeed.value = false
  const bytes = deltaBytes(target - lastSentFeed, FEED_UP10, FEED_DOWN10, FEED_UP1, FEED_DOWN1)
  if (bytes.length) {
    machine.sendOverride(bytes)
    lastSentFeed = target
    pendingFeed = target
    if (pendingFeedTimer) clearTimeout(pendingFeedTimer)
    pendingFeedTimer = setTimeout(() => { pendingFeed = null }, 2000)
  }
}

function cancelFeedEdit() {
  editingFeed.value = false
  localFeed.value = lastSentFeed
}

// Spindle handlers
const spindleInput = ref<HTMLInputElement>()
const spindleEditValue = ref(100)

function applySpindle() {
  isDraggingSpindle.value = false
  const target = clamp(localSpindle.value)
  localSpindle.value = target
  const bytes = deltaBytes(target - lastSentSpindle, SPINDLE_UP10, SPINDLE_DOWN10, SPINDLE_UP1, SPINDLE_DOWN1)
  if (bytes.length) {
    machine.sendOverride(bytes)
    lastSentSpindle = target
    pendingSpindle = target
    if (pendingSpindleTimer) clearTimeout(pendingSpindleTimer)
    pendingSpindleTimer = setTimeout(() => { pendingSpindle = null }, 2000)
  }
}

function resetSpindle() {
  machine.sendOverride([SPINDLE_RESET])
  localSpindle.value = 100
  lastSentSpindle = 100
  pendingSpindle = 100
  if (pendingSpindleTimer) clearTimeout(pendingSpindleTimer)
  pendingSpindleTimer = setTimeout(() => { pendingSpindle = null }, 2000)
}

function startEditSpindle() {
  spindleEditValue.value = localSpindle.value
  editingSpindle.value = true
  nextTick(() => spindleInput.value?.select())
}

function commitSpindleEdit() {
  const target = clamp(spindleEditValue.value || lastSentSpindle)
  localSpindle.value = target
  editingSpindle.value = false
  const bytes = deltaBytes(target - lastSentSpindle, SPINDLE_UP10, SPINDLE_DOWN10, SPINDLE_UP1, SPINDLE_DOWN1)
  if (bytes.length) {
    machine.sendOverride(bytes)
    lastSentSpindle = target
    pendingSpindle = target
    if (pendingSpindleTimer) clearTimeout(pendingSpindleTimer)
    pendingSpindleTimer = setTimeout(() => { pendingSpindle = null }, 2000)
  }
}

function cancelSpindleEdit() {
  editingSpindle.value = false
  localSpindle.value = lastSentSpindle
}

const currentTool = computed(() => {
  if (!machine.tools.length) return null
  const line = job.value?.sendPtr ?? 0
  return (
    machine.tools.find((t) => line >= t.lineStart && line <= t.lineEnd) ??
    machine.tools[0]
  )
})

const axisRanges = computed(() => {
  const r = job.value?.axisRanges
  const fmt = (v: number) => v.toFixed(1)
  return [
    { label: 'X', from: r ? fmt(r.x.min) : '—', to: r ? fmt(r.x.max) : '—' },
    { label: 'Y', from: r ? fmt(r.y.min) : '—', to: r ? fmt(r.y.max) : '—' },
    { label: 'Z', from: r ? fmt(r.z.min) : '—', to: r ? fmt(r.z.max) : '—' },
  ]
})

function formatRuntime(ms: number) {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}
</script>
