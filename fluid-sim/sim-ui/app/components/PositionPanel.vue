<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
  >
    <!-- Header with axis count selector -->
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Position
      </h2>
      <div class="flex items-center gap-1.5">
        <span class="text-[10px] text-gray-400 dark:text-slate-500">Axes</span>
        <div class="flex items-center gap-0.5 bg-gray-100 dark:bg-slate-900 rounded p-0.5">
          <button
            v-for="n in [3, 4, 5, 6]"
            :key="n"
            @click="s.axisCount = n"
            :class="s.axisCount === n
              ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 shadow-sm'
              : 'text-gray-400 dark:text-slate-500'"
            class="w-5 h-5 rounded text-[10px] font-bold transition-all flex items-center justify-center"
          >
            {{ n }}
          </button>
        </div>
      </div>
    </div>

    <!-- Column headers -->
    <div class="grid gap-x-2 mb-1" :style="gridCols">
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
    </div>

    <!-- Axis rows -->
    <div class="space-y-1 mb-3">
      <div
        v-for="axis in activeAxes"
        :key="axis"
        class="grid items-center gap-x-2"
        :style="gridCols"
      >
        <!-- Axis label -->
        <span class="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">
          {{ axis }}
        </span>

        <!-- Work position (editable — adjusts WCO) -->
        <input
          :value="s.wpos[axis].toFixed(3)"
          @change="setWpos(axis, +($event.target as HTMLInputElement).value)"
          type="number"
          step="0.001"
          class="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded px-2 py-1 font-mono text-sm text-right text-blue-800 dark:text-blue-200 w-full focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />

        <!-- Machine position (editable) + travel bar -->
        <div
          class="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-2 pt-1 pb-0.5 flex flex-col gap-0.5"
        >
          <input
            v-model.number="s.pos[axis]"
            type="number"
            step="0.001"
            class="w-full bg-transparent font-mono text-sm text-right text-gray-700 dark:text-slate-300 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
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
            class="w-20 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-mono text-xs text-right px-1.5 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span class="text-[10px] text-gray-400 dark:text-slate-500 w-4 shrink-0">
            {{ axis === 'a' || axis === 'b' || axis === 'c' ? '°' : 'mm' }}
          </span>
        </div>

        <!-- Zero work axis -->
        <button
          @click="zeroAxis(axis)"
          class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 rounded transition-colors font-medium whitespace-nowrap"
          :title="`Set ${axis.toUpperCase()} work zero`"
        >
          {{ axis.toUpperCase() }}=0
        </button>
      </div>
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
import { computed } from 'vue'
import { useSimStore, AXES } from '~/stores/sim'
import type { AxisKey } from '~/stores/sim'

const s = useSimStore()

const gridCols = 'grid-template-columns: 1.2rem 1fr 1fr 6rem auto'

const activeAxes = computed(() => AXES.slice(0, s.axisCount) as AxisKey[])

function travelPercent(axis: AxisKey): number {
  const max = s.travel[axis]
  if (!max) return 0
  // Z descends from home (negative); rotary axes and X/Y go positive
  const used = axis === 'z' ? -s.pos.z : Math.abs(s.pos[axis])
  return Math.min(100, Math.max(0, (used / max) * 100))
}

function setWpos(axis: AxisKey, value: number) {
  s.wco[axis] = s.pos[axis] - value
}

function zeroAxis(axis: AxisKey) {
  s.wco[axis] = s.pos[axis]
}

function zeroAll() {
  for (const a of AXES.slice(0, s.axisCount) as AxisKey[]) {
    s.wco[a] = s.pos[a]
  }
}

function goHome() {
  s.machineState = 'Homing'
  setTimeout(() => {
    for (const a of AXES) s.pos[a] = 0
    s.machineState = 'Idle'
  }, 800)
}
</script>
