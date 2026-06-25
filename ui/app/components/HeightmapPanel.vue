<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Surface Heightmap
      </h2>
      <div v-if="hasHeightmap" class="flex items-center gap-1.5">
        <button
          class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors"
        >
          Export
        </button>
        <button
          @click="hasHeightmap = false"
          class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-red-600 hover:text-white text-gray-500 dark:text-slate-400 rounded transition-colors"
        >
          Clear
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
      <!-- Config -->
      <div class="grid grid-cols-2 gap-2">
        <DimInput label="Grid X" v-model="heightmap.gridX" unit="pts" :step="1" :min="2" :max="20" />
        <DimInput label="Grid Y" v-model="heightmap.gridY" unit="pts" :step="1" :min="2" :max="20" />
        <DimInput label="Probe Depth" v-model="heightmap.depth" unit="mm" />
        <DimInput label="Probe Feed" v-model="heightmap.feed" unit="mm/m" :step="10" />
      </div>
      <p class="text-xs text-gray-400 dark:text-slate-500">
        {{ heightmap.gridX * heightmap.gridY }} probe points · {{ heightmap.gridX }}×{{ heightmap.gridY }} grid
      </p>
      <button
        @click="hasHeightmap = true"
        class="w-full py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
      >
        Start Heightmap Probing
      </button>

      <!-- Visualization -->
      <div
        class="rounded-lg border border-gray-200 dark:border-slate-700 flex items-center justify-center bg-gray-50 dark:bg-slate-900"
        style="min-height: 220px"
      >
        <template v-if="hasHeightmap">
          <!-- Mock heightmap grid visualization -->
          <div class="p-4 w-full h-full">
            <div
              class="grid gap-0.5 w-full"
              :style="`grid-template-columns: repeat(${heightmap.gridX}, 1fr)`"
            >
              <div
                v-for="i in heightmap.gridX * heightmap.gridY"
                :key="i"
                class="rounded-sm aspect-square"
                :style="{ backgroundColor: cellColor(i) }"
              />
            </div>
            <div class="flex justify-between mt-2 text-xs text-gray-400 dark:text-slate-500">
              <span>-0.35 mm</span>
              <span class="font-medium">Z deviation</span>
              <span>+0.35 mm</span>
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
const hasHeightmap = ref(false)

const heightmap = reactive({
  gridX: 5,
  gridY: 5,
  depth: 2,
  feed: 100,
})

function cellColor(i: number): string {
  const total = heightmap.gridX * heightmap.gridY
  const t = (i - 1) / (total - 1)
  const v = Math.sin(t * Math.PI * 2.3 + 0.5) * 0.5 + 0.5
  const r = Math.round(v * 59 + 30)
  const g = Math.round((1 - Math.abs(v - 0.5) * 2) * 180 + 30)
  const b = Math.round((1 - v) * 200 + 30)
  return `rgb(${r},${g},${b})`
}
</script>
