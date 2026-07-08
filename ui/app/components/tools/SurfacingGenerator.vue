<template>
  <div class="p-6 max-w-2xl mx-auto space-y-5">

    <!-- Warning: no stock -->
    <div
      v-if="!machine.stock"
      class="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg"
    >
      <svg class="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-sm text-amber-700 dark:text-amber-300">No stock defined. Set stock dimensions in the workspace probing panel.</p>
    </div>

    <!-- Warning: no tool loaded -->
    <div
      v-if="!loadedTool"
      class="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg"
    >
      <svg class="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-sm text-amber-700 dark:text-amber-300">No tool loaded. Load a tool in the tool management panel.</p>
    </div>

    <!-- Info header -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <!-- Width (rect only) -->
      <div v-if="machine.stock?.shape !== 'round'" class="bg-gray-50 dark:bg-slate-800/60 rounded-lg p-3">
        <p class="text-xs text-gray-500 dark:text-slate-400 mb-1">Width</p>
        <p class="text-sm font-mono text-gray-900 dark:text-slate-100 flex flex-wrap items-center gap-1">
          {{ fmt3(effectiveWidth) }} mm
          <span v-if="machine.stock?.measuredWidth != null" class="text-xs text-emerald-600 dark:text-emerald-400 font-sans">measured</span>
        </p>
      </div>

      <!-- Height or Diameter -->
      <div class="bg-gray-50 dark:bg-slate-800/60 rounded-lg p-3">
        <p class="text-xs text-gray-500 dark:text-slate-400 mb-1">{{ machine.stock?.shape === 'round' ? 'Diameter' : 'Height' }}</p>
        <p class="text-sm font-mono text-gray-900 dark:text-slate-100 flex flex-wrap items-center gap-1">
          {{ fmt3(effectiveSecondDim) }} mm
          <span
            v-if="machine.stock?.shape === 'round' ? machine.stock?.measuredDiameter != null : machine.stock?.measuredHeight != null"
            class="text-xs text-emerald-600 dark:text-emerald-400 font-sans"
          >measured</span>
        </p>
      </div>

      <!-- Tool diameter -->
      <div class="bg-gray-50 dark:bg-slate-800/60 rounded-lg p-3">
        <p class="text-xs text-gray-500 dark:text-slate-400 mb-1">Tool Diameter</p>
        <p class="text-sm font-mono text-gray-900 dark:text-slate-100">{{ fmt3(toolDiameter) }} mm</p>
      </div>

      <!-- Stepover (read-only display) -->
      <div class="bg-gray-50 dark:bg-slate-800/60 rounded-lg p-3">
        <p class="text-xs text-gray-500 dark:text-slate-400 mb-1">Stepover</p>
        <p class="text-sm font-mono text-gray-900 dark:text-slate-100">{{ stepover > 0 ? stepover.toFixed(3) : '—' }} mm</p>
      </div>
    </div>

    <!-- Form fields -->
    <div class="space-y-4">

      <!-- Row: stepover + depth of cut -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Stepover (mm)</label>
          <input
            v-model.number="stepover"
            type="number"
            min="0.01"
            step="0.1"
            class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Depth of Cut (mm)</label>
          <input
            v-model.number="depthOfCut"
            type="number"
            min="0.001"
            step="0.05"
            class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <!-- Row: feedrate + spindle speed -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Feedrate (mm/min) <span class="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            step="100"
            placeholder="Required"
            :value="feedrate ?? ''"
            @input="onFeedrateInput"
            class="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            :class="feedrate === null
              ? 'border-amber-300 dark:border-amber-600 placeholder-gray-400 dark:placeholder-slate-500 text-gray-900 dark:text-slate-100'
              : 'border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-100'"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Spindle Speed (RPM) <span class="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            step="100"
            placeholder="Required"
            :value="spindleSpeed ?? ''"
            @input="onSpindleInput"
            class="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            :class="spindleSpeed === null
              ? 'border-amber-300 dark:border-amber-600 placeholder-gray-400 dark:placeholder-slate-500 text-gray-900 dark:text-slate-100'
              : 'border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-100'"
          />
        </div>
      </div>

      <!-- Coolant -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Coolant</label>
        <div class="flex gap-2">
          <button
            v-for="opt in coolantOptions"
            :key="opt.value"
            @click="coolant = opt.value"
            class="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
            :class="coolant === opt.value
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-500'"
          >{{ opt.label }}</button>
        </div>
      </div>

      <!-- Pattern selector -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Toolpath Pattern</label>
        <div class="grid grid-cols-2 gap-3">
          <!-- Linear -->
          <button
            @click="pattern = 'linear'"
            class="flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors"
            :class="pattern === 'linear'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'"
          >
            <svg class="w-8 h-8" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="4" y="4" width="24" height="24" rx="1" stroke-opacity="0.4" />
              <line x1="4" y1="9" x2="28" y2="9" />
              <line x1="28" y1="14" x2="4" y2="14" />
              <line x1="4" y1="19" x2="28" y2="19" />
              <line x1="28" y1="24" x2="4" y2="24" />
            </svg>
            <span class="text-sm font-medium">Linear Passes</span>
          </button>

          <!-- Spiral -->
          <button
            @click="pattern = 'spiral'"
            class="flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors"
            :class="pattern === 'spiral'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'"
          >
            <svg class="w-8 h-8" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="4" y="4" width="24" height="24" rx="1" stroke-opacity="0.4" />
              <rect x="7" y="7" width="18" height="18" />
              <rect x="10" y="10" width="12" height="12" />
              <rect x="13" y="13" width="6" height="6" />
            </svg>
            <span class="text-sm font-medium">Spiral</span>
          </button>
        </div>
      </div>

      <!-- Rotation (linear + rect only) -->
      <div v-if="pattern === 'linear' && machine.stock?.shape !== 'round'">
        <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Pass Rotation (deg)</label>
        <input
          v-model.number="linearRotation"
          type="number"
          step="5"
          class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-xs"
        />
      </div>

    </div>

    <!-- SVG Preview -->
    <div class="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden bg-gray-50 dark:bg-slate-900/50">
      <div class="px-3 py-1.5 border-b border-gray-100 dark:border-slate-700 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
        Preview
      </div>
      <div class="flex items-center justify-center p-4">
        <svg :width="SVG_W" :height="SVG_H" class="overflow-visible">

          <!-- Stock outline: rect -->
          <rect
            v-if="preview.shape === 'rect'"
            :x="preview.stockX"
            :y="preview.stockY"
            :width="preview.stockW"
            :height="preview.stockH"
            fill="none"
            stroke="#9ca3af"
            stroke-width="1.5"
          />

          <!-- Stock outline: round -->
          <circle
            v-else-if="preview.shape === 'round'"
            :cx="SVG_W / 2"
            :cy="SVG_H / 2"
            :r="preview.stockR"
            fill="none"
            stroke="#9ca3af"
            stroke-width="1.5"
          />

          <!-- Toolpath lines (linear passes or spiral rect lines) -->
          <line
            v-for="(ln, i) in preview.lines"
            :key="i"
            :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2"
            stroke="#3b82f6"
            stroke-width="1"
            stroke-opacity="0.75"
          />

          <!-- Spiral round: polyline -->
          <polyline
            v-if="preview.spiralPoints && preview.spiralPoints.length > 1"
            :points="preview.spiralPoints.map(p => `${p.x},${p.y}`).join(' ')"
            fill="none"
            stroke="#3b82f6"
            stroke-width="1"
            stroke-opacity="0.75"
          />

          <!-- Direction arrow on first pass -->
          <polygon
            v-if="preview.arrow"
            :points="preview.arrow"
            fill="#3b82f6"
          />

          <!-- Placeholder text when no data -->
          <text
            v-if="!machine.stock"
            :x="SVG_W / 2"
            :y="SVG_H / 2"
            text-anchor="middle"
            dominant-baseline="middle"
            fill="#9ca3af"
            font-size="12"
          >Define stock to see preview</text>
          <text
            v-else-if="!loadedTool"
            :x="SVG_W / 2"
            :y="SVG_H / 2"
            text-anchor="middle"
            dominant-baseline="middle"
            fill="#9ca3af"
            font-size="12"
          >Load a tool to see preview</text>

        </svg>
      </div>
    </div>

    <!-- Generate button -->
    <div class="flex justify-end">
      <button
        @click="generateAndLoad"
        :disabled="!canGenerate"
        class="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        :class="canGenerate
          ? 'bg-blue-600 hover:bg-blue-500 text-white'
          : 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'"
      >
        <span
          v-if="generating"
          class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
        />
        {{ generating ? 'Generating…' : 'Generate Surfacing File' }}
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useCurrentUser } from '~/composables/useCurrentUser'
import { useJobControl } from '~/composables/useJobControl'
import { useToast } from '~/composables/useToast'
import type { SurfacingParams } from '~/utils/surfacingGenerator'

