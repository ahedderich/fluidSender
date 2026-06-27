<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 shrink-0"
  >
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Position
      </h2>
      <div class="flex gap-1">
        <button
          @click="zeroAll"
          class="px-2.5 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded text-xs font-medium transition-colors"
        >
          Zero All
        </button>
        <button
          @click="machine.sendCommand('$H')"
          class="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
        >
          Home
        </button>
      </div>
    </div>

    <!-- Column headers -->
    <div class="grid gap-1 mb-1" style="grid-template-columns: 1.25rem 1fr 1fr 3rem">
      <div />
      <div class="text-center text-xs text-gray-400 dark:text-slate-500 font-medium">Work</div>
      <div class="text-center text-xs text-gray-400 dark:text-slate-500 font-medium">Machine</div>
      <div />
    </div>

    <!-- Axis rows -->
    <div class="space-y-1">
      <div
        v-for="axis in axes"
        :key="axis"
        class="grid items-center gap-1"
        style="grid-template-columns: 1.25rem 1fr 1fr 3rem"
      >
        <span class="text-sm font-bold text-gray-500 dark:text-slate-400 leading-none">{{ axis }}</span>

        <!-- Work position (editable) -->
        <div @click="startEdit(axis)">
          <input
            v-if="editingAxis === axis"
            :ref="(el) => editInputs[axis] = el as HTMLInputElement"
            v-model="editValues[axis]"
            @keydown.enter="applyEdit(axis)"
            @keydown.escape="cancelEdit"
            @blur="cancelEdit"
            type="number"
            step="0.001"
            class="w-full bg-blue-50 dark:bg-blue-900/40 border border-blue-500 text-blue-800 dark:text-blue-200 font-mono text-right px-1.5 py-1 rounded text-sm focus:outline-none tabular-nums"
          />
          <div
            v-else
            class="bg-gray-50 dark:bg-slate-900 rounded px-1.5 py-1 font-mono text-right text-sm text-gray-900 dark:text-slate-100 tabular-nums hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors cursor-text"
          >
            {{ machine.connected ? formatPos(workPos[axis.toLowerCase() as 'x' | 'y' | 'z']) : 'null' }}
          </div>
        </div>

        <!-- Machine position (read-only) -->
        <div
          class="bg-gray-50 dark:bg-slate-900/60 rounded px-1.5 py-1 font-mono text-right text-sm text-gray-500 dark:text-slate-400 tabular-nums"
        >
          {{ machine.connected ? formatPos(machinePos[axis.toLowerCase() as 'x' | 'y' | 'z']) : 'null' }}
        </div>

        <!-- Zero axis button -->
        <button
          @click="zeroAxis(axis)"
          class="py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded text-xs font-medium transition-colors text-center"
        >
          {{ axis }}=0
        </button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useConfirm } from '~/composables/useConfirm'

const machine = useMachineStore()
const { confirm } = useConfirm()
const editingAxis = ref<string | null>(null)
const editValues = reactive<Record<string, string>>({ X: '', Y: '', Z: '' })
const editInputs = reactive<Record<string, HTMLInputElement | null>>({ X: null, Y: null, Z: null })

const axes = ['X', 'Y', 'Z']
const workPos = computed(() => machine.workPos)
const machinePos = computed(() => machine.machinePos)

function formatPos(v: number | undefined) {
  if (v === undefined) return '  ---'
  const s = v.toFixed(3)
  return v >= 0 ? ' ' + s : s
}

async function startEdit(axis: string) {
  const val = workPos.value[axis.toLowerCase() as 'x' | 'y' | 'z']
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

async function zeroAll() {
  const ok = await confirm({
    title: 'Zero all axes?',
    message: 'Sets X, Y, and Z work coordinates to 0 at the current position.',
    confirmLabel: 'Zero All',
  })
  if (!ok) return
  machine.workPos.x = 0
  machine.workPos.y = 0
  machine.workPos.z = 0
  machine.sendCommand('G10 L20 P1 X0 Y0 Z0')
}
</script>
