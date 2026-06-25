<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2.5">
      Position
    </h2>

    <div class="space-y-1.5">
      <div
        v-for="axis in (['x', 'y', 'z'] as const)"
        :key="axis"
        class="grid items-center gap-1.5"
        style="grid-template-columns: 1.1rem 1fr auto"
      >
        <span class="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">{{ axis }}</span>
        <div
          class="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 font-mono text-sm text-right text-gray-900 dark:text-slate-100"
        >
          {{ s.pos[axis].toFixed(3) }}
        </div>
        <button
          @click="s.pos[axis] = 0"
          class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors font-medium"
        >
          Zero
        </button>
      </div>
    </div>

    <div class="mt-2.5 flex gap-1.5">
      <button
        @click="s.pos.x = 0; s.pos.y = 0; s.pos.z = 0"
        class="flex-1 text-xs py-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors font-medium"
      >
        Zero All
      </button>
      <button
        @click="goHome"
        class="flex-1 text-xs py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium"
      >
        Home
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'

const s = useSimStore()

function goHome() {
  s.machineState = 'Homing'
  setTimeout(() => {
    s.pos.x = 0
    s.pos.y = 0
    s.pos.z = 0
    s.machineState = 'Idle'
  }, 800)
}
</script>
