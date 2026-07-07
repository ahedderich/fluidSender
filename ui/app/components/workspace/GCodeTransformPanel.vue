<template>
  <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Transform</h3>
      <span
        v-if="activeMode !== 'none'"
        class="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
      >
        {{ modeLabel }}
      </span>
      <span v-else-if="isAnalyzing" class="text-xs text-gray-400 dark:text-slate-500">Building…</span>
    </div>

    <div class="flex flex-col gap-2">
      <label
        class="flex items-center justify-between gap-2 cursor-pointer"
        :class="{ 'opacity-40 cursor-not-allowed': !rotationAvailable }"
      >
        <span class="text-xs text-gray-700 dark:text-slate-300">Rotation compensation</span>
        <button
          role="switch"
          :aria-checked="rotationEnabled"
          :disabled="!rotationAvailable"
          class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:pointer-events-none"
          :class="rotationEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'"
          @click="toggleRotation"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
            :class="rotationEnabled ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>
      </label>

      <label
        class="flex items-center justify-between gap-2 cursor-pointer"
        :class="{ 'opacity-40 cursor-not-allowed': !heightmapAvailable }"
      >
        <span class="text-xs text-gray-700 dark:text-slate-300">Heightmap compensation</span>
        <button
          role="switch"
          :aria-checked="heightmapEnabled"
          :disabled="!heightmapAvailable"
          class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:pointer-events-none"
          :class="heightmapEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'"
          @click="toggleHeightmap"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
            :class="heightmapEnabled ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSyncStore } from '~/stores/sync'
import { wsSend } from '~/composables/useWsSend'

const syncStore = useSyncStore()

const ps = syncStore.probingState

const activeMode = computed(() => syncStore.job?.transformMode ?? 'none')
const isAnalyzing = computed(() => syncStore.job?.status === 'analyzing')
const jobLoaded = computed(() => !!syncStore.job?.fileId)

const rotationAvailable = computed(() => jobLoaded.value && !!ps.rotation && !isAnalyzing.value)
const heightmapAvailable = computed(() => jobLoaded.value && !!ps.heightmap && !isAnalyzing.value)

const rotationEnabled = computed(
  () => activeMode.value === 'rotated' || activeMode.value === 'rotated_height_adjusted',
)

const heightmapEnabled = computed(
  () => activeMode.value === 'height_adjusted' || activeMode.value === 'rotated_height_adjusted',
)

const modeLabel = computed(() => {
  switch (activeMode.value) {
    case 'rotated': return 'Rotated'
    case 'height_adjusted': return 'Height-adjusted'
    case 'rotated_height_adjusted': return 'Rotated + Height-adjusted'
    default: return ''
  }
})

function sendToggle(rotation: boolean, heightmap: boolean): void {
  wsSend({ t: 'job:setTransformMode', payload: { rotationActive: rotation, heightmapActive: heightmap } })
}

function toggleRotation(): void {
  if (!rotationAvailable.value) return
  sendToggle(!rotationEnabled.value, heightmapEnabled.value)
}

function toggleHeightmap(): void {
  if (!heightmapAvailable.value) return
  sendToggle(rotationEnabled.value, !heightmapEnabled.value)
}
</script>
