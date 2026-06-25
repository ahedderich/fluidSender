<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-3"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
      Stock
    </h2>

    <!-- Shape selector -->
    <div class="flex items-center gap-0.5 bg-gray-100 dark:bg-slate-900 rounded-md p-0.5">
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

    <!-- Main dimensions — 4-column grid -->
    <div class="grid grid-cols-4 gap-x-3 gap-y-2">
      <template v-if="s.stock.shape === 'rect'">
        <DimInput label="Width (X)" v-model="s.stock.width" unit="mm" :step="1" :min="1" />
        <DimInput label="Height (Y)" v-model="s.stock.height" unit="mm" :step="1" :min="1" />
        <DimInput label="Depth (Z)" v-model="s.stock.depth" unit="mm" :step="1" :min="1" />
        <DimInput label="Rotation" v-model="s.stock.rotation" unit="°" :step="1" />
        <DimInput label="Origin X" v-model="s.stock.ox" unit="mm" :step="1" />
        <DimInput label="Origin Y" v-model="s.stock.oy" unit="mm" :step="1" />
        <DimInput label="Origin Z" v-model="s.stock.oz" unit="mm" :step="1" :min="0" />
      </template>
      <template v-else>
        <DimInput label="Diameter" v-model="s.stock.diameter" unit="mm" :step="1" :min="1" class="col-span-2" />
        <DimInput label="Depth (Z)" v-model="s.stock.depth" unit="mm" :step="1" :min="1" />
        <div />
        <DimInput label="Origin X" v-model="s.stock.ox" unit="mm" :step="1" />
        <DimInput label="Origin Y" v-model="s.stock.oy" unit="mm" :step="1" />
        <DimInput label="Origin Z" v-model="s.stock.oz" unit="mm" :step="1" :min="0" />
      </template>
    </div>

    <!-- Hole section -->
    <div class="border-t border-gray-100 dark:border-slate-700 pt-2.5">
      <button
        @click="s.stock.hole.enabled = !s.stock.hole.enabled"
        class="flex items-center gap-2 w-full group mb-2"
      >
        <span
          :class="s.stock.hole.enabled
            ? 'bg-blue-600 border-blue-600'
            : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-500'"
          class="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
        >
          <svg v-if="s.stock.hole.enabled" class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">Hole</span>
      </button>
      <div v-if="s.stock.hole.enabled" class="grid grid-cols-2 gap-x-3 gap-y-2 pl-1">
        <DimInput label="Center X" v-model="s.stock.hole.x" unit="mm" :step="1" />
        <DimInput label="Center Y" v-model="s.stock.hole.y" unit="mm" :step="1" />
        <DimInput label="Diameter" v-model="s.stock.hole.diameter" unit="mm" :step="1" :min="1" />
        <DimInput label="Depth" v-model="s.stock.hole.depth" unit="mm" :step="1" :min="1" />
      </div>
    </div>

    <!-- Reference point section -->
    <div class="border-t border-gray-100 dark:border-slate-700 pt-2.5">
      <button
        @click="s.stock.point.enabled = !s.stock.point.enabled"
        class="flex items-center gap-2 w-full group mb-2"
      >
        <span
          :class="s.stock.point.enabled
            ? 'bg-amber-500 border-amber-500'
            : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-500'"
          class="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
        >
          <svg v-if="s.stock.point.enabled" class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">Reference Point</span>
      </button>
      <div v-if="s.stock.point.enabled" class="grid grid-cols-2 gap-x-3 gap-y-2 pl-1">
        <DimInput label="X" v-model="s.stock.point.x" unit="mm" :step="1" />
        <DimInput label="Y" v-model="s.stock.point.y" unit="mm" :step="1" />
        <label class="col-span-2 flex flex-col gap-1">
          <span class="text-xs text-gray-400 dark:text-slate-500">Label</span>
          <input
            v-model="s.stock.point.label"
            type="text"
            class="bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-100 text-sm px-2 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'

const s = useSimStore()
</script>
