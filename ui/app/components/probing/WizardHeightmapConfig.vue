<template>
  <div class="grid grid-cols-[55%_1fr] gap-5">
    <div class="flex items-start justify-center">
      <ProbingDiagramHeightmap
        :highlighted-param="hoveredParam"
        :stock-width="stockWidth"
        :stock-height="stockHeight"
        :edge-offset="cfg.edgeOffset"
        :resolution="cfg.resolution"
      />
    </div>

    <div class="space-y-3">
      <p class="text-xs text-gray-600 dark:text-slate-300 leading-relaxed px-1">
        Position the probe above the stock at safe height. Stock dimensions must be set before
        running this wizard. The wizard probes a grid of Z points and stores the result as a
        heightmap for surface-following compensation.
      </p>

      <div class="space-y-1">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Parameters</p>

        <div v-for="row in paramRows" :key="row.param"
          class="flex items-center gap-2 rounded-md px-2 py-1 -mx-2 transition-colors"
          :class="hoveredParam === row.param ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
          @mouseenter="hoveredParam = row.param"
          @mouseleave="hoveredParam = null">
          <DimInput :label="row.label" v-model="cfg[row.key]" unit="mm" :min="row.min" class="flex-1" />
          <div class="relative group/tip shrink-0">
            <button class="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">?</button>
            <div class="absolute right-6 bottom-7 z-10 hidden group-hover/tip:block w-56 bg-gray-900 dark:bg-slate-700 text-white text-xs rounded-lg p-3 shadow-xl leading-relaxed">
              {{ row.tip }}
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between rounded-md px-2 py-1.5 mt-1 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700">
          <span class="text-xs text-gray-500 dark:text-slate-400">Probe points</span>
          <span class="text-xs font-mono font-medium text-gray-800 dark:text-slate-200">
            {{ gridCols }}×{{ gridRows }} = {{ gridCols * gridRows }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'

const props = defineProps<{
  cfg: {
    safeHeightMm: number
    buffer: number
    edgeOffset: number
    resolution: number
  }
}>()

const machine = useMachineStore()
const hoveredParam = ref<string | null>(null)

const stockWidth = computed(() => {
  const s = machine.stock
  if (!s) return 100
  return s.shape === 'round' ? (s.diameter ?? 100) : (s.width ?? 100)
})
const stockHeight = computed(() => {
  const s = machine.stock
  if (!s) return 100
  return s.shape === 'round' ? (s.diameter ?? 100) : (s.height ?? 100)
})

const gridCols = computed(() => {
  const effectiveW = stockWidth.value - 2 * props.cfg.edgeOffset
  return Math.max(2, Math.floor(effectiveW / props.cfg.resolution) + 1)
})
const gridRows = computed(() => {
  const effectiveH = stockHeight.value - 2 * props.cfg.edgeOffset
  return Math.max(2, Math.floor(effectiveH / props.cfg.resolution) + 1)
})

const paramRows = [
  { param: 'safeHeightMm', key: 'safeHeightMm' as const, label: 'Safe Height',  min: 1, tip: 'Z height the probe travels at between grid points.' },
  { param: 'buffer',       key: 'buffer'       as const, label: 'Probe Range',   min: 1, tip: 'Maximum expected surface deviation. The probe starts this distance above the expected surface and travels twice this distance down. Example: 10 mm → probe starts at +10 mm, travels to −10 mm.' },
  { param: 'edgeOffset',   key: 'edgeOffset'   as const, label: 'Edge Offset',   min: 0, tip: 'Distance the grid is inset from each stock edge. Prevents probing off the edge of the material.' },
  { param: 'resolution',   key: 'resolution'   as const, label: 'Resolution',    min: 1, tip: 'Spacing in mm between adjacent probe points. Smaller = denser grid, more accurate, slower.' },
]
</script>
