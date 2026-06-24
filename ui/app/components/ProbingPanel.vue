<template>
  <div
    class="bg-slate-800 dark:bg-slate-800 bg-white rounded-lg border border-slate-700 dark:border-slate-700 border-gray-200 flex flex-col min-h-0"
  >
    <!-- Tab bar -->
    <div class="flex gap-0.5 p-1.5 border-b border-slate-700 dark:border-slate-700 border-gray-100 shrink-0">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="activeTab = tab.key"
        :class="activeTab === tab.key ? 'bg-slate-700 dark:bg-slate-700 bg-gray-200 text-slate-100 dark:text-slate-100 text-gray-800' : 'text-slate-500 dark:text-slate-500 text-gray-400 hover:text-slate-300 dark:hover:text-slate-300 hover:text-gray-600'"
        class="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="flex-1 overflow-y-auto p-3 space-y-3">

      <!-- Stock Definition -->
      <template v-if="activeTab === 'stock'">
        <div>
          <p class="text-xs font-semibold text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-wide mb-2">Stock Shape</p>
          <div class="flex gap-2">
            <button
              @click="stock.shape = 'rect'"
              :class="stock.shape === 'rect' ? 'bg-blue-600 text-white' : 'bg-slate-700 dark:bg-slate-700 bg-gray-100 text-slate-300 dark:text-slate-300 text-gray-700'"
              class="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex flex-col items-center gap-1"
            >
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="6" width="18" height="12" rx="1" />
              </svg>
              Rectangle
            </button>
            <button
              @click="stock.shape = 'round'"
              :class="stock.shape === 'round' ? 'bg-blue-600 text-white' : 'bg-slate-700 dark:bg-slate-700 bg-gray-100 text-slate-300 dark:text-slate-300 text-gray-700'"
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
          <p class="text-xs font-semibold text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-wide">Dimensions</p>
          <template v-if="stock.shape === 'rect'">
            <div class="grid grid-cols-2 gap-2">
              <DimInput label="Width (X)" v-model="stock.width" unit="mm" />
              <DimInput label="Depth (Y)" v-model="stock.depth" unit="mm" />
              <DimInput label="Height (Z)" v-model="stock.height" unit="mm" />
            </div>
          </template>
          <template v-else>
            <div class="grid grid-cols-2 gap-2">
              <DimInput label="Diameter" v-model="stock.diameter" unit="mm" />
              <DimInput label="Height (Z)" v-model="stock.height" unit="mm" />
            </div>
          </template>
        </div>

        <div>
          <p class="text-xs font-semibold text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-wide mb-1.5">Probe Tip</p>
          <DimInput label="Tip Diameter" v-model="stock.probeTipDia" unit="mm" />
          <p class="text-xs text-slate-500 dark:text-slate-500 text-gray-400 mt-1">
            Half-tip offset ({{ (stock.probeTipDia / 2).toFixed(2) }} mm) applied automatically.
          </p>
        </div>
      </template>

      <!-- XYZ Probing -->
      <template v-if="activeTab === 'xyz'">
        <p class="text-xs font-semibold text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-wide">XYZ Origin Probing</p>
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
        <p class="text-xs font-semibold text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-wide">Individual Edge Probing</p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="dir in edgeDirs"
            :key="dir.label"
            @click="openWizard('edge-' + dir.key)"
            class="flex flex-col items-center gap-1.5 py-3 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-200 dark:text-slate-200 text-gray-800 rounded-lg text-sm font-medium transition-colors"
          >
            <span class="text-2xl leading-none">{{ dir.icon }}</span>
            <span class="text-xs">{{ dir.label }}</span>
          </button>
        </div>
      </template>

      <!-- Rotation Probing -->
      <template v-if="activeTab === 'rotation'">
        <p class="text-xs font-semibold text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-wide">Stock Rotation</p>
        <p class="text-xs text-slate-400 dark:text-slate-400 text-gray-500">
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
          class="mt-2 bg-slate-900 dark:bg-slate-900 bg-gray-50 rounded-lg p-3 border border-slate-700 dark:border-slate-700 border-gray-200"
        >
          <p class="text-xs text-slate-400 dark:text-slate-400 text-gray-500">Measured rotation</p>
          <p class="text-2xl font-bold font-mono text-slate-100 dark:text-slate-100 text-gray-900 tabular-nums">
            {{ rotationResult.toFixed(3) }}°
          </p>
        </div>
      </template>

      <!-- Heightmap -->
      <template v-if="activeTab === 'heightmap'">
        <p class="text-xs font-semibold text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-wide">Surface Heightmap</p>
        <div class="grid grid-cols-2 gap-2">
          <DimInput label="Grid X" v-model="heightmap.gridX" unit="pts" :step="1" :min="2" :max="20" />
          <DimInput label="Grid Y" v-model="heightmap.gridY" unit="pts" :step="1" :min="2" :max="20" />
          <DimInput label="Probe Depth" v-model="heightmap.depth" unit="mm" />
          <DimInput label="Probe Feed" v-model="heightmap.feed" unit="mm/m" :step="10" />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-500 text-gray-400">
          {{ heightmap.gridX * heightmap.gridY }} probe points total
        </p>
        <button
          @click="openWizard('heightmap')"
          class="w-full py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Start Heightmap Probing
        </button>
        <!-- Mock heightmap visualization placeholder -->
        <div class="bg-slate-900 dark:bg-slate-900 bg-gray-50 rounded-lg border border-slate-700 dark:border-slate-700 border-gray-200 h-32 flex items-center justify-center">
          <span class="text-xs text-slate-600 dark:text-slate-600 text-gray-400">3D heightmap will appear here</span>
        </div>
      </template>
    </div>

    <!-- Probing wizard modal -->
    <Teleport to="body">
      <div
        v-if="activeWizard"
        class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        @click.self="activeWizard = null"
      >
        <div class="bg-slate-800 dark:bg-slate-800 bg-white border border-slate-600 dark:border-slate-600 border-gray-300 rounded-xl shadow-2xl w-full max-w-md">
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-700 dark:border-slate-700 border-gray-200">
            <h3 class="text-base font-semibold text-slate-100 dark:text-slate-100 text-gray-900">
              {{ wizardTitle }}
            </h3>
            <button
              @click="activeWizard = null"
              class="p-1 text-slate-400 hover:text-slate-200 dark:hover:text-slate-200 hover:text-gray-600 rounded-md transition-colors"
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
                    :class="i <= wizardStep ? 'bg-blue-600 text-white' : 'bg-slate-700 dark:bg-slate-700 bg-gray-200 text-slate-400 dark:text-slate-400 text-gray-500'"
                    class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                  >{{ i + 1 }}</div>
                  <span class="text-xs text-center text-slate-400 dark:text-slate-400 text-gray-500 leading-tight max-w-10">{{ step }}</span>
                </div>
                <div
                  v-if="i < wizardSteps.length - 1"
                  class="flex-1 h-px bg-slate-700 dark:bg-slate-700 bg-gray-200 mb-4"
                />
              </template>
            </div>

            <div class="bg-slate-900 dark:bg-slate-900 bg-gray-50 rounded-lg p-4 text-sm text-slate-300 dark:text-slate-300 text-gray-700">
              {{ wizardInstructions[wizardStep] }}
            </div>

            <div class="flex gap-2.5">
              <button
                v-if="wizardStep > 0"
                @click="wizardStep--"
                class="flex-1 py-2.5 bg-slate-700 dark:bg-slate-700 bg-gray-100 hover:bg-slate-600 dark:hover:bg-slate-600 hover:bg-gray-200 text-slate-200 dark:text-slate-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
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

