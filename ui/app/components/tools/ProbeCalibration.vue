<template>
  <div class="p-4 space-y-4 max-w-2xl mx-auto">

    <!-- Tool header -->
    <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
      <div v-if="loadedTool" class="flex items-center gap-3">
        <span class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold text-sm shrink-0">
          T{{ loadedTool.number }}
        </span>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-gray-900 dark:text-slate-100 truncate">{{ loadedTool.name }}</p>
          <span class="inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">probe</span>
        </div>
        <div class="text-right text-xs text-gray-500 dark:text-slate-400 space-y-0.5 shrink-0 font-mono">
          <div v-for="(val, key) in compensationDisplay" :key="key">
            <span class="text-gray-400 dark:text-slate-500">{{ key }}:</span>
            <span class="ml-1 text-gray-700 dark:text-slate-300">{{ val }}</span>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-400 dark:text-slate-500 italic">No probe tool loaded</div>
    </div>

    <!-- Gate: probe tool required -->
    <div v-if="!isProbe" class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 text-sm text-amber-700 dark:text-amber-400">
      Load a probe tool (type = "probe") to use calibration.
    </div>

    <!-- Gate: stock required -->
    <div v-else-if="!stockDims" class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 text-sm text-amber-700 dark:text-amber-400">
      Define rectangular stock first — the calibration block dimensions are taken from the stock definition (Workspace → Probing → Stock tab).
    </div>

    <template v-else>
      <!-- Known dimensions (read-only from stock) -->
      <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Calibration Block Dimensions</p>
        <div class="flex items-center gap-6 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-gray-500 dark:text-slate-400 text-xs">Width X</span>
            <span class="font-mono font-semibold text-gray-900 dark:text-slate-100">{{ stockDims.width.toFixed(3) }} mm</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-gray-500 dark:text-slate-400 text-xs">Height Y</span>
            <span class="font-mono font-semibold text-gray-900 dark:text-slate-100">{{ stockDims.height.toFixed(3) }} mm</span>
          </div>
        </div>
        <p class="text-xs text-gray-400 dark:text-slate-500">From stock definition. Edit in Workspace → Probing → Stock.</p>
      </div>

      <!-- Wizard steps -->
      <div class="space-y-2">

        <!-- Step 1: Position at rough centre -->
        <div :class="stepCardClass(1)">
          <div class="flex items-center gap-3">
            <span :class="stepNumClass(1)">1</span>
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-slate-100">Position probe at block centre</p>
              <p class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Jog the probe to approximately the centre of the calibration block at safe height above the surface.</p>
            </div>
            <button v-if="activeStep === 1" @click="startCalibration"
              class="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors">
              Confirm
            </button>
          </div>
        </div>

        <!-- Step 2: XYZ center-out probe -->
        <div :class="stepCardClass(2)">
          <div class="flex items-start gap-3">
            <span :class="stepNumClass(2)">2</span>
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-slate-100">Run XYZ outside-in probe</p>
              <p class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Measures all four XY edges and the Z surface. WCS will be zeroed at the measured block centre afterwards.</p>

              <!-- Probe config inputs -->
              <div v-if="activeStep === 2 && ps.phase !== 'running'" class="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Safe height (mm)</label>
                  <input v-model.number="xyzSafeHeight" type="number" step="1" min="1"
                    class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Approach buffer (mm)</label>
                  <input v-model.number="xyzBuffer" type="number" step="1" min="1"
                    class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Probe height (mm)</label>
                  <input v-model.number="xyzProbeHeight" type="number" step="0.5"
                    class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <p class="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">Relative to Z zero</p>
                </div>
              </div>

              <div v-if="activeStep === 2" class="mt-3 flex items-center gap-3">
                <span v-if="ps.phase === 'running' && ps.wizardKey === 'center-out'" class="text-xs text-blue-600 dark:text-blue-400 animate-pulse">
                  {{ ps.currentStepLabel || 'Running…' }}
                </span>
                <template v-else-if="!xyzResults">
                  <button @click="runXyzProbe" :disabled="!machine.connected"
                    class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
                    Run Probe
                  </button>
                </template>
              </div>

              <div v-if="xyzResults" class="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <div class="flex justify-between"><span class="text-gray-500 dark:text-slate-400">Measured width</span><span class="font-mono">{{ xyzResults.measuredWidth.toFixed(3) }} mm</span></div>
                <div class="flex justify-between"><span class="text-gray-500 dark:text-slate-400">Measured height</span><span class="font-mono">{{ xyzResults.measuredHeight.toFixed(3) }} mm</span></div>
                <div class="flex justify-between"><span class="text-gray-500 dark:text-slate-400">sumX (dxp+dxm)</span>
                  <span :class="['font-mono', xyzResults.sumX >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-500 dark:text-amber-400']">{{ xyzResults.sumX.toFixed(3) }} mm</span></div>
                <div class="flex justify-between"><span class="text-gray-500 dark:text-slate-400">sumY (dyp+dym)</span>
                  <span :class="['font-mono', xyzResults.sumY >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-500 dark:text-amber-400']">{{ xyzResults.sumY.toFixed(3) }} mm</span></div>
              </div>

              <!-- Post-probe: moving to rotation start position -->
              <div v-if="movingToRotationStart" class="mt-3 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 animate-pulse">
                Moving to rotation probe start position…
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: Mark orientation -->
        <div :class="stepCardClass(3)">
          <div class="flex items-center gap-3">
            <span :class="stepNumClass(3)">3</span>
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-slate-100">Mark probe orientation</p>
              <p class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                The probe has been moved to the +X side of the block.
                Mark one side of the probe body (tape or cable exit). Rotate the probe so the mark points
                in the <strong class="text-gray-700 dark:text-slate-300">+X direction</strong> (machine right). Confirm when ready.
              </p>
            </div>
            <button v-if="activeStep === 3" @click="markComplete(3)"
              class="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors">
              Confirm
            </button>
          </div>
        </div>

        <!-- Step 4: 4-rotation X+ face probes -->
        <div :class="stepCardClass(4)">
          <div class="flex items-start gap-3">
            <span :class="stepNumClass(4)">4</span>
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-slate-100">4-rotation X+ face probe</p>
              <p class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Probe the +X face approaching in −X at 0°, 90°, 180°, 270° to cancel eccentricity (runout).</p>
              <template v-if="activeStep === 4 || completedSteps.has(4)">
                <div class="mt-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-300">
                  <strong>Before each probe:</strong> the probe is already at the +X outside of the block at probing height.
                  {{ rotationReadings.length > 0 ? 'After each reading, jog back to X >' + (xyzResults ? (knownWidth / 2 + xyzBuffer + 5).toFixed(0) : '30') + ' mm, then rotate the probe 90° clockwise.' : '' }}
                </div>
                <div class="mt-3 space-y-1.5">
                  <div v-for="(r, i) in rotationReadings" :key="i" class="flex items-center gap-2 text-xs">
                    <span class="w-14 text-gray-500 dark:text-slate-400">{{ i * 90 }}°</span>
                    <span class="font-mono text-emerald-600 dark:text-emerald-400">{{ r.toFixed(4) }} mm</span>
                  </div>
                  <div v-if="rotationReadings.length < 4" class="flex items-center gap-3 mt-2">
                    <span v-if="ps.phase === 'running' && ps.wizardKey === 'edge'" class="text-xs text-blue-600 dark:text-blue-400 animate-pulse">Probing…</span>
                    <button v-else @click="runOneRotationProbe" :disabled="!machine.connected"
                      class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
                      {{ rotationReadings.length === 0 ? 'Probe Rotation 0°' : `Probe Rotation ${rotationReadings.length * 90}°` }}
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Step 5: Computed XY deviations -->
        <div :class="stepCardClass(5)">
          <div class="flex items-start gap-3">
            <span :class="stepNumClass(5)">5</span>
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-slate-100">Computed XY deviations</p>
              <div v-if="computedXY" class="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <div class="flex justify-between"><span class="text-gray-500 dark:text-slate-400">xPlus</span><span class="font-mono text-blue-600 dark:text-blue-400">{{ computedXY.xPlus.toFixed(4) }} mm</span></div>
                <div class="flex justify-between"><span class="text-gray-500 dark:text-slate-400">xMinus</span><span class="font-mono text-blue-600 dark:text-blue-400">{{ computedXY.xMinus.toFixed(4) }} mm</span></div>
                <div class="flex justify-between"><span class="text-gray-500 dark:text-slate-400">yPlus</span><span class="font-mono text-blue-600 dark:text-blue-400">{{ computedXY.yPlus.toFixed(4) }} mm</span></div>
                <div class="flex justify-between"><span class="text-gray-500 dark:text-slate-400">yMinus</span><span class="font-mono text-blue-600 dark:text-blue-400">{{ computedXY.yMinus.toFixed(4) }} mm</span></div>
              </div>
              <p v-if="computedXY" class="text-xs text-gray-400 dark:text-slate-500 mt-2">Y deviations split evenly (symmetric). xMinus from rotation probes; xPlus = sumX − xMinus.</p>
            </div>
          </div>
        </div>

        <!-- Step 6: Z calibration -->
        <div :class="stepCardClass(6)">
          <div class="flex items-start gap-3">
            <span :class="stepNumClass(6)">Z</span>
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-slate-100">Z calibration (paper method)</p>
              <div class="mt-2 text-xs text-gray-500 dark:text-slate-400 space-y-0.5">
                <p>1. Run an XYZ probe to set Z=0 at the calibration block surface.</p>
                <p>2. Load a known cutting tool via the toolsetter.</p>
                <p>3. Return the spindle to X0 Y0 above the block centre.</p>
                <p>4. Lower until a sheet of paper just resists sliding under the cutter.</p>
                <p>5. Enter the WCS Z reading and paper thickness below.</p>
              </div>
              <div v-if="activeStep === 6" class="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">WCS Z reading (mm)</label>
                  <input v-model.number="wcsZ" type="number" step="0.001"
                    class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Paper thickness (mm)</label>
                  <input v-model.number="paperThickness" type="number" step="0.001" min="0.01"
                    class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>
              <div v-if="activeStep === 6" class="mt-2 flex items-center gap-2 text-xs">
                <span class="text-gray-500 dark:text-slate-400">Computed zMinus:</span>
                <span class="font-mono font-semibold text-blue-600 dark:text-blue-400">{{ computedZMinus.toFixed(4) }} mm</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Abort (visible while a calibration session is active) -->
      <button v-if="syncStore.calibrationActive" @click="abortProbing"
        class="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition-colors">
        Abort Probing
      </button>

      <!-- Save -->
      <button @click="saveCalibration" :disabled="!canSave"
        class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors">
        Save Probe Calibration to T{{ loadedTool?.number }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useMachineStore } from '~/stores/machine'
