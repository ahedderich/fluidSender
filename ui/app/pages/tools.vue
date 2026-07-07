<template>
  <main class="flex-1 flex flex-col min-h-0 overflow-hidden">

    <!-- Tab bar -->
    <div class="flex gap-0.5 p-1.5 border-b border-gray-100 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-800">
      <button
        v-for="(tab, i) in tabs"
        :key="i"
        @click="activeTab = i"
        class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
        :class="activeTab === i
          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
          : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700'"
      >
        {{ tab }}
      </button>
    </div>

    <!-- Tab content — kept alive to preserve wizard state across tab switches -->
    <div class="flex-1 overflow-y-auto">
      <ToolsSurfacingGenerator v-show="activeTab === 0" />
      <ToolsProbeCalibration v-show="activeTab === 1" />
    </div>

  </main>
</template>

<script setup lang="ts">
const tabs = ['Surfacing Generator', 'Touch Probe Calibration']

const route = useRoute()
const router = useRouter()

const activeTab = computed({
  get: () => {
    const t = Number(route.query.tab)
    return Number.isFinite(t) && t >= 0 && t < tabs.length ? t : 0
  },
  set: (v: number) => {
    router.replace({ query: { ...route.query, tab: v === 0 ? undefined : String(v) } })
  },
})
</script>
