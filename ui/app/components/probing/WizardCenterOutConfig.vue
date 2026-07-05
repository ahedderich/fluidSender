<template>
  <div class="grid grid-cols-[55%_1fr] gap-5">
    <div class="flex items-start justify-center">
      <ProbingDiagramCenterOut :skip-x="cfg.skipX" :skip-y="cfg.skipY" :highlighted-param="hoveredParam" :stock-shape="stockShape" />
    </div>

    <div class="space-y-3">
      <p class="text-xs text-gray-600 dark:text-slate-300 leading-relaxed px-1">
        Position the probe anywhere above the stock at safe height — exact XY position does not matter.
        The wizard probes both X edges and both Y edges, calculates the center, then optionally probes Z.
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

        <div class="flex gap-4 text-xs text-gray-600 dark:text-slate-300 px-2 pt-1">
          <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" v-model="cfg.skipX" class="rounded" /> Skip X</label>
          <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" v-model="cfg.skipY" class="rounded" /> Skip Y</label>
          <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" v-model="cfg.skipZ" class="rounded" /> Skip Z</label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  cfg: {
    safeHeightMm: number
    buffer: number
    skipX: boolean
    skipY: boolean
    skipZ: boolean
  }
  stockShape?: 'rect' | 'round'
}>()

const hoveredParam = ref<string | null>(null)

const paramRows = [
  { param: 'safeHeightMm', key: 'safeHeightMm' as const, label: 'Safe Height',    tip: 'Z height the probe travels at between moves. Must clear the stock and all fixtures.' },
  { param: 'buffer',       key: 'buffer'       as const, label: 'Approach Buffer', tip: 'Distance outside each stock edge from which the probe begins its horizontal probing move.' },
]
</script>
