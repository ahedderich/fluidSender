<template>
  <div class="grid grid-cols-[55%_1fr] gap-5">
    <div class="flex items-start justify-center">
      <ProbingDiagramCenterIn :highlighted-param="hoveredParam" :stock-shape="stockShape" />
    </div>

    <div class="space-y-3">
      <p class="text-xs text-gray-600 dark:text-slate-300 leading-relaxed px-1">
        <strong>This wizard has two phases.</strong> Jog the probe manually inside the pocket or bore,
        roughly centered, before clicking Start. After clicking Start, the wizard will pause immediately
        — confirm your position and click <strong>Continue</strong> to begin probing outward.
      </p>

      <div class="space-y-1">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Parameters</p>

        <div v-for="row in paramRows" :key="row.param"
          class="flex items-center gap-2 rounded-md px-2 py-1 -mx-2 transition-colors"
          :class="hoveredParam === row.param ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
          @mouseenter="hoveredParam = row.param"
          @mouseleave="hoveredParam = null">
          <DimInput :label="row.label" v-model="cfg[row.key]" unit="mm" :min="1" class="flex-1" />
          <div class="relative group/tip shrink-0">
            <button class="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">?</button>
            <div class="absolute right-6 bottom-7 z-10 hidden group-hover/tip:block w-56 bg-gray-900 dark:bg-slate-700 text-white text-xs rounded-lg p-3 shadow-xl leading-relaxed">
              {{ row.tip }}
            </div>
          </div>
        </div>

        <p class="text-xs text-amber-600 dark:text-amber-400 px-1 pt-1">
          Z position is assumed from your manual placement inside the pocket. Use Edge Probing (Z) to set Z zero before running this wizard.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  cfg: {
    buffer: number
  }
  stockShape?: 'rect' | 'round'
}>()

const hoveredParam = ref<string | null>(null)

const paramRows = [
  { param: 'buffer', key: 'buffer' as const, label: 'Approach Buffer', tip: 'Distance inward from each bore wall where each outward probe move begins.' },
]
</script>
