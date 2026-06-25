<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <!-- Header -->
    <div
      class="px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0 flex items-center justify-between"
    >
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        FluidNC Config
      </h2>
      <span
        class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-700/50"
      >
        fluidnc config
      </span>
    </div>

    <!-- Config rows -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <table class="w-full text-xs">
        <tbody>
          <tr
            v-for="(value, key) in s.fluidConfig"
            :key="key"
            class="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30"
          >
            <td class="px-3 py-1.5 font-mono text-gray-500 dark:text-slate-400 whitespace-nowrap pr-4">
              {{ key }}
            </td>
            <td class="px-2 py-1">
              <input
                :value="value"
                @change="(e) => { s.fluidConfig[key] = (e.target as HTMLInputElement).value }"
                class="w-full bg-transparent text-right font-mono text-gray-800 dark:text-slate-200 focus:outline-none focus:bg-gray-100 dark:focus:bg-slate-700 rounded px-1 py-0.5"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add key -->
    <div class="px-3 py-2 border-t border-gray-100 dark:border-slate-700 shrink-0">
      <div v-if="addingKey" class="flex gap-1.5">
        <input
          v-model="newKey"
          placeholder="config/key"
          class="flex-1 min-w-0 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-100 font-mono text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          @keydown.enter="confirmAdd"
          @keydown.escape="cancelAdd"
          ref="newKeyInput"
        />
        <button
          @click="confirmAdd"
          class="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
        >
          Add
        </button>
        <button
          @click="cancelAdd"
          class="px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
      <button
        v-else
        @click="startAdd"
        class="w-full text-xs py-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors"
      >
        + Add config key
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useSimStore } from '~/stores/sim'

const s = useSimStore()

const addingKey = ref(false)
const newKey = ref('')
const newKeyInput = ref<HTMLInputElement | null>(null)

function startAdd() {
  addingKey.value = true
  newKey.value = ''
  nextTick(() => newKeyInput.value?.focus())
}

function confirmAdd() {
  const key = newKey.value.trim()
  if (key && !(key in s.fluidConfig)) {
    s.fluidConfig[key] = ''
  }
  addingKey.value = false
}

function cancelAdd() {
  addingKey.value = false
}
</script>
