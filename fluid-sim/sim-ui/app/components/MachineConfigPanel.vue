<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-3"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
      Machine Dimensions
    </h2>
    <div class="grid grid-cols-3 gap-3">
      <ChangeInput label="Travel X" :value="s.travel.x" @change="(v) => s.setTravel({ x: v })" unit="mm" :step="1" :min="10" />
      <ChangeInput label="Travel Y" :value="s.travel.y" @change="(v) => s.setTravel({ y: v })" unit="mm" :step="1" :min="10" />
      <ChangeInput label="Travel Z" :value="s.travel.z" @change="(v) => s.setTravel({ z: v })" unit="mm" :step="1" :min="10" />
    </div>
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
      Max Rate
    </h2>
    <div class="grid grid-cols-3 gap-3">
      <ChangeInput label="Rate X" :value="s.maxRate.x" @change="(v) => s.setMaxRate({ x: v })" unit="mm/min" :step="10" :min="1" />
      <ChangeInput label="Rate Y" :value="s.maxRate.y" @change="(v) => s.setMaxRate({ y: v })" unit="mm/min" :step="10" :min="1" />
      <ChangeInput label="Rate Z" :value="s.maxRate.z" @change="(v) => s.setMaxRate({ z: v })" unit="mm/min" :step="10" :min="1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'

const s = useSimStore()
</script>
