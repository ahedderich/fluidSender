<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        File Browser
      </h2>
      <div class="flex items-center gap-1.5">
        <button
          class="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium"
        >
          Upload
        </button>
        <button
          class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors"
          title="Refresh"
        >
          ↺
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="px-3 py-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <input
        v-model="filter"
        type="text"
        placeholder="Filter files..."
        class="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-300 dark:placeholder-slate-600"
      />
    </div>

    <!-- File list -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <div
        v-for="file in filteredFiles"
        :key="file.name"
        class="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700/50 border-b border-gray-100 dark:border-slate-800/60 last:border-0 group"
      >
        <svg class="w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{{ file.name }}</p>
          <p class="text-xs text-gray-400 dark:text-slate-500">{{ file.size }} · {{ file.modified }}</p>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            class="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            Load
          </button>
          <button
            class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-red-600 hover:text-white text-gray-500 dark:text-slate-400 rounded transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      <div v-if="filteredFiles.length === 0" class="flex items-center justify-center py-12">
        <p class="text-gray-400 dark:text-slate-500 text-sm">No files found</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const filter = ref('')

const mockFiles = [
  { name: 'bracket_v3.nc', size: '184 KB', modified: '2 hours ago' },
  { name: 'enclosure_base.nc', size: '2.1 MB', modified: 'Yesterday' },
  { name: 'pcb_drill_template.nc', size: '45 KB', modified: '3 days ago' },
  { name: 'logo_engraving.nc', size: '610 KB', modified: 'Last week' },
  { name: 'fixture_plate.nc', size: '98 KB', modified: 'Last week' },
  { name: 'front_panel_v2.nc', size: '1.3 MB', modified: '2 weeks ago' },
  { name: 'test_cuts.nc', size: '12 KB', modified: '3 weeks ago' },
]

const filteredFiles = computed(() =>
  mockFiles.filter((f) => f.name.toLowerCase().includes(filter.value.toLowerCase())),
)
</script>
