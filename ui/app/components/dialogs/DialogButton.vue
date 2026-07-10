<template>
  <button
    type="button"
    class="rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 inline-flex items-center justify-center gap-1.5"
    :class="variantClass"
    :data-dialog-primary="isPrimary ? '' : undefined"
  >
    <slot />
    <UiShortcutBadge v-if="shortcut" :action="shortcut" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ShortcutActionId } from '~/stores/settings'

/** Standardized dialog action button.
 *  Order convention: place `neutral`/`neutral-danger` (cancel/secondary) buttons
 *  before `primary`/`danger` (confirm) buttons in the footer markup — the primary
 *  action goes rightmost. DialogFrame's autofocus looks for the first
 *  `data-dialog-primary` button when a dialog has no form fields to focus instead. */
const props = withDefaults(defineProps<{
  variant?: 'neutral' | 'primary' | 'danger' | 'neutral-danger' | 'ghost-danger'
  shortcut?: ShortcutActionId
  /** Override which button gets the autofocus fallback marker. Defaults to
   *  true for `primary`/`danger` variants, false otherwise. */
  autofocus?: boolean
}>(), {
  variant: 'neutral',
  shortcut: undefined,
  autofocus: undefined,
})

const isPrimary = computed(() => props.autofocus ?? (props.variant === 'primary' || props.variant === 'danger'))

const variantClass = computed(() => ({
  neutral: 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200',
  primary: 'bg-blue-600 hover:bg-blue-500 text-white',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
  'neutral-danger': 'bg-gray-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400',
  'ghost-danger': 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
}[props.variant]))
</script>
