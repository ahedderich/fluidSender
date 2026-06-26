<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col"
  >
    <!-- Tab bar -->
    <div class="flex gap-0.5 p-1.5 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="activeTab = tab.key"
        :class="activeTab === tab.key ? 'bg-gray-200 dark:bg-slate-700 text-slate-100 dark:text-slate-100 text-gray-800' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'"
        class="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="overflow-y-auto p-3 space-y-3 min-h-[18rem]">

      <!-- Stock Definition -->
      <template v-if="activeTab === 'stock'">
        <!-- No stock set -->
        <template v-if="!machine.stock">
          <div class="flex flex-col items-center justify-center py-10 gap-3">
            <p class="text-sm text-gray-400 dark:text-slate-500">No stock defined</p>
            <button
              @click="openStockDialog"
              class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Set Stock
            </button>
          </div>
        </template>

        <template v-else>
          <!-- Stock type badge + Edit / Clear buttons -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-200">
              <svg v-if="machine.stock.shape === 'rect'" class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="6" width="18" height="12" rx="1" />
              </svg>
              <svg v-else class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="9" />
              </svg>
              {{ machine.stock.shape === 'rect' ? 'Rectangle' : 'Round' }}
            </div>
            <div class="flex gap-1.5">
              <button
                @click="openStockDialog"
                class="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg transition-colors"
              >
                Edit
              </button>
              <button
                @click="machine.clearStock()"
                class="px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <!-- Dimensions table -->
          <div class="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                  <th class="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Dimension</th>
                  <th class="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Entered</th>
                  <th class="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Measured</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                <template v-if="machine.stock.shape === 'rect'">
                  <tr>
                    <td class="px-3 py-2.5 text-gray-600 dark:text-slate-300">Width (X)</td>
                    <td class="px-3 py-2.5 text-right font-mono text-gray-900 dark:text-slate-100">{{ machine.stock.width }} mm</td>
                    <td class="px-3 py-2.5 text-right font-mono">
                      <span v-if="measured.width !== null" class="text-emerald-600 dark:text-emerald-400">{{ measured.width.toFixed(3) }} mm</span>
                      <span v-else class="text-gray-300 dark:text-slate-600">—</span>
                    </td>
                  </tr>
                  <tr>
                    <td class="px-3 py-2.5 text-gray-600 dark:text-slate-300">Length (Y)</td>
                    <td class="px-3 py-2.5 text-right font-mono text-gray-900 dark:text-slate-100">{{ machine.stock.height }} mm</td>
                    <td class="px-3 py-2.5 text-right font-mono">
                      <span v-if="measured.depth !== null" class="text-emerald-600 dark:text-emerald-400">{{ measured.depth.toFixed(3) }} mm</span>
                      <span v-else class="text-gray-300 dark:text-slate-600">—</span>
                    </td>
                  </tr>
                  <tr>
                    <td class="px-3 py-2.5 text-gray-600 dark:text-slate-300">Height (Z)</td>
                    <td class="px-3 py-2.5 text-right font-mono text-gray-900 dark:text-slate-100">{{ machine.stock.depth }} mm</td>
                    <td class="px-3 py-2.5 text-right font-mono text-gray-300 dark:text-slate-600">—</td>
                  </tr>
                </template>
                <template v-else>
                  <tr>
                    <td class="px-3 py-2.5 text-gray-600 dark:text-slate-300">Diameter</td>
                    <td class="px-3 py-2.5 text-right font-mono text-gray-900 dark:text-slate-100">{{ machine.stock.diameter }} mm</td>
                    <td class="px-3 py-2.5 text-right font-mono">
                      <span v-if="measured.diameter !== null" class="text-emerald-600 dark:text-emerald-400">{{ measured.diameter.toFixed(3) }} mm</span>
                      <span v-else class="text-gray-300 dark:text-slate-600">—</span>
                    </td>
                  </tr>
                  <tr>
                    <td class="px-3 py-2.5 text-gray-600 dark:text-slate-300">Height (Z)</td>
                    <td class="px-3 py-2.5 text-right font-mono text-gray-900 dark:text-slate-100">{{ machine.stock.depth }} mm</td>
                    <td class="px-3 py-2.5 text-right font-mono text-gray-300 dark:text-slate-600">—</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>
      </template>

      <!-- XYZ Probing -->
      <template v-if="activeTab === 'xyz'">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">XYZ Origin Probing</p>
        <div class="space-y-2">
          <ProbeWizardButton
            label="Corner Probing"
            description="Find a corner and set XYZ zero"
            icon="corner"
            @click="openWizard('corner')"
          />
          <ProbeWizardButton
            label="Center — Outside In"
            description="Find center of a feature by probing outside edges"
            icon="center-out"
            @click="openWizard('center-out')"
          />
          <ProbeWizardButton
            label="Center — Inside Out"
            description="Find center of a pocket or bore"
            icon="center-in"
            @click="openWizard('center-in')"
          />
        </div>
      </template>

      <!-- Edge Probing -->
      <template v-if="activeTab === 'edges'">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Individual Edge Probing</p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="dir in edgeDirs"
            :key="dir.label"
            @click="openWizard('edge-' + dir.key)"
            class="flex flex-col items-center gap-1.5 py-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-800 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            <span class="text-2xl leading-none">{{ dir.icon }}</span>
            <span class="text-xs">{{ dir.label }}</span>
          </button>
        </div>
      </template>

      <!-- Surface Heightmap -->
      <template v-if="activeTab === 'heightmap'">
        <div class="grid grid-cols-2 gap-2">
          <DimInput label="Grid X" v-model="heightmap.gridX" unit="pts" :step="1" :min="2" :max="20" />
          <DimInput label="Grid Y" v-model="heightmap.gridY" unit="pts" :step="1" :min="2" :max="20" />
          <DimInput label="Probe Depth" v-model="heightmap.depth" unit="mm" />
          <DimInput label="Probe Feed" v-model="heightmap.feed" unit="mm/m" :step="10" />
        </div>
        <p class="text-xs text-gray-400 dark:text-slate-500">
          {{ heightmap.gridX * heightmap.gridY }} probe points · {{ heightmap.gridX }}×{{ heightmap.gridY }} grid
        </p>
        <div class="flex gap-2">
          <button
            @click="hasHeightmap = true"
            class="flex-1 py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Start Heightmap Probing
          </button>
          <button
            v-if="hasHeightmap"
            @click="hasHeightmap = false"
            class="px-3 py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-red-600 hover:text-white text-gray-500 dark:text-slate-400 rounded-lg text-sm transition-colors"
            title="Clear heightmap"
          >
            Clear
          </button>
        </div>
        <button
          :disabled="!hasHeightmap"
          @click="hasHeightmap && (showHeightmapModal = true)"
          :class="hasHeightmap
            ? 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 cursor-pointer'
            : 'bg-gray-50 dark:bg-slate-900 text-gray-300 dark:text-slate-600 cursor-default'"
          class="w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.5l6.75-6.75L13.5 10.5 19.5 4.5m0 0H15m4.5 0V9" />
          </svg>
          {{ hasHeightmap ? 'View Heightmap Result' : 'No result available' }}
        </button>
      </template>

      <!-- Rotation Probing -->
      <template v-if="activeTab === 'rotation'">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Stock Rotation</p>
        <p class="text-xs text-gray-500 dark:text-slate-400">
          Probe two points on an edge to calculate stock rotation around the Z-axis.
        </p>
        <div class="space-y-2 mt-1">
          <ProbeWizardButton
            label="Probe Outside Edge"
            description="Two probing points on an outside face"
            icon="rotation-out"
            @click="openWizard('rotation-out')"
          />
          <ProbeWizardButton
            label="Probe Inside Edge"
            description="Two probing points on an inside face"
            icon="rotation-in"
            @click="openWizard('rotation-in')"
          />
        </div>
        <div
          v-if="rotationResult !== null"
          class="mt-2 bg-gray-50 dark:bg-slate-900 rounded-lg p-3 border border-gray-200 dark:border-slate-700"
        >
          <p class="text-xs text-gray-500 dark:text-slate-400">Measured rotation</p>
          <p class="text-2xl font-bold font-mono text-gray-900 dark:text-slate-100 tabular-nums">
            {{ rotationResult.toFixed(3) }}°
          </p>
        </div>
      </template>

    </div>

    <!-- Set Stock dialog -->
    <Teleport to="body">
      <div
        v-if="showStockDialog"
        class="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
        @click.self="showStockDialog = false"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-sm">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <h3 class="text-base font-semibold text-gray-900 dark:text-slate-100">Set Stock</h3>
            <button
              @click="showStockDialog = false"
              class="p-1 text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-md transition-colors"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">Shape</p>
              <div class="flex gap-2">
                <button
                  @click="dialogStock.shape = 'rect'"
                  :class="dialogStock.shape === 'rect' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
                  class="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex flex-col items-center gap-1"
                >
                  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="6" width="18" height="12" rx="1" />
                  </svg>
                  Rectangle
                </button>
                <button
                  @click="dialogStock.shape = 'round'"
                  :class="dialogStock.shape === 'round' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
                  class="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex flex-col items-center gap-1"
                >
                  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                  Round
                </button>
              </div>
            </div>

            <div class="space-y-2">
              <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Dimensions</p>
              <template v-if="dialogStock.shape === 'rect'">
                <div class="grid grid-cols-2 gap-2">
                  <DimInput label="Width (X)" v-model="dialogStock.width" unit="mm" :min="0" />
                  <DimInput label="Length (Y)" v-model="dialogStock.height" unit="mm" :min="0" />
                  <DimInput label="Height (Z)" v-model="dialogStock.depth" unit="mm" :min="0" />
                </div>
              </template>
              <template v-else>
                <div class="grid grid-cols-2 gap-2">
                  <DimInput label="Diameter" v-model="dialogStock.diameter" unit="mm" :min="0" />
                  <DimInput label="Height (Z)" v-model="dialogStock.depth" unit="mm" :min="0" />
                </div>
              </template>
            </div>

            <div class="flex gap-2.5 pt-1">
              <button
                @click="showStockDialog = false"
                class="flex-1 py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                @click="applyStockDialog"
                class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Heightmap result modal -->
    <Teleport to="body">
      <div
        v-if="showHeightmapModal"
        class="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
        @click.self="showHeightmapModal = false"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-lg">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <h3 class="text-base font-semibold text-gray-900 dark:text-slate-100">Heightmap Result</h3>
            <button
              @click="showHeightmapModal = false"
              class="p-1 text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-md transition-colors"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-5">
            <div class="grid gap-1 w-full" :style="`grid-template-columns: repeat(${heightmap.gridX}, 1fr)`">
              <div
                v-for="i in heightmap.gridX * heightmap.gridY"
                :key="i"
                class="rounded aspect-square"
                :style="{ backgroundColor: cellColor(i) }"
              />
            </div>
            <div class="flex justify-between mt-3 text-xs text-gray-400 dark:text-slate-500">
              <span>-0.35 mm</span>
              <span class="font-medium">Z deviation</span>
              <span>+0.35 mm</span>
            </div>
            <p class="text-xs text-gray-400 dark:text-slate-500 mt-1 text-center">
              {{ heightmap.gridX }}×{{ heightmap.gridY }} grid · {{ heightmap.gridX * heightmap.gridY }} points
            </p>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Probing wizard modal -->
    <Teleport to="body">
      <div
        v-if="activeWizard"
        class="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
        @click.self="activeWizard = null"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-md">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <h3 class="text-base font-semibold text-gray-900 dark:text-slate-100">
              {{ wizardTitle }}
            </h3>
            <button
              @click="activeWizard = null"
              class="p-1 text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-md transition-colors"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-5 space-y-4">
            <div class="flex items-center gap-1">
              <template v-for="(step, i) in wizardSteps" :key="i">
                <div class="flex flex-col items-center gap-0.5 shrink-0">
                  <div
                    :class="i <= wizardStep ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400'"
                    class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                  >{{ i + 1 }}</div>
                  <span class="text-xs text-center text-gray-500 dark:text-slate-400 leading-tight max-w-10">{{ step }}</span>
                </div>
                <div
                  v-if="i < wizardSteps.length - 1"
                  class="flex-1 h-px bg-gray-200 dark:bg-slate-700 mb-4"
                />
              </template>
            </div>

            <div class="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 text-sm text-gray-700 dark:text-slate-300">
              {{ wizardInstructions[wizardStep] }}
            </div>

            <div class="flex gap-2.5">
              <button
                v-if="wizardStep > 0"
                @click="wizardStep--"
                class="flex-1 py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                Back
              </button>
              <button
                v-if="wizardStep < wizardSteps.length - 1"
                @click="wizardStep++"
                class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Next
              </button>
              <button
                v-else
                @click="runProbe"
                class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Start Probing
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useNav } from '~/composables/useNav'
import { useModals } from '~/composables/useModals'

