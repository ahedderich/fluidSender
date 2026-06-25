<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
      Machine Dimensions
    </h2>
    <div class="grid grid-cols-3 gap-3">
      <DimInput label="Travel X" v-model="s.travel.x" unit="mm" :step="1" :min="10" />
      <DimInput label="Travel Y" v-model="s.travel.y" unit="mm" :step="1" :min="10" />
      <DimInput label="Travel Z" v-model="s.travel.z" unit="mm" :step="1" :min="10" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'

const s = useSimStore()
</script>
