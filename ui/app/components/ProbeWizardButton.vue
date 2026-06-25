<template>
  <button
    @click="$emit('click')"
    class="w-full flex items-start gap-3 p-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg text-left transition-colors group"
  >
    <div class="w-8 h-8 rounded-md bg-blue-900 dark:bg-blue-900 bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
      <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    </div>
    <div class="min-w-0">
      <p class="text-sm font-medium text-gray-800 dark:text-slate-200 group-hover:text-white dark:group-hover:text-white group-hover:text-gray-900">{{ label }}</p>
      <p class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{{ description }}</p>
    </div>
    <svg class="w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0 mt-0.5 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  </button>
</template>

<script setup lang="ts">
defineProps<{ label: string; description: string; icon?: string }>()
defineEmits<{ click: [] }>()
</script>
