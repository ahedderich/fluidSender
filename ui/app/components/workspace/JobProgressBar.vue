<template>
  <div
    :class="overlay
      ? 'absolute bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-sm border-t border-slate-700/50 px-4 py-2 z-10'
      : 'bg-slate-900/90 backdrop-blur-sm rounded-lg px-4 py-2'"
  >
    <div class="flex items-center justify-between text-xs text-slate-400 mb-1.5">
      <span>{{ startLabel }}</span>
      <span class="font-medium">
        <span class="text-blue-400">{{ execPct }}%</span>
        <span v-if="showRuntime" class="text-slate-300 ml-2 font-mono">{{ runtimeLabel }}</span>
        <span v-if="job?.filename" class="text-slate-400 ml-1">({{ job!.filename }})</span>
      </span>
      <span>{{ etaLabel }}</span>
    </div>
    <div class="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <!-- Sent: light blue/grey, wider -->
      <div
        class="absolute inset-y-0 left-0 bg-blue-900 transition-all duration-500"
        :style="{ width: sendPct + '%' }"
      />
      <!-- Executed: blue, narrower, on top -->
      <div
        class="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-500"
        :style="{ width: execPct + '%' }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useJobControl } from '~/composables/useJobControl'

// overlay=true (default): layered over the 3D viewport canvas, as on desktop.
// overlay=false: rendered in-flow, for standalone use without a canvas underneath (mobile Monitor tab).
withDefaults(defineProps<{ overlay?: boolean }>(), { overlay: true })

const { job } = useJobControl()

const sendPct = computed(() => job.value?.totalLines ? Math.round((job.value.sendPtr / job.value.totalLines) * 100) : 0)
const execPct = computed(() => job.value?.totalLines ? Math.round((job.value.execPtr / job.value.totalLines) * 100) : 0)

const startLabel = computed(() => {
  if (!job.value?.startWallClock) return 'Start: --:--'
  return `Start: ${new Date(job.value.startWallClock).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
})

const etaLabel = computed(() => {
  if (!job.value?.startWallClock || !job.value.estimatedTotalMs) return 'ETA: --:--'
  const eta = job.value.startWallClock + job.value.estimatedTotalMs
  return `ETA: ${new Date(eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
})

// Live runtime timer — ticks locally off the server-owned accumulatedRunMs/startWallClock
// rather than being pushed every second, so it stays a cheap client-side derivation.
const nowTick = ref(Date.now())
let runtimeTickInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  runtimeTickInterval = setInterval(() => { nowTick.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (runtimeTickInterval) clearInterval(runtimeTickInterval)
})

const runtimeMs = computed(() => {
  const j = job.value
  if (!j) return 0
  const base = j.accumulatedRunMs ?? 0
  return j.status === 'running' && j.startWallClock
    ? base + Math.max(0, nowTick.value - j.startWallClock)
    : base
})

const showRuntime = computed(() => runtimeMs.value > 0 || job.value?.status === 'running')

const runtimeLabel = computed(() => {
  const totalSec = Math.floor(runtimeMs.value / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
})
</script>