const machine = useMachineStore()
const currentUser = useCurrentUser()
const { loadJob } = useJobControl()
const { error: toastError } = useToast()
const router = useRouter()

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt3(v: number | null): string {
  return v === null ? '—' : v.toFixed(3)
}

// ── Derived stock dimensions ──────────────────────────────────────────────────

const effectiveWidth = computed<number | null>(() =>
  machine.stock?.measuredWidth ?? machine.stock?.width ?? null
)
const effectiveSecondDim = computed<number | null>(() =>
  machine.stock?.shape === 'round'
    ? (machine.stock?.measuredDiameter ?? machine.stock?.diameter ?? null)
    : (machine.stock?.measuredHeight ?? machine.stock?.height ?? null)
)
// ── Loaded tool ───────────────────────────────────────────────────────────────

const loadedTool = computed(() => {
  const n = machine.loadedToolNumber
  if (n === null) return null
  return [...machine.toolLibrary.machine, ...machine.toolLibrary.app].find(t => t.number === n) ?? null
})

const toolDiameter = computed<number | null>(() => loadedTool.value?.diameter ?? null)

// ── Form state ────────────────────────────────────────────────────────────────

const stepover = ref<number>(toolDiameter.value !== null ? parseFloat((toolDiameter.value * 0.4).toFixed(3)) : 1.0)
const depthOfCut = ref<number>(0.1)
const feedrate = ref<number | null>(null)
const spindleSpeed = ref<number | null>(null)
const coolant = ref<'off' | 'mist' | 'flood'>('off')
const pattern = ref<'linear' | 'spiral'>('linear')
const linearRotation = ref<number>(0)
const generating = ref(false)