import { useSyncStore } from '~/stores/sync'
import { useSettingsStore } from '~/stores/settings'
import { useToast } from '~/composables/useToast'
import { wsSend } from '~/composables/useWsSend'
import type { ProbeCompensation } from '~~/server/utils/tool/types'
import { DEFAULT_PROBE_COMPENSATION } from '~~/server/utils/tool/types'

const machine = useMachineStore()
const syncStore = useSyncStore()
const settings = useSettingsStore()
const toast = useToast()
const ps = syncStore.probingState

// ── Loaded probe tool ─────────────────────────────────────────────────────────

const loadedTool = computed(() => {
  const n = machine.loadedToolNumber
  if (n === null) return null
  return [...(machine.toolLibrary?.machine ?? []), ...(machine.toolLibrary?.app ?? [])]
    .find(t => t.number === n) ?? null
})

const isProbe = computed(() =>
  loadedTool.value?.type.toLowerCase().trim() === 'probe'
)

const compensationDisplay = computed(() => {
  const c: ProbeCompensation = loadedTool.value?.probeCompensation ?? DEFAULT_PROBE_COMPENSATION
  return {
    xPlus: c.xPlus.toFixed(3),
    xMinus: c.xMinus.toFixed(3),
    yPlus: c.yPlus.toFixed(3),
    yMinus: c.yMinus.toFixed(3),
    zMinus: c.zMinus.toFixed(3),
  }
})

