<template>
  <button
    @click="$emit('update:modelValue', !modelValue)"
    :class="modelValue ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'"
    class="relative w-9 h-5 rounded-full transition-colors focus:outline-none shrink-0"
    role="switch"
    :aria-checked="modelValue"
    type="button"
  >
    <span
      :class="modelValue ? 'translate-x-4' : 'translate-x-0'"
      class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
    />
  </button>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>
