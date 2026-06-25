<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
      Position
    </h2>

    <!-- Headers: axis | Work | Machine | Max Travel | zero -->
    <div class="grid gap-x-2 gap-y-1 mb-3" style="grid-template-columns: 1.1rem 1fr 1fr 5.5rem auto">
      <div />
      <div class="text-center text-[10px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400">
        Work
      </div>
      <div class="text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
        Machine
      </div>
      <div class="text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
        Max Travel
      </div>
      <div />

      <!-- Axis rows -->
      <template v-for="axis in (['x', 'y', 'z'] as const)" :key="axis">
        <span class="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase self-center">
          {{ axis }}
        </span>

        <!-- Work position -->
        <div
          class="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded px-2 py-1 font-mono text-sm text-right text-blue-800 dark:text-blue-200"
        >
          {{ s.wpos[axis].toFixed(3) }}
        </div>

        <!-- Machine position + travel bar -->
        <div
          class="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 pt-1 pb-0.5 flex flex-col gap-0.5"
        >
          <span class="font-mono text-sm text-right text-gray-700 dark:text-slate-300 block">
            {{ s.pos[axis].toFixed(3) }}
          </span>
          <div class="h-1 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-150"
              :class="travelPercent(axis) > 90
                ? 'bg-red-400 dark:bg-red-500'
                : 'bg-emerald-400 dark:bg-emerald-500'"
              :style="`width: ${travelPercent(axis)}%`"
            />
          </div>
        </div>

        <!-- Max travel (editable) -->
        <div class="flex items-center gap-1">
          <input
            v-model.number="s.travel[axis]"
            type="number"
            min="1"
            step="1"
            class="w-10 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-mono text-xs text-right px-1.5 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span class="text-[10px] text-gray-400 dark:text-slate-500 shrink-0">mm</span>
        </div>

        <!-- Zero work axis -->
        <button
          @click="zeroAxis(axis)"
          class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors font-medium"
          title="Set work zero for this axis"
        >
          Z
        </button>
      </template>
    </div>

    <!-- Actions -->
    <div class="flex gap-1.5">
      <button
        @click="zeroAll"
        class="flex-1 text-xs py-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors font-medium"
      >
        Zero All
      </button>
      <button
        @click="goHome"
        class="flex-1 text-xs py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium"
      >
        Home
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'

const s = useSimStore()

// Percentage of travel used for this axis (0–100), clamped
function travelPercent(axis: 'x' | 'y' | 'z'): number {
  const max = s.travel[axis]
  if (!max) return 0
  // Z goes negative from home; X/Y go positive
  const used = axis === 'z' ? -s.pos.z : s.pos[axis]
  return Math.min(100, Math.max(0, (used / max) * 100))
}

function zeroAxis(axis: 'x' | 'y' | 'z') {
  s.wco[axis] = s.pos[axis]
}

function zeroAll() {
  s.wco.x = s.pos.x
  s.wco.y = s.pos.y
  s.wco.z = s.pos.z
}

function goHome() {
  s.machineState = 'Homing'
  setTimeout(() => {
    s.pos.x = 0
    s.pos.y = 0
    s.pos.z = 0
    s.machineState = 'Idle'
  }, 800)
}
</script>
