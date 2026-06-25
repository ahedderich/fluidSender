<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()

useHead({
  htmlAttrs: {
    class: computed(() => (ui.darkMode ? 'dark' : '')),
  },
})
</script>
