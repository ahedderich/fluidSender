<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
  >
    <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
      Position
    </h2>

    <!-- Table: axis | Work | Machine | zero -->
    <div class="grid gap-x-1.5 gap-y-1 mb-2.5" style="grid-template-columns: 1rem 1fr 1fr auto">
      <!-- Column headers -->
      <div />
      <div class="text-center text-[10px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 mb-0.5">
        Work
      </div>
      <div class="text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-0.5">
        Machine
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
        <!-- Machine position -->
        <div
          class="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 font-mono text-sm text-right text-gray-700 dark:text-slate-300"
        >
          {{ s.pos[axis].toFixed(3) }}
        </div>
        <!-- Zero work axis button -->
        <button
          @click="zeroAxis(axis)"
          class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors font-medium whitespace-nowrap"
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

// Zero a single work axis: set WCO so that WPos = 0 on that axis
function zeroAxis(axis: 'x' | 'y' | 'z') {
  s.wco[axis] = s.pos[axis]
}

// Zero all work axes
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
