<template>
  <label class="flex flex-col gap-1">
    <span class="text-xs text-gray-400 dark:text-slate-500">{{ label }}</span>
    <div class="flex items-center gap-1.5">
      <input
        :value="modelValue"
        type="number"
        :min="min"
        :max="max"
        :step="step"
        class="flex-1 min-w-0 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-100 font-mono text-right py-1.5 px-2 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
        @blur="onBlur"
      />
      <span class="text-xs text-gray-400 dark:text-slate-500 shrink-0 w-8">{{ unit }}</span>
    </div>
  </label>
</template>

<script setup lang="ts">
const props = defineProps<{
  label: string
  modelValue: number
  unit?: string
  min?: number
  max?: number
  step?: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

// `min`/`max` on a native number input only affect the spinner arrows, not typed
// input — clamp on blur so the declared bounds are actually enforced.
function onBlur(e: Event) {
  let value = Number((e.target as HTMLInputElement).value)
  if (props.min !== undefined && value < props.min) value = props.min
  if (props.max !== undefined && value > props.max) value = props.max
  emit('update:modelValue', value)
}
</script>
