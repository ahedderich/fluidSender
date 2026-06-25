<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2.5">
      Limit Switches
    </h2>

    <div class="grid grid-cols-2 gap-1.5">
      <button
        v-for="sw in switches"
        :key="sw.key"
        @click="s.triggerLimit(sw.key)"
        :class="s.limits[sw.key]
          ? 'bg-red-500 text-white border-red-600 shadow-inner'
          : 'bg-gray-100 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-600 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400'"
        class="px-2 py-2 rounded border text-xs font-semibold transition-colors"
      >
        {{ sw.label }}
      </button>
    </div>

    <p class="text-[10px] text-gray-400 dark:text-slate-500 mt-2 leading-snug">
      Click to momentarily trigger a switch (auto-clears after 500 ms).
    </p>
  </div>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'
import type { LimitKey } from '~/stores/sim'

const s = useSimStore()

const switches: { key: LimitKey; label: string }[] = [
  { key: 'xMin', label: 'X Min' },
  { key: 'xMax', label: 'X Max' },
  { key: 'yMin', label: 'Y Min' },
  { key: 'yMax', label: 'Y Max' },
  { key: 'zMin', label: 'Z Min' },
  { key: 'zMax', label: 'Z Max' },
]
</script>
