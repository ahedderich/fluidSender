<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Surface Heightmap
      </h2>
      <div v-if="hasResult" class="flex items-center gap-1.5">
        <button
          @click="wsSend({ t: 'probing:abort' })"
          v-if="isRunning"
          class="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 text-red-700 dark:text-red-400 rounded transition-colors"
        >
          Abort
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
      <!-- Config -->
      <div class="grid grid-cols-2 gap-2">
        <UiDimInput label="Edge Offset" v-model="edgeOffset" unit="mm" :min="0" />
        <UiDimInput label="Resolution" v-model="resolution" unit="mm" :min="1" :step="1" />
        <UiDimInput label="Safe Height" v-model="safeHeight" unit="mm" :min="1" />
        <UiDimInput label="Buffer" v-model="probeBuffer" unit="mm" :min="1" />
      </div>

      <p class="text-xs text-gray-400 dark:text-slate-500">
        <template v-if="hasResult && ps.heightmap">
          {{ ps.heightmap.colCount }}×{{ ps.heightmap.rowCount }} grid ·
          {{ ps.heightmap.values.filter(v => v !== null).length }} / {{ ps.heightmap.values.length }} points probed
        </template>
        <template v-else-if="machine.stock">
          ~{{ estimatedCols }}×{{ estimatedRows }} grid · ~{{ estimatedCols * estimatedRows }} points
        </template>
        <template v-else>
          Set stock dimensions to estimate grid size
        </template>
      </p>

      <button
        :disabled="isRunning || !machine.connected"
        @click="startHeightmap"
        class="w-full py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {{ isRunning ? 'Running…' : 'Start Heightmap Probing' }}
      </button>

      <!-- Progress -->
      <UiProbingProgressBar v-if="isRunning" :ps="ps" @abort="wsSend({ t: 'probing:abort' })" />

      <!-- Visualization -->
      <div
        class="rounded-lg border border-gray-200 dark:border-slate-700 flex items-center justify-center bg-gray-50 dark:bg-slate-900"
        style="min-height: 220px"
      >
        <template v-if="ps.heightmap">
          <div class="p-4 w-full h-full">
            <div
              class="grid gap-0.5 w-full"
              :style="`grid-template-columns: repeat(${ps.heightmap.colCount}, 1fr)`"
            >
              <div
                v-for="(val, i) in ps.heightmap.values"
                :key="i"
                class="rounded-sm aspect-square"
                :style="{ backgroundColor: cellColor(val, minMax) }"
              />
            </div>
            <div class="flex justify-between mt-2 text-xs text-gray-400 dark:text-slate-500">
              <span>{{ minMax[0].toFixed(3) }} mm</span>
              <span class="font-medium">Z deviation</span>
              <span>{{ minMax[1].toFixed(3) }} mm</span>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="text-center py-8">
            <svg class="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.5l6.75-6.75L13.5 10.5 19.5 4.5m0 0H15m4.5 0V9" />
            </svg>
            <p class="text-xs text-gray-400 dark:text-slate-600">Run probing to see heightmap</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useSyncStore } from '~/stores/sync'
import { wsSend } from '~/composables/useWsSend'
import { DEFAULT_PROBE_COMPENSATION } from '~~/server/utils/tool/types'

const machine = useMachineStore()
const syncStore = useSyncStore()
const ps = syncStore.probingState

const edgeOffset = ref(5)
const resolution = ref(10)
const safeHeight = ref(20)
const probeBuffer = ref(5)

const isRunning = computed(() => ps.phase === 'running' && ps.wizardKey === 'heightmap')
const hasResult = computed(() => ps.heightmap !== null)

// Estimated grid size based on stock
const estimatedCols = computed(() => {
  const s = machine.stock
  if (!s) return 0
  const w = s.shape === 'round' ? (s.diameter ?? 100) : (s.width ?? 100)
  const effective = Math.max(1, w - 2 * edgeOffset.value)
  return Math.max(2, Math.floor(effective / resolution.value) + 1)
})
const estimatedRows = computed(() => {
  const s = machine.stock
  if (!s) return 0
  const h = s.shape === 'round' ? (s.diameter ?? 100) : (s.height ?? 100)
  const effective = Math.max(1, h - 2 * edgeOffset.value)
  return Math.max(2, Math.floor(effective / resolution.value) + 1)
})

// Probe tool from library
const probeTool = computed(() => {
  const all = [...(machine.toolLibrary?.machine ?? []), ...(machine.toolLibrary?.app ?? [])]
  return all.find(e => e.type === 'probe') ?? null
})
const tipRadius = computed(() => (probeTool.value?.diameter ?? 3) / 2)
const probeConfig = computed(() => probeTool.value?.probeConfig ?? {
  wiggleEnabled: false,
  fastFeedMmPerMin: 200,
  slowFeedMmPerMin: 50,
  cycles: 1,
  averageN: 1,
})
const probeCompensation = computed(() => probeTool.value?.probeCompensation ?? DEFAULT_PROBE_COMPENSATION)

function startHeightmap() {
  wsSend({
    t: 'probing:start',
    payload: {
      wizardKey: 'heightmap',
      config: {
        safeHeightMm: safeHeight.value,
        buffer: probeBuffer.value,
        edgeOffset: edgeOffset.value,
        resolution: resolution.value,
        skipX: false,
        skipY: false,
        skipZ: false,
      },
      tipRadius: tipRadius.value,
      probeConfig: probeConfig.value,
      compensation: probeCompensation.value,
    },
  })
}

// Color mapping
const minMax = computed<[number, number]>(() => {
  const vals = (ps.heightmap?.values ?? []).filter((v): v is number => v !== null)
  if (vals.length === 0) return [0, 0]
  return [Math.min(...vals), Math.max(...vals)]
})

function cellColor(val: number | null, [min, max]: [number, number]): string {
  if (val === null) return '#374151'
  const range = max - min
  const t = range > 0 ? (val - min) / range : 0.5
  const r = Math.round(t * 220 + 30)
  const g = Math.round((1 - Math.abs(t - 0.5) * 2) * 180 + 30)
  const b = Math.round((1 - t) * 220 + 30)
  return `rgb(${r},${g},${b})`
}
</script>