// ── Block dimensions from stock ───────────────────────────────────────────────

const stockDims = computed(() => {
  const s = machine.stock
  if (!s || s.shape !== 'rect' || !s.width || !s.height) return null
  return { width: s.width, height: s.height }
})

const knownWidth = computed(() => stockDims.value?.width ?? 50)
const knownHeight = computed(() => stockDims.value?.height ?? 50)

// ── Wizard state ──────────────────────────────────────────────────────────────

const activeStep = ref(1)
const completedSteps = ref<Set<number>>(new Set())

// XYZ probe config — user-editable, stored so post-probe movement uses same height
const xyzSafeHeight = ref(20)
const xyzBuffer = ref(10)
const xyzProbeHeight = ref(-3)

const movingToRotationStart = ref(false)

const xyzResults = ref<{
  measuredWidth: number
  measuredHeight: number
  sumX: number
  sumY: number
} | null>(null)

const rotationReadings = ref<number[]>([])
const wcsZ = ref(0)
const paperThickness = ref(0.1)

// ── Calibration session lifecycle ─────────────────────────────────────────────

function startCalibration() {
  wsSend({ t: 'calibration:start', payload: {} })
  markComplete(1)
}

function endCalibration() {
  wsSend({ t: 'calibration:end', payload: {} })
}

