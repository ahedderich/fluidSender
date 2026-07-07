<template>
  <div class="flex items-center justify-between px-3 py-2 border-b border-gray-50 dark:border-slate-700/40 last:border-0">
    <span class="text-sm text-gray-700 dark:text-slate-300">{{ label }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string }>()
</script>
