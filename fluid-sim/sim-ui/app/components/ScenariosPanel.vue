<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <!-- Header -->
    <div
      class="px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0 flex items-center justify-between"
    >
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Scenarios
      </h2>
      <span class="text-[10px] text-gray-400 dark:text-slate-500">{{ sim.scenarios.length }} saved</span>
    </div>

    <!-- Scenario list -->
    <div class="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-50 dark:divide-slate-700/50">
      <div
        v-for="scenario in sim.scenarios"
        :key="scenario.id"
        class="group flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
        :class="activeId === scenario.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
      >
        <!-- Apply button (main content) -->
        <button
          class="flex-1 text-left min-w-0"
          @click="apply(scenario)"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <!-- Default star indicator -->
            <svg
              v-if="sim.defaultScenarioId === scenario.id"
              class="w-3 h-3 shrink-0 text-amber-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <div
              class="text-sm font-medium truncate"
              :class="activeId === scenario.id
                ? 'text-blue-700 dark:text-blue-300'
                : 'text-gray-800 dark:text-slate-200'"
            >
              {{ scenario.name }}
            </div>
          </div>
          <div class="text-xs text-gray-400 dark:text-slate-500 mt-0.5 leading-snug line-clamp-2">
            {{ scenario.description }}
          </div>
          <div class="flex items-center gap-2 mt-1">
            <span
              :class="stateClass(scenario.machineState)"
              class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            >
              {{ scenario.machineState }}
            </span>
            <span class="text-[10px] text-gray-400 dark:text-slate-500">
              {{ scenario.stock.shape === 'rect' ? `${scenario.stock.width}×${scenario.stock.height}mm rect` : `⌀${scenario.stock.diameter}mm round` }}
              <template v-if="scenario.stock.rotation"> · {{ scenario.stock.rotation }}°</template>
            </span>
          </div>
        </button>

        <!-- Row actions (visible on hover) -->
        <div class="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <!-- Set/unset default -->
          <button
            @click="toggleDefault(scenario.id)"
            class="p-1 rounded transition-colors"
            :class="sim.defaultScenarioId === scenario.id
              ? 'text-amber-400 hover:text-amber-500'
              : 'text-gray-300 dark:text-slate-600 hover:text-amber-400'"
            :title="sim.defaultScenarioId === scenario.id ? 'Remove default' : 'Set as default'"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" :fill="sim.defaultScenarioId === scenario.id ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>

          <!-- Recapture current state -->
          <button
            @click="recapture(scenario)"
            class="p-1 text-gray-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400 rounded transition-colors"
            title="Overwrite with current sim state"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <!-- Delete -->
          <button
            @click="remove(scenario.id)"
            class="p-1 text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
            title="Delete scenario"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div
        v-if="sim.scenarios.length === 0"
        class="px-3 py-6 text-center text-xs text-gray-400 dark:text-slate-500"
      >
        No scenarios yet
      </div>
    </div>

    <!-- Save current state as scenario -->
    <div class="border-t border-gray-100 dark:border-slate-700 p-2 shrink-0">
      <div v-if="saving" class="flex gap-1.5">
        <input
          v-model="newName"
          ref="nameInput"
          placeholder="Scenario name…"
          class="flex-1 min-w-0 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-100 text-xs px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          @keydown.enter="confirmSave"
          @keydown.escape="saving = false"
        />
        <button
          @click="confirmSave"
          :disabled="!newName.trim()"
          class="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-xs font-medium transition-colors"
        >
          Save
        </button>
        <button
          @click="saving = false"
          class="px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
      <button
        v-else
        @click="startSave"
        class="w-full text-xs py-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors flex items-center justify-center gap-1"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Save current state
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useSimStore } from '~/stores/sim'
import type { Scenario, MachineState } from '~/stores/sim'

const sim = useSimStore()

const activeId = ref<string | null>(null)
const saving = ref(false)
const newName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

// Populate the store so applyDefaultScenario (called on WS connect) has data to work with
const { data } = await useFetch<{ defaultId: string | null; scenarios: Scenario[] }>('/api/scenarios')
if (data.value) {
  sim.scenarios = data.value.scenarios
  sim.defaultScenarioId = data.value.defaultId
}

async function persist() {
  await $fetch('/api/scenarios', {
    method: 'POST',
    body: { defaultId: sim.defaultScenarioId, scenarios: sim.scenarios },
  })
}

function apply(scenario: Scenario) {
  sim.applyScenario(scenario)
  activeId.value = scenario.id
}

function toggleDefault(id: string) {
  sim.defaultScenarioId = sim.defaultScenarioId === id ? null : id
  persist()
}

function recapture(scenario: Scenario) {
  const idx = sim.scenarios.findIndex((s) => s.id === scenario.id)
  if (idx === -1) return
  sim.scenarios[idx] = {
    ...scenario,
    machineState: sim.machineState,
    pos: { ...sim.pos },
    wco: { ...sim.wco },
    stock: { ...sim.stock, hole: { ...sim.stock.hole }, point: { ...sim.stock.point } },
  }
  persist()
}

function remove(id: string) {
  sim.scenarios = sim.scenarios.filter((s) => s.id !== id)
  if (activeId.value === id) activeId.value = null
  if (sim.defaultScenarioId === id) sim.defaultScenarioId = null
  persist()
}

function startSave() {
  saving.value = true
  newName.value = ''
  nextTick(() => nameInput.value?.focus())
}

function confirmSave() {
  const name = newName.value.trim()
  if (!name) return

  const scenario: Scenario = {
    id: `custom-${Date.now()}`,
    name,
    machineState: sim.machineState,
    pos: { ...sim.pos },
    wco: { ...sim.wco },
    stock: { ...sim.stock, hole: { ...sim.stock.hole }, point: { ...sim.stock.point } },
  }

  sim.scenarios.push(scenario)
  saving.value = false
  activeId.value = scenario.id
  persist()
}

function stateClass(state: MachineState) {
  return (
    {
      Idle: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
      Run: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
      Hold: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
      Alarm: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
      Homing: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
      Door: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
    }[state] ?? 'bg-gray-100 text-gray-600'
  )
}
</script>