watch(toolDiameter, (d) => {
  if (d !== null) stepover.value = parseFloat((d * 0.4).toFixed(3))
})

const coolantOptions = [
  { value: 'off' as const, label: 'Off' },
  { value: 'mist' as const, label: 'Mist' },
  { value: 'flood' as const, label: 'Flood' },
]

function onFeedrateInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  feedrate.value = isNaN(v) || v <= 0 ? null : v
}

function onSpindleInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  spindleSpeed.value = isNaN(v) || v <= 0 ? null : v
}

// ── Generate gate ─────────────────────────────────────────────────────────────

const canGenerate = computed(() =>
  machine.stock !== null &&
  toolDiameter.value !== null &&
  feedrate.value !== null &&
  spindleSpeed.value !== null &&
  stepover.value > 0 &&
  depthOfCut.value > 0 &&
  !generating.value &&
  !currentUser.value.isViewer
)

// ── SVG preview ───────────────────────────────────────────────────────────────

const SVG_W = 200
const SVG_H = 160
const PADDING = 16

function toSvg(x: number, y: number, scale: number) {
  return { x: SVG_W / 2 + x * scale, y: SVG_H / 2 - y * scale }
}

function arrowPolygon(x1: number, y1: number, x2: number, y2: number): string | null {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return null
  const ux = dx / len, uy = dy / len
  const AL = 7, AW = 3.5
  const tx = x1 + ux * AL, ty = y1 + uy * AL
  return [
    `${tx.toFixed(1)},${ty.toFixed(1)}`,
    `${(x1 - uy * AW).toFixed(1)},${(y1 + ux * AW).toFixed(1)}`,
    `${(x1 + uy * AW).toFixed(1)},${(y1 - ux * AW).toFixed(1)}`,
  ].join(' ')
}

interface PreviewData {
  shape: 'rect' | 'round' | null
  stockX: number
  stockY: number
  stockW: number
  stockH: number
  stockR: number
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>
  spiralPoints: Array<{ x: number; y: number }> | null
  arrow: string | null
}

