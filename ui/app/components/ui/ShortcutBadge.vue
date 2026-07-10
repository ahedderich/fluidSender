<template>
  <span v-if="label" class="ml-1.5 text-[10px] font-mono opacity-60 align-middle">[{{ label }}]</span>
</template>

<script setup lang="ts">
import { useShortcutDisplay } from '~/composables/useShortcutDisplay'
import type { ShortcutActionId } from '~/stores/settings'

const props = defineProps<{ action: ShortcutActionId }>()
const { badge } = useShortcutDisplay()
const label = computed(() => badge(props.action))
</script>
