<template>
  <div class="grid grid-cols-[55%_1fr] gap-5">
    <div class="flex items-start justify-center">
      <ProbingDiagramRotation :edge="cfg.edge" :highlighted-param="hoveredParam" :stock-shape="stockShape" />
    </div>

    <div class="space-y-3">
      <p class="text-xs text-gray-600 dark:text-slate-300 leading-relaxed px-1">
        Position the probe outside the reference edge at safe height. The wizard probes three points
        along the edge and computes the rotation angle. Apply the result as a G68 rotation offset
        in your CAM post-processor, or re-clamp the stock.
      </p>

      <div class="space-y-1">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Parameters</p>

        <div v-for="row in paramRows" :key="row.param"
          class="flex items-center gap-2 rounded-md px-2 py-1 -mx-2 transition-colors"
          :class="hoveredParam === row.param ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
          @mouseenter="hoveredParam = row.param"
          @mouseleave="hoveredParam = null">
          <UiDimInput :label="row.label" v-model="cfg[row.key]" unit="mm" :min="1" class="flex-1" />
          <div class="relative group/tip shrink-0">
            <button class="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">?</button>
            <div class="absolute right-6 bottom-7 z-10 hidden group-hover/tip:block w-56 bg-gray-900 dark:bg-slate-700 text-white text-xs rounded-lg p-3 shadow-xl leading-relaxed">
              {{ row.tip }}
            </div>
          </div>
        </div>

        <div class="pt-1">
          <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1.5 px-2">Reference Edge</p>
          <div class="grid grid-cols-4 gap-1">
            <button v-for="e in edges" :key="e"
              @click="cfg.edge = e as typeof cfg.edge"
              :class="cfg.edge === e ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
              class="py-1.5 rounded text-xs font-medium capitalize transition-colors">
              {{ e }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  cfg: {
    safeHeightMm: number
    insideOffset: number
    edge: 'top' | 'bottom' | 'left' | 'right'
  }
  stockShape?: 'rect' | 'round'
}>()

const hoveredParam = ref<string | null>(null)

const paramRows = [
  { param: 'safeHeightMm',  key: 'safeHeightMm'  as const, label: 'Safe Height',    tip: 'Z height the probe travels at between the three probe points.' },
  { param: 'insideOffset',  key: 'insideOffset'  as const, label: 'Inside Offset',  tip: 'Distance inward from each corner where the first and third probe points land. Larger values increase accuracy.' },
]

const edges = ['top', 'right', 'bottom', 'left'] as const
</script>