const preview = computed<PreviewData>(() => {
  const empty: PreviewData = { shape: null, stockX: 0, stockY: 0, stockW: 0, stockH: 0, stockR: 0, lines: [], spiralPoints: null, arrow: null }

  const stock = machine.stock
  if (!stock) return empty

  const W = stock.shape === 'rect'
    ? (stock.measuredWidth ?? stock.width ?? 100)
    : (stock.measuredDiameter ?? stock.diameter ?? 50)
  const H = stock.shape === 'rect'
    ? (stock.measuredHeight ?? stock.height ?? 60)
    : W

  const availW = SVG_W - 2 * PADDING
  const availH = SVG_H - 2 * PADDING
  const scale = Math.min(availW / W, availH / H)

  const result: PreviewData = {
    shape: stock.shape,
    stockX: SVG_W / 2 - (W / 2) * scale,
    stockY: SVG_H / 2 - (H / 2) * scale,
    stockW: W * scale,
    stockH: H * scale,
    stockR: (W / 2) * scale,
    lines: [],
    spiralPoints: null,
    arrow: null,
  }

  const tool = loadedTool.value
  if (!tool || stepover.value <= 0) return result

  const so = Math.max(0.01, stepover.value)

  if (pattern.value === 'linear') {
    const params: SurfacingParams = {
      shape: stock.shape,
      width: stock.shape === 'rect' ? (stock.measuredWidth ?? stock.width ?? 100) : 0,
      height: stock.shape === 'rect' ? (stock.measuredHeight ?? stock.height ?? 60) : 0,
      diameter: stock.shape === 'round' ? (stock.measuredDiameter ?? stock.diameter ?? 50) : 0,
      toolDiameter: tool.diameter,
      toolNumber: tool.number,
      toolType: tool.type,
      toolName: tool.name ?? '',
      toolCornerRadius: tool.cornerRadius ?? 0,
      stepover: so,
      depthOfCut: 0.1,
      feedrate: 1000,
      spindleSpeed: 10000,
      coolant: 'off',
      pattern: 'linear',
      rotation: linearRotation.value,
    }

    const passes = linearPasses(params)
    const step = Math.max(1, Math.ceil(passes.length / 30))

    for (let i = 0; i < passes.length; i += step) {
      const p = passes[i]!
      const rev = i % 2 !== 0
      const s = toSvg(rev ? p.x2 : p.x1, rev ? p.y2 : p.y1, scale)
      const e = toSvg(rev ? p.x1 : p.x2, rev ? p.y1 : p.y2, scale)
      result.lines.push({ x1: s.x, y1: s.y, x2: e.x, y2: e.y })
    }

    if (passes.length > 0) {
      const p = passes[0]!
      const s = toSvg(p.x1, p.y1, scale)
      const e = toSvg(p.x2, p.y2, scale)
      result.arrow = arrowPolygon(s.x, s.y, e.x, e.y)
    }
  } else if (pattern.value === 'spiral' && stock.shape === 'rect') {
    // Concentric rectangles (max 40 loops for preview)
    for (let n = 1; n <= 40; n++) {
      const hW = Math.min(n * so, W / 2)
      const hH = Math.min(n * so, H / 2)
      const corners = [
        toSvg(hW, -hH, scale),
        toSvg(-hW, -hH, scale),
        toSvg(-hW, hH, scale),
        toSvg(hW, hH, scale),
      ]
      for (let c = 0; c < 4; c++) {
        const a = corners[c]!, b = corners[(c + 1) % 4]!
        result.lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
      }
      if (hW >= W / 2 - 0.001 && hH >= H / 2 - 0.001) break
    }
  } else if (pattern.value === 'spiral' && stock.shape === 'round') {
    // Archimedean spiral
    const r = W / 2
    const rate = so / (2 * Math.PI)
    const tMax = r / rate
    const nSeg = Math.min(60, Math.ceil(tMax / (5 * Math.PI / 180)))
    const dTheta = tMax / Math.max(1, nSeg)
    const pts: Array<{ x: number; y: number }> = []
    for (let i = 0; i <= nSeg; i++) {
      const theta = i * dTheta
      const rr = rate * theta
      pts.push(toSvg(rr * Math.cos(theta), rr * Math.sin(theta), scale))
    }
    result.spiralPoints = pts
  }

  return result
})

// ── Generate + upload + load ──────────────────────────────────────────────────

async function generateAndLoad() {
  if (!canGenerate.value) return

  const stock = machine.stock!
  const tool = loadedTool.value!

  const params: SurfacingParams = {
    shape: stock.shape,
    width: stock.shape === 'rect' ? (stock.measuredWidth ?? stock.width ?? 100) : 0,
    height: stock.shape === 'rect' ? (stock.measuredHeight ?? stock.height ?? 60) : 0,
    diameter: stock.shape === 'round' ? (stock.measuredDiameter ?? stock.diameter ?? 50) : 0,
    toolDiameter: tool.diameter,
    toolNumber: tool.number,
    toolType: tool.type,
    toolName: tool.name ?? '',
    toolCornerRadius: tool.cornerRadius ?? 0,
    stepover: stepover.value,
    depthOfCut: depthOfCut.value,
    feedrate: feedrate.value!,
    spindleSpeed: spindleSpeed.value!,
    coolant: coolant.value,
    pattern: pattern.value,
    rotation: linearRotation.value,
  }

  generating.value = true
  try {
    const gcode = generateSurfacingGCode(params)
    const filename = buildFilename(params)

    const blob = new Blob([gcode], { type: 'text/plain' })
    const formData = new FormData()
    formData.append('dir', 'generated/surface')
    formData.append('file', blob, filename)

    const result = await $fetch<{ files: { fileId: string; filename: string }[] }>(
      '/api/files', { method: 'POST', body: formData }
    )

    const fileId = result.files[0]?.fileId
    if (!fileId) throw new Error('Upload returned no fileId')

    await loadJob(fileId)
    await router.push('/')
  } catch (err) {
    toastError(`Failed to generate surfacing file: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    generating.value = false
  }
}
</script>
