<template>
  <div
    class="bg-slate-800 dark:bg-slate-800 bg-white rounded-lg border border-slate-700 dark:border-slate-700 border-gray-200 p-3 shrink-0 overflow-hidden"
  >
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2 min-w-0">
        <svg class="w-4 h-4 text-slate-400 dark:text-slate-400 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span class="text-sm font-medium text-slate-200 dark:text-slate-200 text-gray-800 truncate">
          {{ machine.job?.filename ?? 'No file loaded' }}
        </span>
      </div>
      <button
        class="text-xs px-2.5 py-1 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-300 dark:text-slate-300 text-gray-600 rounded-md transition-colors whitespace-nowrap"
      >
        Load File
      </button>
    </div>

    <div v-if="machine.job" class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mb-2.5">
      <div class="flex gap-1.5 items-center">
        <span class="text-slate-500 dark:text-slate-500 text-gray-400">X</span>
        <span class="text-slate-300 dark:text-slate-300 text-gray-600 font-mono">0.0 – 200.0 mm</span>
      </div>
      <div class="flex gap-1.5 items-center">
        <span class="text-slate-500 dark:text-slate-500 text-gray-400">Lines</span>
        <span class="text-slate-300 dark:text-slate-300 text-gray-600 font-mono">{{ machine.job.totalLines.toLocaleString() }}</span>
      </div>
      <div class="flex gap-1.5 items-center">
        <span class="text-slate-500 dark:text-slate-500 text-gray-400">Y</span>
        <span class="text-slate-300 dark:text-slate-300 text-gray-600 font-mono">0.0 – 150.0 mm</span>
      </div>
      <div class="flex gap-1.5 items-center">
        <span class="text-slate-500 dark:text-slate-500 text-gray-400">Runtime</span>
        <span class="text-slate-300 dark:text-slate-300 text-gray-600 font-mono">{{ formatRuntime(machine.job.estimatedRuntime) }}</span>
      </div>
      <div class="flex gap-1.5 items-center">
        <span class="text-slate-500 dark:text-slate-500 text-gray-400">Z</span>
        <span class="text-slate-300 dark:text-slate-300 text-gray-600 font-mono">-25.0 – 0.0 mm</span>
      </div>
      <div class="flex gap-1.5 items-center">
        <span class="text-slate-500 dark:text-slate-500 text-gray-400">Tools</span>
        <span class="text-slate-300 dark:text-slate-300 text-gray-600 font-mono">{{ machine.tools.length }}</span>
      </div>
    </div>

    <!-- Tool list -->
    <div v-if="machine.job" class="flex gap-1.5 overflow-x-auto pb-0.5">
      <div
        v-for="tool in machine.tools"
        :key="tool.number"
        class="flex-none flex items-center gap-1.5 bg-slate-900 dark:bg-slate-900 bg-gray-50 border border-slate-700 dark:border-slate-700 border-gray-200 rounded-md px-2.5 py-1.5"
      >
        <div class="w-5 h-5 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
          {{ tool.number }}
        </div>
        <div class="min-w-0">
          <p class="text-xs font-medium text-slate-200 dark:text-slate-200 text-gray-800 whitespace-nowrap">{{ tool.description }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-500 text-gray-400">{{ (tool.lineEnd - tool.lineStart + 1).toLocaleString() }} lines</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'

const machine = useMachineStore()

function formatRuntime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
</script>