const machine = useMachineStore()
const modals = useModals()
const { probingTab: activeTab, activeWizard, wizardStep } = useNav()

const tabs = [
  { key: 'stock', label: 'Stock' },
  { key: 'xyz', label: 'XYZ' },
  { key: 'edges', label: 'Edges' },
  { key: 'rotation', label: 'Rotation' },
  { key: 'heightmap', label: 'Heightmap' },
]

const measured = reactive({
  width: null as number | null,
  depth: null as number | null,
  diameter: null as number | null,
})

// Open/close synced via the modal stack; dialog field values stay local.
const stockModal = modals.active('stock')
const showStockDialog = computed<boolean>({
  get: () => !!stockModal.value,
  set: (open) => {
    if (open) modals.open('stock')
    else if (stockModal.value) modals.resolve(stockModal.value.id)
  },
})

// dialogStock field names match StockDef: height = Y-length (rect), depth = Z-thickness
const dialogStock = reactive({ shape: 'rect' as 'rect' | 'round', width: 200, height: 150, depth: 25, diameter: 50 })

function seedDialog() {
  const s = machine.stock
  Object.assign(dialogStock, s
    ? { shape: s.shape, width: s.width ?? 200, height: s.height ?? 150, depth: s.depth, diameter: s.diameter ?? 50 }
    : { shape: 'rect', width: 200, height: 150, depth: 25, diameter: 50 }
  )
}