function abortProbing() {
  wsSend({ t: 'probing:abort', payload: {} })
}

onUnmounted(() => {
  // Clean up the calibration lock if the user navigates away mid-session
  if (syncStore.calibrationActive) endCalibration()
})

// ── Derived values ────────────────────────────────────────────────────────────

const computedZMinus = computed(() => wcsZ.value + paperThickness.value)

const computedXY = computed(() => {
  if (!xyzResults.value || rotationReadings.value.length < 4) return null
  const { sumX, sumY } = xyzResults.value
  const rawAvg = rotationReadings.value.reduce((s, v) => s + v, 0) / 4
  const dxm = rawAvg - knownWidth.value / 2
  const dxp = sumX - dxm
  return { xPlus: dxp, xMinus: dxm, yPlus: sumY / 2, yMinus: sumY / 2 }
})

const canSave = computed(() => isProbe.value && computedXY.value !== null)

// ── Step utilities ────────────────────────────────────────────────────────────

function stepCardClass(step: number): string {
  const base = 'rounded-lg border p-4 transition-colors'
  if (completedSteps.value.has(step)) {
    return `${base} bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-700/40`
  }
  if (activeStep.value === step) {
    return `${base} bg-white dark:bg-slate-800 border-blue-300 dark:border-blue-600 shadow-sm`
  }
  return `${base} bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 opacity-60`
}

function stepNumClass(step: number): string {
  const base = 'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 mt-0.5'
  if (completedSteps.value.has(step)) {
    return `${base} bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300`
  }
  if (activeStep.value === step) {
    return `${base} bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300`
  }
  return `${base} bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500`
}

function markComplete(step: number) {
  completedSteps.value.add(step)
  activeStep.value = step + 1
}

// ── Probe config + zero compensation ─────────────────────────────────────────

