<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-3"
  >
    <div class="flex items-center justify-between">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Tool-Setter
      </h2>
    </div>

    <button
      class="flex items-center gap-2 w-full group"
      @click="s.toolsetter.enabled = !s.toolsetter.enabled"
    >
      <span
        :class="s.toolsetter.enabled
          ? 'bg-blue-600 border-blue-600'
          : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-500'"
        class="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
      >
        <svg v-if="s.toolsetter.enabled" class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">Enabled</span>
    </button>

    <template v-if="s.toolsetter.enabled">
      <p class="text-[10px] text-gray-400 dark:text-slate-500 -mt-1">
        X/Y should match the toolchange position configured in FluidSender — the probe
        motion has to physically arrive here. Radius is the switch's effective contact
        footprint.
      </p>
      <div class="grid grid-cols-3 gap-x-3 gap-y-2">
        <DimInput v-model="s.toolsetter.x" label="X" unit="mm" :step="1" />
        <DimInput v-model="s.toolsetter.y" label="Y" unit="mm" :step="1" />
        <DimInput v-model="s.toolsetter.radius" label="Radius" unit="mm" :step="0.5" :min="0.5" />
      </div>

      <!-- Trigger height is deliberately hidden by default: it's the sim's ground
           truth, not a value meant to be typed into FluidSender's TOL baseline. The
           point of the test is to run FluidSender's own calibration flow against it. -->
      <div class="border-t border-gray-100 dark:border-slate-700 pt-2.5">
        <button
          class="text-[10px] text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 underline decoration-dotted"
          @click="revealTriggerZ = !revealTriggerZ"
        >
          {{ revealTriggerZ ? 'Hide' : 'Reveal' }} physical trigger height (dev only — don't copy into FluidSender)
        </button>
        <div v-if="revealTriggerZ" class="grid grid-cols-3 gap-x-3 gap-y-2 mt-2">
          <DimInput v-model="s.toolsetter.triggerZ" label="Trigger Z" unit="mm" :step="0.1" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSimStore } from '~/stores/sim'

const s = useSimStore()
const revealTriggerZ = ref(false)
</script>