// Seed the local form whenever the dialog opens (including when opened remotely).
watch(showStockDialog, (open) => { if (open) seedDialog() })

function openStockDialog() {
  seedDialog()
  showStockDialog.value = true
}

function applyStockDialog() {
  machine.setStock({
    shape: dialogStock.shape,
    width: dialogStock.width,
    height: dialogStock.height,
    depth: dialogStock.depth,
    diameter: dialogStock.diameter,
  })
  measured.width = null
  measured.depth = null
  measured.diameter = null
  showStockDialog.value = false
}

const rotationResult = ref<number | null>(null)

const edgeDirs = [
  { key: 'x-pos', label: 'X+ Edge', icon: '→' },
  { key: 'x-neg', label: 'X- Edge', icon: '←' },
  { key: 'y-pos', label: 'Y+ Edge', icon: '↑' },
  { key: 'y-neg', label: 'Y- Edge', icon: '↓' },
  { key: 'z-neg', label: 'Z- Surface', icon: '↓Z' },
]


const wizardConfigs: Record<string, { title: string; steps: string[]; instructions: string[] }> = {
  corner: {
    title: 'Corner Probing (XYZ)',
    steps: ['Choose Corner', 'Position', 'Probe X', 'Probe Y', 'Probe Z', 'Done'],
    instructions: [
      'Select which corner of the stock to probe. The machine will find the corner and set XYZ zero at the top surface.',
      'Jog the probe to approximately 5mm above and 5mm outside the chosen corner. Click Next when ready.',
      'The machine will probe the X axis to find the edge. Ensure the probe can travel freely.',
      'The machine will probe the Y axis to find the edge.',
      'The machine will probe down to find the Z surface and set Z zero.',
      'Probing complete. XYZ work zero has been set at the selected corner.',
    ],
  },
  'center-out': {
    title: 'Center Probing (Outside → In)',
    steps: ['Setup', 'Position', 'Probe XY', 'Probe Z', 'Done'],
    instructions: [
      'This wizard finds the center of your stock by probing all four outside edges. Make sure the stock dimensions are correct in the Stock tab.',
      'Jog the probe above the center of the stock, approx. 5mm above the surface.',
      'The machine will probe all 4 sides to calculate the center X/Y position.',
      'The machine will probe the top surface for Z zero.',
      'Center XYZ work zero has been set.',
    ],
  },
  'center-in': {
    title: 'Center Probing (Pocket/Bore)',
    steps: ['Setup', 'Position', 'Probe XY', 'Done'],
    instructions: [
      'This wizard finds the center of a pocket or bore by probing the inside walls.',
      'Jog the probe inside the pocket/bore, roughly centered. The probe must not touch the walls during positioning.',
      'The machine will probe all 4 walls to calculate the center.',
      'XY center has been set. Probe Z separately if needed.',
    ],
  },
}

