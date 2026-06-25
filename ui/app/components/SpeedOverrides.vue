<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 shrink-0"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
      Overrides
    </h2>

    <div class="space-y-2">
      <!-- Feed override -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-600 dark:text-slate-300 font-medium w-20 shrink-0">Feed Rate</span>
        <input
          v-model.number="machine.feedOverride"
          type="range"
          min="10"
          max="300"
          step="1"
          class="override-slider flex-1"
        />
        <div
          v-if="!editingFeed"
          @click="editingFeed = true"
          class="w-11 text-right text-xs font-mono cursor-pointer text-gray-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 select-none shrink-0"
        >
          {{ machine.feedOverride }}%
        </div>
        <input
          v-else
          v-model.number="machine.feedOverride"
          type="number"
          min="10"
          max="300"
          @blur="editingFeed = false"
          @keydown.enter="editingFeed = false"
          @keydown.escape="editingFeed = false"
          class="w-11 bg-gray-50 dark:bg-slate-900 border border-blue-500 text-gray-900 dark:text-slate-100 text-xs font-mono text-right px-1 py-0.5 rounded focus:outline-none shrink-0"
        />
        <button
          @click="machine.feedOverride = 100"
          class="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-sm leading-none shrink-0 transition-colors"
          title="Reset to 100%"
        >
          ↺
        </button>
      </div>

      <!-- Spindle override -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-600 dark:text-slate-300 font-medium w-20 shrink-0">Spindle</span>
        <input
          v-model.number="machine.spindleOverride"
          type="range"
          min="10"
          max="300"
          step="1"
          class="override-slider flex-1"
        />
        <div
          v-if="!editingSpindle"
          @click="editingSpindle = true"
          class="w-11 text-right text-xs font-mono cursor-pointer text-gray-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 select-none shrink-0"
        >
          {{ machine.spindleOverride }}%
        </div>
        <input
          v-else
          v-model.number="machine.spindleOverride"
          type="number"
          min="10"
          max="300"
          @blur="editingSpindle = false"
          @keydown.enter="editingSpindle = false"
          @keydown.escape="editingSpindle = false"
          class="w-11 bg-gray-50 dark:bg-slate-900 border border-blue-500 text-gray-900 dark:text-slate-100 text-xs font-mono text-right px-1 py-0.5 rounded focus:outline-none shrink-0"
        />
        <button
          @click="machine.spindleOverride = 100"
          class="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-sm leading-none shrink-0 transition-colors"
          title="Reset to 100%"
        >
          ↺
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'

const machine = useMachineStore()
const editingFeed = ref(false)
const editingSpindle = ref(false)
</script>
