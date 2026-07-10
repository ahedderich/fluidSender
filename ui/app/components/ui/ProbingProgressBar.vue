<template>
  <div class="rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-3 space-y-2">
    <div class="flex items-center justify-between text-xs">
      <span class="text-gray-600 dark:text-slate-300 truncate max-w-[70%]">{{ ps.currentStepLabel || 'Running…' }}</span>
      <span class="text-gray-400 dark:text-slate-500 shrink-0 ml-2">{{ ps.stepIndex + 1 }} / {{ ps.totalSteps || '?' }}</span>
    </div>
    <div class="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <div
        class="h-full bg-blue-500 rounded-full transition-all duration-300"
        :style="{ width: progressPct + '%' }"
      />
    </div>
    <button
      @click="$emit('abort')"
      class="w-full py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded-lg transition-colors"
    >
      Abort Probing
      <UiShortcutBadge action="dialogCancel" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ProbingState } from '~/stores/sync'

const props = defineProps<{ ps: ProbingState }>()
defineEmits<{ abort: [] }>()

const progressPct = computed(() => {
  if (!props.ps.totalSteps) return 0
  return Math.min(100, Math.round((props.ps.stepIndex / props.ps.totalSteps) * 100))
})
</script>
