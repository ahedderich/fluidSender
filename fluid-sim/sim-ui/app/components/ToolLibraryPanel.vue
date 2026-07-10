<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-2 min-h-0"
  >
    <div class="flex items-center justify-between shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Tool Library
      </h2>
      <div class="flex items-center gap-1.5">
        <button
          class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors"
          title="Import Fusion 360 tool library (.json) — same format as FluidSender's UI"
          @click="triggerImport"
        >
          Import
        </button>
        <button
          class="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          @click="s.addTool()"
        >
          + Add
        </button>
        <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileChange">
      </div>
    </div>

    <p class="text-[10px] text-gray-400 dark:text-slate-500 shrink-0">
      "Loaded" is the sim-ui stand-in for physically swapping the tool — FluidSender
      never sends M6 to the sim for manual/tool-setter toolchange.
    </p>

    <div class="flex-1 overflow-y-auto min-h-0 space-y-1">
      <p v-if="s.tools.length === 0" class="text-xs text-gray-400 dark:text-slate-500 italic text-center py-4">
        No tools — import a Fusion 360 library or add one manually
      </p>
      <div
        v-for="tool in sortedTools"
        :key="tool.id"
        :class="s.loadedToolNumber === tool.number
          ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
          : 'border-gray-200 dark:border-slate-700'"
        class="border rounded-md px-2 py-1.5 flex items-center gap-2"
      >
        <input
          v-model.number="tool.number"
          type="number"
          class="w-10 text-xs font-mono bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1 py-0.5"
          @change="s.persistTools()"
        >
        <input
          v-model="tool.name"
          type="text"
          class="flex-1 min-w-0 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1.5 py-0.5"
          @change="s.persistTools()"
        >
        <label class="flex items-center gap-1 shrink-0">
          <span class="text-[10px] text-gray-400 dark:text-slate-500">⌀</span>
          <input
            v-model.number="tool.diameter"
            type="number"
            step="0.5"
            class="w-12 text-xs font-mono bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1 py-0.5"
            @change="s.persistTools()"
          >
        </label>
        <label class="flex items-center gap-1 shrink-0" title="Shoulder length — used as the tool's physical stickout for tool-setter contact math">
          <span class="text-[10px] text-gray-400 dark:text-slate-500">LB</span>
          <input
            v-model.number="tool.shoulderLength"
            type="number"
            step="0.5"
            class="w-14 text-xs font-mono bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-1 py-0.5"
            @change="s.persistTools()"
          >
        </label>
        <button
          class="text-xs px-2 py-1 rounded font-medium shrink-0 transition-colors"
          :class="s.loadedToolNumber === tool.number
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-400'"
          @click="s.setLoadedTool(s.loadedToolNumber === tool.number ? null : tool.number)"
        >
          {{ s.loadedToolNumber === tool.number ? 'Unload' : 'Load' }}
        </button>
        <button
          class="p-1 text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 shrink-0"
          title="Remove tool"
          @click="s.removeTool(tool.id)"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="s.loadedToolNumber !== null" class="shrink-0 pt-2 border-t border-gray-100 dark:border-slate-700 text-[10px] text-gray-400 dark:text-slate-500 font-mono">
      Reported TLO (Z, from last G43.1): {{ s.toolLengthOffset.toFixed(3) }} mm
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSimStore } from '~/stores/sim'
import { parseFusion360Tools } from '~/utils/importTools'

const s = useSimStore()
const fileInput = ref<HTMLInputElement | null>(null)

// Display-only ordering — the underlying store array / persisted file keep
// insertion order (e.g. import order), which may matter for matching the source file.
const sortedTools = computed(() => [...s.tools].sort((a, b) => a.number - b.number))

function triggerImport() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const parsed = parseFusion360Tools(JSON.parse(text))
    await s.importTools(parsed)
  } catch {
    // Malformed file — silently ignore, matching the lightweight nature of this dev tool.
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>
