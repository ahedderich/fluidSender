<template>
  <div
    class="bg-slate-800 dark:bg-slate-800 bg-white rounded-lg border border-slate-700 dark:border-slate-700 border-gray-200 p-3 shrink-0"
  >
    <div class="flex items-center justify-between mb-2.5">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-400 text-gray-500">
        Position
      </h2>
      <div class="flex items-center gap-0.5 bg-slate-900 dark:bg-slate-900 bg-gray-100 rounded-md p-0.5">
        <button
          @click="coordMode = 'work'"
          :class="coordMode === 'work' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 dark:text-slate-400 text-gray-500 hover:text-slate-200 dark:hover:text-slate-200 hover:text-gray-700'"
          class="px-2.5 py-1 rounded text-xs font-medium transition-all"
        >
          Work
        </button>
        <button
          @click="coordMode = 'machine'"
          :class="coordMode === 'machine' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 dark:text-slate-400 text-gray-500 hover:text-slate-200 dark:hover:text-slate-200 hover:text-gray-700'"
          class="px-2.5 py-1 rounded text-xs font-medium transition-all"
        >
          Machine
        </button>
      </div>
    </div>

    <div class="space-y-1.5">
      <div v-for="axis in axes" :key="axis" class="flex items-center gap-2">
        <span class="text-sm font-bold text-slate-400 dark:text-slate-400 text-gray-500 w-4 shrink-0">{{ axis }}</span>

        <div
          class="flex-1 relative cursor-text"
          @click="coordMode === 'work' && startEdit(axis)"
        >
          <input
            v-if="editingAxis === axis"
            :ref="(el) => editInputs[axis] = el as HTMLInputElement"
            v-model="editValues[axis]"
            @keydown.enter="applyEdit(axis)"
            @keydown.escape="cancelEdit"
            @blur="cancelEdit"
            type="number"
            step="0.001"
            class="w-full bg-blue-900/40 dark:bg-blue-900/40 bg-blue-50 border border-blue-500 text-blue-200 dark:text-blue-200 text-blue-800 font-mono text-right pr-2 py-1.5 rounded-md text-base focus:outline-none tabular-nums"
          />
          <div
            v-else
            :class="coordMode === 'work' ? 'cursor-text hover:bg-slate-700/40 dark:hover:bg-slate-700/40 hover:bg-gray-50' : 'cursor-default'"
            class="bg-slate-900 dark:bg-slate-900 bg-gray-50 rounded-md px-3 py-1.5 font-mono text-right text-base text-slate-100 dark:text-slate-100 text-gray-900 tabular-nums transition-colors"
          >
            {{ formatPos(currentPos[axis.toLowerCase() as 'x' | 'y' | 'z']) }}
          </div>
        </div>

        <span class="text-xs text-slate-500 dark:text-slate-500 text-gray-400 w-5 shrink-0">mm</span>

        <button
          v-if="coordMode === 'work'"
          @click="zeroAxis(axis)"
          class="px-2 py-1.5 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-300 dark:text-slate-300 text-gray-700 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
        >
          Z={{ axis }}
        </button>
        <div v-else class="w-10 shrink-0" />
      </div>
    </div>

    <div v-if="coordMode === 'work'" class="mt-2.5 flex gap-2">
      <button
        @click="zeroAll"
        class="flex-1 py-2 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-200 dark:text-slate-200 text-gray-700 rounded-md text-sm font-medium transition-colors"
      >
        Zero All
      </button>
      <button
        @click="machine.sendCommand('G0 G54 X0 Y0')"
        class="flex-1 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-md text-sm font-medium transition-colors"
      >
        Go to XY Zero
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'

const machine = useMachineStore()
const coordMode = ref<'work' | 'machine'>('work')
const editingAxis = ref<string | null>(null)
const editValues = reactive<Record<string, string>>({ X: '', Y: '', Z: '' })
const editInputs = reactive<Record<string, HTMLInputElement | null>>({ X: null, Y: null, Z: null })

const axes = ['X', 'Y', 'Z']

const currentPos = computed(() => (coordMode.value === 'work' ? machine.workPos : machine.machinePos))

function formatPos(v: number | undefined) {
  if (v === undefined) return '  ---'
  const s = v.toFixed(3)
  return v >= 0 ? ' ' + s : s
}

async function startEdit(axis: string) {
  const val = currentPos.value[axis.toLowerCase() as 'x' | 'y' | 'z']
  editValues[axis] = val !== undefined ? val.toFixed(3) : '0.000'
  editingAxis.value = axis
  await nextTick()
  editInputs[axis]?.select()
}

function applyEdit(axis: string) {
  const num = parseFloat(editValues[axis])
  if (!isNaN(num)) {
    if (axis === 'X') machine.workPos.x = num
    else if (axis === 'Y') machine.workPos.y = num
    else if (axis === 'Z') machine.workPos.z = num
    machine.sendCommand(`G10 L20 P1 ${axis}${num.toFixed(3)}`)
  }
  editingAxis.value = null
}

function cancelEdit() {
  editingAxis.value = null
}

function zeroAxis(axis: string) {
  if (axis === 'X') machine.workPos.x = 0
  else if (axis === 'Y') machine.workPos.y = 0
  else if (axis === 'Z') machine.workPos.z = 0
  machine.sendCommand(`G10 L20 P1 ${axis}0`)
}

function zeroAll() {
  machine.workPos.x = 0
  machine.workPos.y = 0
  machine.workPos.z = 0
  machine.sendCommand('G10 L20 P1 X0 Y0 Z0')
}
</script>
