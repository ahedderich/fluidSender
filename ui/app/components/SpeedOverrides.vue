<template>
  <div
    class="bg-slate-800 dark:bg-slate-800 bg-white rounded-lg border border-slate-700 dark:border-slate-700 border-gray-200 p-3 shrink-0"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-400 text-gray-500 mb-3">
      Overrides
    </h2>

    <div class="space-y-3">
      <!-- Feed override -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-sm text-slate-300 dark:text-slate-300 text-gray-700 font-medium">Feed Rate</span>
          <div class="flex items-center gap-1.5">
            <input
              v-model.number="machine.feedOverride"
              type="number"
              min="10"
              max="300"
              step="1"
              class="w-14 bg-slate-900 dark:bg-slate-900 bg-gray-50 border border-slate-600 dark:border-slate-600 border-gray-300 text-slate-100 dark:text-slate-100 text-gray-900 text-sm font-mono text-right px-2 py-1 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span class="text-sm text-slate-400 dark:text-slate-400 text-gray-500">%</span>
            <button
              @click="machine.feedOverride = 100"
              class="px-2 py-1 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-400 dark:text-slate-400 text-gray-500 rounded text-xs transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
        <div class="relative">
          <input
            v-model.number="machine.feedOverride"
            type="range"
            min="10"
            max="300"
            step="1"
            class="override-slider w-full"
          />
          <div class="flex justify-between text-xs text-slate-600 dark:text-slate-600 text-gray-400 mt-0.5 px-0.5">
            <span>10%</span>
            <span class="text-slate-400 dark:text-slate-400 text-gray-500 font-medium">100%</span>
            <span>300%</span>
          </div>
        </div>
      </div>

      <!-- Spindle override -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-sm text-slate-300 dark:text-slate-300 text-gray-700 font-medium">Spindle Speed</span>
          <div class="flex items-center gap-1.5">
            <input
              v-model.number="machine.spindleOverride"
              type="number"
              min="10"
              max="300"
              step="1"
              class="w-14 bg-slate-900 dark:bg-slate-900 bg-gray-50 border border-slate-600 dark:border-slate-600 border-gray-300 text-slate-100 dark:text-slate-100 text-gray-900 text-sm font-mono text-right px-2 py-1 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span class="text-sm text-slate-400 dark:text-slate-400 text-gray-500">%</span>
            <button
              @click="machine.spindleOverride = 100"
              class="px-2 py-1 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-400 dark:text-slate-400 text-gray-500 rounded text-xs transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
        <div class="relative">
          <input
            v-model.number="machine.spindleOverride"
            type="range"
            min="10"
            max="300"
            step="1"
            class="override-slider w-full"
          />
          <div class="flex justify-between text-xs text-slate-600 dark:text-slate-600 text-gray-400 mt-0.5 px-0.5">
            <span>10%</span>
            <span class="text-slate-400 dark:text-slate-400 text-gray-500 font-medium">100%</span>
            <span>300%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'

const machine = useMachineStore()
</script>
