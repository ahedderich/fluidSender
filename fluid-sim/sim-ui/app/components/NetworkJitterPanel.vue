<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-3"
  >
    <div class="flex items-center justify-between">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Network Jitter (TCP)
      </h2>
    </div>

    <button
      class="flex items-center gap-2 w-full group"
      @click="s.networkJitter.enabled = !s.networkJitter.enabled"
    >
      <span
        :class="s.networkJitter.enabled
          ? 'bg-blue-600 border-blue-600'
          : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-500'"
        class="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
      >
        <svg v-if="s.networkJitter.enabled" class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">Enabled</span>
    </button>

    <template v-if="s.networkJitter.enabled">
      <p class="text-[10px] text-gray-400 dark:text-slate-500 -mt-1">
        Delays every response write to simulate real, documented ESP32 WiFi/TCP flow-control
        defects (bdring/FluidNC#1777) — for stress-testing a sender's pipelined dispatch
        against delayed/bursty acks. USB serial has no equivalent failure mode; this only
        applies here because the sim is TCP-only.
      </p>
      <div class="grid grid-cols-2 gap-x-3 gap-y-2">
        <DimInput v-model="s.networkJitter.minDelayMs" label="Min Delay" unit="ms" :step="10" :min="0" />
        <DimInput v-model="s.networkJitter.maxDelayMs" label="Max Delay" unit="ms" :step="10" :min="0" />
      </div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-2">
        <DimInput v-model="s.networkJitter.stallChancePct" label="Stall Chance" unit="%" :step="5" :min="0" :max="100" />
        <DimInput v-model="s.networkJitter.stallDelayMs" label="Stall Delay" unit="ms" :step="100" :min="0" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'

const s = useSimStore()
</script>
