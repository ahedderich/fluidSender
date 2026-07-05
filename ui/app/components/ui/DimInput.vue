<template>
  <label class="flex flex-col gap-1">
    <span class="text-xs text-gray-400 dark:text-slate-500">{{ label }}</span>
    <div class="flex items-center gap-1.5">
      <input
        :value="modelValue"
        @input="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
        type="number"
        :min="min"
        :max="max"
        :step="step"
        class="flex-1 min-w-0 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-100 font-mono text-right py-1.5 px-2 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <span class="text-xs text-gray-400 dark:text-slate-500 shrink-0 w-8">{{ unit }}</span>
    </div>
  </label>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  modelValue: number
  unit?: string
  min?: number
  max?: number
  step?: number
}>()
defineEmits<{ 'update:modelValue': [value: number] }>()
</script>
