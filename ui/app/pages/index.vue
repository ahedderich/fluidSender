<template>
  <div class="h-screen flex flex-col overflow-hidden bg-slate-950 dark:bg-slate-950 bg-gray-100">
    <TopBar />

    <main class="flex-1 grid min-h-0 gap-2 p-2 overflow-hidden" style="grid-template-columns: 1fr 22rem 26rem">
      <!-- Left column: 3D viewport + job info -->
      <div class="flex flex-col gap-2 min-h-0">
        <GCodeViewport class="flex-1 min-h-0" />
        <JobInfo />
      </div>

      <!-- Middle column: DRO + navigation + speed overrides -->
      <div class="flex flex-col gap-2 min-h-0">
        <DROPanel />
        <NavigationPanel class="flex-1 min-h-0" />
        <SpeedOverrides />
      </div>

      <!-- Right column: probing + console -->
      <div class="flex flex-col gap-2 min-h-0">
        <ProbingPanel class="flex-1 min-h-0" />
        <ConsolePanel class="h-56" />
      </div>
    </main>
  </div>
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
