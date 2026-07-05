<template>
  <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
    <div class="px-3 py-2 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">{{ title }}</h3>
      <span
        v-if="fluidncConfig"
        class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-700/50"
      >fluidnc config</span>
    </div>
    <div class="py-1" :class="{ 'opacity-50 pointer-events-none select-none': disabled }">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; fluidncConfig?: boolean; disabled?: boolean }>()
</script>