for (const dir of edgeDirs) {
  wizardConfigs[`edge-${dir.key}`] = {
    title: `${dir.label} Probing`,
    steps: ['Position', 'Probe', 'Done'],
    instructions: [
      `Jog the probe to approximately 5mm outside the ${dir.label.toLowerCase()}. Ensure clearance for the probing move.`,
      `The machine will probe in the ${dir.label.toLowerCase()} direction until the probe triggers.`,
      `${dir.label} offset has been set in the work coordinate system.`,
    ],
  }
}

for (const type of ['rotation-out', 'rotation-in']) {
  wizardConfigs[type] = {
    title: type === 'rotation-out' ? 'Outside Edge Rotation Probe' : 'Inside Edge Rotation Probe',
    steps: ['Point 1', 'Point 2', 'Result'],
    instructions: [
      'Jog the probe to the first probing point on the edge. Click Next to probe this point.',
      'Jog the probe to the second point on the same edge, at least 20mm away. Click Next to probe.',
      'Rotation calculated and applied to the coordinate system via G68.',
    ],
  }
}

const wizardTitle = computed(() => (activeWizard.value ? (wizardConfigs[activeWizard.value]?.title ?? '') : ''))
const wizardSteps = computed(() => (activeWizard.value ? (wizardConfigs[activeWizard.value]?.steps ?? []) : []))
const wizardInstructions = computed(() => (activeWizard.value ? (wizardConfigs[activeWizard.value]?.instructions ?? []) : []))

function openWizard(key: string) {
  // Setting the wizard also resets the step to 0 (see useNav).
  activeWizard.value = key
}

function runProbe() {
  machine.addConsole('info', `Starting ${wizardTitle.value}...`)
  if (activeWizard.value?.startsWith('rotation')) {
    rotationResult.value = 2.347
  }
  activeWizard.value = null
}

const hasHeightmap = ref(false)
const heightmapModal = modals.active('heightmap')
const showHeightmapModal = computed<boolean>({
  get: () => !!heightmapModal.value,
  set: (open) => {
    if (open) modals.open('heightmap')
    else if (heightmapModal.value) modals.resolve(heightmapModal.value.id)
  },
})
const heightmap = reactive({ gridX: 5, gridY: 5, depth: 2, feed: 100 })

function cellColor(i: number): string {
  const total = heightmap.gridX * heightmap.gridY
  const t = (i - 1) / (total - 1)
  const v = Math.sin(t * Math.PI * 2.3 + 0.5) * 0.5 + 0.5
  const r = Math.round(v * 59 + 30)
  const g = Math.round((1 - Math.abs(v - 0.5) * 2) * 180 + 30)
  const b = Math.round((1 - v) * 200 + 30)
  return `rgb(${r},${g},${b})`
}
</script>

