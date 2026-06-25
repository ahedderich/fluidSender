<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
  >
    <div class="flex items-center justify-between mb-2.5">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Probe
      </h2>
      <span
        :class="s.probe.triggered
          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 animate-pulse'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'"
        class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      >
        {{ s.probe.triggered ? 'TRIGGERED' : 'OPEN' }}
      </span>
    </div>

    <div class="space-y-2.5">
      <DimInput
        label="Tip Diameter"
        v-model="s.probe.tipDiameter"
        unit="mm"
        :step="0.1"
        :min="0.1"
        :max="25"
      />
      <button
        @click="s.triggerProbe"
        class="w-full py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors"
      >
        Trigger Probe
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'

const s = useSimStore()
</script>
