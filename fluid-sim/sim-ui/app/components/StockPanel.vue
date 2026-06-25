<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2.5">
      Stock
    </h2>

    <!-- Shape selector -->
    <div class="flex items-center gap-0.5 bg-gray-100 dark:bg-slate-900 rounded-md p-0.5 mb-3">
      <button
        @click="s.stock.shape = 'rect'"
        :class="s.stock.shape === 'rect'
          ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 shadow-sm'
          : 'text-gray-400 dark:text-slate-500'"
        class="flex-1 py-1 rounded text-xs font-medium transition-all"
      >
        Rectangular
      </button>
      <button
        @click="s.stock.shape = 'round'"
        :class="s.stock.shape === 'round'
          ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 shadow-sm'
          : 'text-gray-400 dark:text-slate-500'"
        class="flex-1 py-1 rounded text-xs font-medium transition-all"
      >
        Round
      </button>
    </div>

    <div class="grid grid-cols-2 gap-x-3 gap-y-2">
      <template v-if="s.stock.shape === 'rect'">
        <DimInput label="Width (X)" v-model="s.stock.width" unit="mm" :step="1" :min="1" />
        <DimInput label="Height (Y)" v-model="s.stock.height" unit="mm" :step="1" :min="1" />
        <DimInput label="Rotation" v-model="s.stock.rotation" unit="°" :step="1" />
        <DimInput label="Depth (Z)" v-model="s.stock.depth" unit="mm" :step="1" :min="1" />
      </template>
      <template v-else>
        <DimInput label="Diameter" v-model="s.stock.diameter" unit="mm" :step="1" :min="1" class="col-span-2" />
        <DimInput label="Depth (Z)" v-model="s.stock.depth" unit="mm" :step="1" :min="1" class="col-span-2" />
      </template>
      <DimInput label="Origin X" v-model="s.stock.ox" unit="mm" :step="1" />
      <DimInput label="Origin Y" v-model="s.stock.oy" unit="mm" :step="1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'

const s = useSimStore()
</script>
