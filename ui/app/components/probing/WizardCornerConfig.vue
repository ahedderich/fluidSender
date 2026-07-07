<template>
  <div class="grid grid-cols-[55%_1fr] gap-5">
    <!-- Left: diagram -->
    <div class="flex items-start justify-center">
      <ProbingDiagramCorner :corner="cfg.corner" :highlighted-param="hoveredParam" :stock-shape="stockShape" />
    </div>

    <!-- Right: instructions + parameters -->
    <div class="space-y-3">
      <p class="text-xs text-gray-600 dark:text-slate-300 leading-relaxed px-1">
        Position the probe <strong>outside</strong> and <strong>above</strong> the selected corner,
        at or above safe height. The wizard probes the X edge, then the Y edge, then plunges to
        probe the Z surface. WCS origin is set at the corner.
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

        <div class="pt-1">
          <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1.5 px-2">Select Corner</p>
          <div class="grid grid-cols-2 gap-1.5">
            <button v-for="c in corners" :key="c.key"
              @click="cfg.corner = c.key as typeof cfg.corner"
              :class="cfg.corner === c.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
              class="py-2 rounded-lg text-xs font-medium capitalize transition-colors">
              {{ c.label }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  cfg: {
    safeHeightMm: number
    buffer: number
    skipX: boolean
    skipY: boolean
    skipZ: boolean
    corner: 'front-left' | 'front-right' | 'back-left' | 'back-right'
  }
  stockShape?: 'rect' | 'round'
}>()

const hoveredParam = ref<string | null>(null)

const paramRows = [
  { param: 'safeHeightMm', key: 'safeHeightMm' as const, label: 'Safe Height',    tip: 'Z height the probe travels at between moves. Must clear all clamps and fixtures above the stock.' },
  { param: 'buffer',       key: 'buffer'       as const, label: 'Approach Buffer', tip: 'Horizontal distance outside the stock edge where the probe descends before each probing move.' },
]

const corners = [
  { key: 'front-left',  label: 'Front Left'  },
  { key: 'front-right', label: 'Front Right' },
  { key: 'back-left',   label: 'Back Left'   },
  { key: 'back-right',  label: 'Back Right'  },
]
</script>
