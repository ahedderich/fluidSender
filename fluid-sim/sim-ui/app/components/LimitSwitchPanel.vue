<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-3"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
      Switches &amp; Probe
    </h2>

    <!-- Limit switches grid -->
    <div class="grid grid-cols-2 gap-1.5">
      <button
        v-for="sw in limitSwitches"
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

    <!-- Door sensor -->
    <button
      @click="s.triggerLimit('door')"
      :class="s.limits.door
        ? 'bg-orange-500 text-white border-orange-600 shadow-inner'
        : 'bg-gray-100 dark:bg-slate-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-600 hover:border-orange-400 hover:text-orange-600 dark:hover:text-orange-400'"
      class="w-full px-2 py-2 rounded border text-xs font-semibold transition-colors"
    >
      {{ s.limits.door ? 'Door Open' : 'Door Sensor' }}
    </button>

    <!-- Probe: tip diameter + trigger on one line -->
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-400 dark:text-slate-500 shrink-0">Probe tip</span>
      <input
        v-model.number="s.probe.tipDiameter"
        type="number"
        step="0.1"
        min="0.1"
        max="25"
        class="w-16 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-mono text-xs text-right px-1.5 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span class="text-[10px] text-gray-400 dark:text-slate-500 shrink-0">mm</span>
      <button
        @click="s.triggerProbe()"
        :class="s.probe.triggered
          ? 'bg-amber-500 text-white'
          : 'bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-500 hover:text-white text-amber-700 dark:text-amber-400'"
        class="flex-1 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap"
      >
        {{ s.probe.triggered ? 'TRIGGERED' : 'Trigger Probe' }}
      </button>
    </div>

    <p class="text-[10px] text-gray-400 dark:text-slate-500 -mt-1">
      Click any switch to momentarily trigger it (auto-clears after 500 ms).
    </p>

    <!-- Probe trigger deviations -->
    <div>
      <span class="text-xs text-gray-400 dark:text-slate-500">Trigger deviations</span>
      <div class="grid grid-cols-5 gap-1 mt-1">
        <label v-for="dev in deviationFields" :key="dev.key" class="flex flex-col items-center gap-0.5">
          <span class="text-[10px] text-gray-400 dark:text-slate-500">{{ dev.label }}</span>
          <input
            v-model.number="s.probe.deviations[dev.key]"
            type="number"
            step="0.01"
            min="-2"
            max="2"
            class="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-mono text-xs text-right px-1 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </label>
      </div>
      <p class="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
        mm; positive = triggers late (pre-travel), negative = triggers early.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'
import type { LimitKey } from '~/stores/sim'

const s = useSimStore()

const limitSwitches: { key: LimitKey; label: string }[] = [
  { key: 'xMin', label: 'X Min' },
  { key: 'xMax', label: 'X Max' },
  { key: 'yMin', label: 'Y Min' },
  { key: 'yMax', label: 'Y Max' },
  { key: 'zMin', label: 'Z Min' },
  { key: 'zMax', label: 'Z Max' },
]

const deviationFields: { key: keyof typeof s.probe.deviations; label: string }[] = [
  { key: 'xPlus', label: '+X' },
  { key: 'xMinus', label: '−X' },
  { key: 'yPlus', label: '+Y' },
  { key: 'yMinus', label: '−Y' },
  { key: 'zMinus', label: '−Z' },
]
</script>
