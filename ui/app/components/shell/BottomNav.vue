<template>
  <nav
    v-if="route.path === '/'"
    class="md:hidden flex items-stretch bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 shrink-0"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-11 text-xs font-medium transition-colors"
      :class="mobileTab === tab.key
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-gray-500 dark:text-slate-400'"
      @click="mobileTab = tab.key"
    >
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" :d="tab.icon" />
      </svg>
      {{ tab.label }}
    </button>
  </nav>
</template>

<script setup lang="ts">
import { useMobileTab, type MobileTab } from '~/composables/useMobileTab'

const route = useRoute()
const mobileTab = useMobileTab()

const tabs: { key: MobileTab, label: string, icon: string }[] = [
  { key: 'monitor', label: 'Monitor', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2' },
  { key: 'control', label: 'Control', icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.121 2.122' },
]
</script>