const machine = useMachineStore()

const tabs = [
  { key: 'stock', label: 'Stock' },
  { key: 'xyz', label: 'XYZ' },
  { key: 'edges', label: 'Edges' },
  { key: 'rotation', label: 'Rotation' },
  { key: 'heightmap', label: 'Heightmap' },
]

const activeTab = ref('stock')

const stock = reactive({
  shape: 'rect' as 'rect' | 'round',
  width: 200,
  depth: 150,
  height: 25,
  diameter: 50,
  probeTipDia: 3,
})

const heightmap = reactive({
  gridX: 5,
  gridY: 5,
  depth: 2,
  feed: 100,
})

const rotationResult = ref<number | null>(null)

const edgeDirs = [
  { key: 'x-pos', label: 'X+ Edge', icon: '→' },
  { key: 'x-neg', label: 'X- Edge', icon: '←' },
  { key: 'y-pos', label: 'Y+ Edge', icon: '↑' },
  { key: 'y-neg', label: 'Y- Edge', icon: '↓' },
  { key: 'z-neg', label: 'Z- Surface', icon: '↓Z' },
]

const activeWizard = ref<string | null>(null)
const wizardStep = ref(0)

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
  'heightmap': {
    title: 'Surface Heightmap',
    steps: ['Configure', 'Position', 'Probing', 'Done'],
    instructions: [
      `Ready to probe a ${heightmap.gridX}×${heightmap.gridY} grid (${heightmap.gridX * heightmap.gridY} points) across the stock surface.`,
      'Jog the probe to the origin corner of the stock (typically front-left). The probe should be above the surface.',
      'Probing in progress. Do not interrupt the machine.',
      'Heightmap complete. The 3D surface map is now available for visualization.',
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
  activeWizard.value = key
  wizardStep.value = 0
}

function runProbe() {
  machine.addConsole('info', `Starting ${wizardTitle.value}...`)
  if (activeWizard.value?.startsWith('rotation')) {
    rotationResult.value = 2.347
  }
  activeWizard.value = null
}
</script>

