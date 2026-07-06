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
      <div>
        <h3 class="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
          Trigger Deviations
        </h3>
        <div class="grid grid-cols-2 gap-2">
          <DimInput
            label="+X"
            v-model="s.probe.deviations.xPlus"
            unit="mm"
            :step="0.01"
            :min="-2"
            :max="2"
          />
          <DimInput
            label="−X"
            v-model="s.probe.deviations.xMinus"
            unit="mm"
            :step="0.01"
            :min="-2"
            :max="2"
          />
          <DimInput
            label="+Y"
            v-model="s.probe.deviations.yPlus"
            unit="mm"
            :step="0.01"
            :min="-2"
            :max="2"
          />
          <DimInput
            label="−Y"
            v-model="s.probe.deviations.yMinus"
            unit="mm"
            :step="0.01"
            :min="-2"
            :max="2"
          />
          <DimInput
            label="−Z"
            v-model="s.probe.deviations.zMinus"
            unit="mm"
            :step="0.01"
            :min="-2"
            :max="2"
          />
        </div>
        <p class="text-[10px] text-gray-400 dark:text-slate-500 mt-1.5">
          Positive = trigger fires before centre reaches the surface (normal; ≈ ball radius). Negative = trigger fires after centre has passed the surface.
        </p>
      </div>
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

// Probe edits are pushed to the sim by the store's debounced watch.
const s = useSimStore()
</script>