const probeConfig = computed(() => loadedTool.value?.probeConfig ?? {
  wiggleEnabled: true,
  fastFeedMmPerMin: 500,
  slowFeedMmPerMin: 5,
  cycles: 3,
  averageN: 2,
})

const ZERO_COMP: ProbeCompensation = { ...DEFAULT_PROBE_COMPENSATION }

// ── Step 2: XYZ centre-out probe ──────────────────────────────────────────────

function runXyzProbe() {
  wsSend({
    t: 'probing:start',
    payload: {
      wizardKey: 'center-out',
      config: {
        safeHeightMm: xyzSafeHeight.value,
        buffer: xyzBuffer.value,
        probeHeightMm: xyzProbeHeight.value,
        skipX: false,
        skipY: false,
        skipZ: false,
      },
      probeConfig: probeConfig.value,
      compensation: ZERO_COMP,
    },
  })
}

watch(() => ps.phase, (phase) => {
  if (phase !== 'completed' || ps.wizardKey !== 'center-out' || activeStep.value !== 2) return

  const steps = ps.stepResults
  const leftStep   = steps.find(s => s.axis === 'X' && s.direction === '-')
  const rightStep  = steps.find(s => s.axis === 'X' && s.direction === '+')
  const bottomStep = steps.find(s => s.axis === 'Y' && s.direction === '-')
  const topStep    = steps.find(s => s.axis === 'Y' && s.direction === '+')

  if (!leftStep || !rightStep || !bottomStep || !topStep) return

  const measuredWidth  = Math.abs(rightStep.edgeWpos - leftStep.edgeWpos)
  const measuredHeight = Math.abs(topStep.edgeWpos  - bottomStep.edgeWpos)

  xyzResults.value = {
    measuredWidth,
    measuredHeight,
    sumX: measuredWidth  - knownWidth.value,
    sumY: measuredHeight - knownHeight.value,
  }
  markComplete(2)

  // Move to the +X rotation start position: outside the block's +X face at the configured probe height.
  // WCS was zeroed at block centre by the center-out probe, so X+ face is at knownWidth/2.
  const targetX = (knownWidth.value / 2 + xyzBuffer.value + 5).toFixed(3)
  const targetZ = xyzProbeHeight.value.toFixed(3)
  movingToRotationStart.value = true
  wsSend({
    t: 'machine:command',
    payload: { cmd: `G0 X${targetX} Z${targetZ} F3000` },
  })
  // Allow a brief moment for the move to register before clearing the indicator
  setTimeout(() => { movingToRotationStart.value = false }, 3000)
})

// ── Step 4: 4-rotation X+ face probes ────────────────────────────────────────

function runOneRotationProbe() {
  wsSend({
    t: 'probing:edge',
    payload: {
      axis: 'X',
      direction: '-',
      probeConfig: probeConfig.value,
      compensation: ZERO_COMP,
      buffer: xyzBuffer.value + 5,
      noZero: true,
    },
  })
}

watch(() => ps.phase, (phase) => {
  if (phase !== 'completed' || ps.wizardKey !== 'edge' || activeStep.value !== 4) return
  const result = ps.stepResults[0]
  if (!result) return
  rotationReadings.value = [...rotationReadings.value, result.edgeWpos]
  if (rotationReadings.value.length >= 4) {
    markComplete(4)
    markComplete(5)
  }
})

// ── Save ──────────────────────────────────────────────────────────────────────

function saveCalibration() {
  if (!canSave.value || !loadedTool.value || !computedXY.value) return
  const comp: ProbeCompensation = { ...computedXY.value, zMinus: computedZMinus.value }
  const tool = loadedTool.value
  wsSend({
    t: 'tool:upsert',
    payload: { ...tool, probeCompensation: comp, machineId: settings.activeMachineId },
  })
  toast.success(`Probe calibration saved to T${tool.number} — ${tool.name}.`)
  if (activeStep.value === 6) markComplete(6)
  endCalibration()
}
</script>
