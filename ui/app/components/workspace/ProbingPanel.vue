<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col"
  >
    <!-- Tab bar -->
    <div class="flex gap-0.5 p-1.5 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="setTab(tab.key)"
        :class="activeTab === tab.key ? 'bg-gray-200 dark:bg-slate-700 text-slate-100 dark:text-slate-100 text-gray-800' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'"
        class="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="overflow-y-auto p-3 space-y-3 min-h-[18rem]">

      <!-- ── Stock tab ────────────────────────────────────────────────────────── -->
      <template v-if="activeTab === 'stock'">
        <template v-if="!machine.stock">
          <div class="flex flex-col items-center justify-center py-10 gap-3">
            <p class="text-sm text-gray-400 dark:text-slate-500">No stock defined</p>
            <button
              @click="openStockDialog"
              :disabled="isViewer"
              class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Set Stock
            </button>
          </div>
        </template>

        <template v-else>
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
                :disabled="isViewer"
                class="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Edit
              </button>
              <button
                @click="wsSend({ t: 'ui:stock:clear', payload: {} })"
                :disabled="isViewer"
                class="px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>

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
                      <span v-if="ps.measuredWidth !== null" class="text-emerald-600 dark:text-emerald-400">{{ ps.measuredWidth!.toFixed(3) }} mm</span>
                      <span v-else class="text-gray-300 dark:text-slate-600">—</span>
                    </td>
                  </tr>
                  <tr>
                    <td class="px-3 py-2.5 text-gray-600 dark:text-slate-300">Length (Y)</td>
                    <td class="px-3 py-2.5 text-right font-mono text-gray-900 dark:text-slate-100">{{ machine.stock.height }} mm</td>
                    <td class="px-3 py-2.5 text-right font-mono">
                      <span v-if="ps.measuredHeight !== null" class="text-emerald-600 dark:text-emerald-400">{{ ps.measuredHeight!.toFixed(3) }} mm</span>
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
                      <span v-if="ps.measuredDiameter !== null" class="text-emerald-600 dark:text-emerald-400">{{ ps.measuredDiameter!.toFixed(3) }} mm</span>
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

          <!-- Session summary -->
          <div v-if="ps.rotation || ps.heightmap" class="space-y-1 pt-1 border-t border-gray-100 dark:border-slate-700">
            <p class="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Session</p>
            <div v-if="ps.rotation" class="flex items-center justify-between text-xs">
              <span class="text-gray-500 dark:text-slate-400">Rotation</span>
              <span class="font-mono text-gray-700 dark:text-slate-300">{{ ps.rotation.rotationDeg.toFixed(3) }}° ({{ ps.rotation.edge }} edge)</span>
            </div>
            <div v-if="ps.heightmap" class="flex items-center justify-between text-xs">
              <span class="text-gray-500 dark:text-slate-400">Heightmap</span>
              <span class="font-mono text-gray-700 dark:text-slate-300">{{ ps.heightmap.colCount }}×{{ ps.heightmap.rowCount }} grid</span>
            </div>
          </div>

          <button
            v-if="ps.measuredWidth !== null || ps.measuredHeight !== null || ps.measuredDiameter !== null || ps.rotation !== null || ps.heightmap !== null"
            @click="wsSend({ t: 'ui:stock:clearMeasurements', payload: {} })"
            :disabled="isViewer"
            class="w-full py-1.5 text-xs font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-slate-400 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear Measurements
          </button>
        </template>
      </template>

      <!-- ── XYZ tab ─────────────────────────────────────────────────────────── -->
      <template v-if="activeTab === 'xyz'">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">XYZ Origin Probing</p>
        <div class="space-y-2">
          <UiProbeWizardButton
            label="Corner Probing"
            description="Find a corner and set XYZ zero"
            icon="corner"
            :disabled="isViewer || isProbing || !machine.connected || machine.stock?.shape === 'round'"
            :disabled-reason="machine.stock?.shape === 'round' ? 'Corner probing requires rectangular stock' : undefined"
            @click="openWizard('corner')"
          />
          <UiProbeWizardButton
            label="Center — Outside In"
            description="Find center of stock by probing outside edges"
            icon="center-out"
            :disabled="isViewer || isProbing || !machine.connected"
            @click="openWizard('center-out')"
          />
          <UiProbeWizardButton
            label="Center — Pocket/Hole"
            description="Find center of a pocket, bore, or hole"
            icon="center-in"
            :disabled="isViewer || isProbing || !machine.connected"
            @click="openWizard('center-in')"
          />
        </div>
      </template>

      <!-- ── Edges tab ───────────────────────────────────────────────────────── -->
      <template v-if="activeTab === 'edges'">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Individual Edge Probing</p>

        <!-- Edge probe buttons grid -->
        <div class="grid grid-cols-3 gap-2 text-center">
          <div />
          <button
            :disabled="isViewer || isProbing || !machine.connected"
            @click="probeEdge('Y', '+')"
            class="flex flex-col items-center gap-0.5 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-gray-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span class="text-lg leading-none">↑</span>Y+
          </button>
          <div />
          <button
            :disabled="isViewer || isProbing || !machine.connected"
            @click="probeEdge('X', '-')"
            class="flex flex-col items-center gap-0.5 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-gray-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span class="text-lg leading-none">←</span>X-
          </button>
          <button
            :disabled="isViewer || isProbing || !machine.connected"
            @click="probeEdge('Z', '-')"
            class="flex flex-col items-center gap-0.5 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-gray-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span class="text-lg leading-none">↓</span>Z
          </button>
          <button
            :disabled="isViewer || isProbing || !machine.connected"
            @click="probeEdge('X', '+')"
            class="flex flex-col items-center gap-0.5 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-gray-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span class="text-lg leading-none">→</span>X+
          </button>
          <div />
          <button
            :disabled="isViewer || isProbing || !machine.connected"
            @click="probeEdge('Y', '-')"
            class="flex flex-col items-center gap-0.5 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-gray-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span class="text-lg leading-none">↓</span>Y-
          </button>
          <div />
        </div>

        <!-- Edge history -->
        <div class="rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-3 space-y-2 text-xs">
          <div class="grid grid-cols-3 gap-2 items-center">
            <div>
              <span class="text-gray-400 dark:text-slate-500">X₁</span>
              <span class="ml-1.5 font-mono text-gray-900 dark:text-slate-100">{{ ps.edgeHistoryX[0] !== null ? ps.edgeHistoryX[0]!.toFixed(3) : '—' }}</span>
            </div>
            <div>
              <span class="text-gray-400 dark:text-slate-500">X₂</span>
              <span class="ml-1.5 font-mono text-gray-900 dark:text-slate-100">{{ ps.edgeHistoryX[1] !== null ? ps.edgeHistoryX[1]!.toFixed(3) : '—' }}</span>
            </div>
            <button
              :disabled="isViewer || ps.edgeHistoryX[0] === null || ps.edgeHistoryX[1] === null || isProbing || !machine.connected"
              @click="wsSend({ t: 'probing:setCenter', payload: { axis: 'X' } })"
              class="px-2 py-1 rounded text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              X=0 center
            </button>
          </div>
          <div class="grid grid-cols-3 gap-2 items-center">
            <div>
              <span class="text-gray-400 dark:text-slate-500">Y₁</span>
              <span class="ml-1.5 font-mono text-gray-900 dark:text-slate-100">{{ ps.edgeHistoryY[0] !== null ? ps.edgeHistoryY[0]!.toFixed(3) : '—' }}</span>
            </div>
            <div>
              <span class="text-gray-400 dark:text-slate-500">Y₂</span>
              <span class="ml-1.5 font-mono text-gray-900 dark:text-slate-100">{{ ps.edgeHistoryY[1] !== null ? ps.edgeHistoryY[1]!.toFixed(3) : '—' }}</span>
            </div>
            <button
              :disabled="isViewer || ps.edgeHistoryY[0] === null || ps.edgeHistoryY[1] === null || isProbing || !machine.connected"
              @click="wsSend({ t: 'probing:setCenter', payload: { axis: 'Y' } })"
              class="px-2 py-1 rounded text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              Y=0 center
            </button>
          </div>
        </div>

        <!-- Last edge result (inline, stays on initiating client's tab) -->
        <div v-if="lastEdgeResult" class="text-xs text-center font-mono text-emerald-600 dark:text-emerald-400">
          {{ lastEdgeResult.axis }}{{ lastEdgeResult.direction }} = {{ lastEdgeResult.edgeWpos.toFixed(3) }} mm (wpos)
        </div>
        <div v-if="ps.errorMessage && ps.wizardKey === 'edge'" class="text-xs text-red-500 dark:text-red-400">
          {{ ps.errorMessage }}
        </div>
      </template>

      <!-- ── Correction tab ─────────────────────────────────────────────────── -->
      <template v-if="activeTab === 'correction'">
        <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Correction Wizards</p>

        <div class="space-y-2">
          <UiProbeWizardButton
            label="Stock Rotation"
            description="Three-point edge probing to measure rotation"
            icon="rotation-out"
            :disabled="isViewer || isProbing || !machine.connected || machine.stock?.shape === 'round'"
            :disabled-reason="machine.stock?.shape === 'round' ? 'Rotation probing requires a straight reference edge — not applicable to round stock' : undefined"
            @click="openWizard('rotation')"
          />
          <UiProbeWizardButton
            label="Surface Heightmap"
            description="Probe a grid across the stock surface"
            icon="heightmap"
            :disabled="isViewer || isProbing || !machine.connected || !machine.stock"
            @click="openWizard('heightmap')"
          />
        </div>

        <p v-if="!machine.stock" class="text-xs text-amber-500 dark:text-amber-400 text-center">
          Define stock first to enable heightmap probing
        </p>

        <!-- Last rotation result -->
        <div
          v-if="ps.rotation"
          class="bg-gray-50 dark:bg-slate-900 rounded-lg p-3 border border-gray-200 dark:border-slate-700"
        >
          <p class="text-xs text-gray-500 dark:text-slate-400">Measured rotation ({{ ps.rotation.edge }} edge)</p>
          <p class="text-2xl font-bold font-mono text-gray-900 dark:text-slate-100 tabular-nums">
            {{ ps.rotation.rotationDeg.toFixed(3) }}°
          </p>
          <p class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Bow: {{ ps.rotation.bowMm.toFixed(3) }} mm
          </p>
        </div>

        <!-- Last heightmap status + view button -->
        <template v-if="ps.heightmap">
          <p class="text-xs text-center text-emerald-600 dark:text-emerald-400">
            {{ ps.heightmap.colCount }}×{{ ps.heightmap.rowCount }} grid complete
          </p>
          <button
            @click="showHeightmapModal = true"
            class="w-full py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
          >
            View Heightmap
          </button>
        </template>
      </template>

    </div>

    <!-- ── Set Stock dialog ──────────────────────────────────────────────────── -->
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
                  <UiDimInput label="Width (X)" v-model="dialogStock.width" unit="mm" :min="0" />
                  <UiDimInput label="Length (Y)" v-model="dialogStock.height" unit="mm" :min="0" />
                  <UiDimInput label="Height (Z)" v-model="dialogStock.depth" unit="mm" :min="0" />
                </div>
              </template>
              <template v-else>
                <div class="grid grid-cols-2 gap-2">
                  <UiDimInput label="Diameter" v-model="dialogStock.diameter" unit="mm" :min="0" />
                  <UiDimInput label="Height (Z)" v-model="dialogStock.depth" unit="mm" :min="0" />
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

    <!-- ── Heightmap result modal ─────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="showHeightmapModal && ps.heightmap"
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
            <div
              class="grid gap-1 w-full"
              :style="`grid-template-columns: repeat(${ps.heightmap.colCount}, 1fr)`"
            >
              <div
                v-for="(val, i) in ps.heightmap.values"
                :key="i"
                class="rounded aspect-square"
                :style="{ backgroundColor: heightmapCellColor(val, heightmapMinMax) }"
              />
            </div>
            <div class="flex justify-between mt-3 text-xs text-gray-400 dark:text-slate-500">
              <span>{{ heightmapMinMax[0].toFixed(3) }} mm</span>
              <span class="font-medium">Z deviation</span>
              <span>{{ heightmapMinMax[1].toFixed(3) }} mm</span>
            </div>
            <p class="text-xs text-gray-400 dark:text-slate-500 mt-1 text-center">
              {{ ps.heightmap.colCount }}×{{ ps.heightmap.rowCount }} grid ·
              {{ ps.heightmap.values.filter(v => v !== null).length }} / {{ ps.heightmap.values.length }} points
            </p>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Wizard config modal (initiating client only) ───────────────────────── -->
    <Teleport to="body">
      <div
        v-if="activeWizard && !isProbing && resultDismissed"
        class="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
        @click.self="activeWizard = null"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-3xl">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <h3 class="text-base font-semibold text-gray-900 dark:text-slate-100">{{ wizardTitles[activeWizard] ?? '' }}</h3>
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
            <ProbingWizardCornerConfig    v-if="activeWizard === 'corner'"     :cfg="cornerCfg"    :stock-shape="machine.stock?.shape ?? 'rect'" />
            <ProbingWizardCenterOutConfig v-if="activeWizard === 'center-out'" :cfg="centerOutCfg" :stock-shape="machine.stock?.shape ?? 'rect'" />
            <ProbingWizardCenterInConfig  v-if="activeWizard === 'center-in'"  :cfg="centerInCfg"  :stock-shape="machine.stock?.shape ?? 'rect'" />
            <ProbingWizardRotationConfig  v-if="activeWizard === 'rotation'"   :cfg="rotationCfg"  :stock-shape="machine.stock?.shape ?? 'rect'" />
            <ProbingWizardHeightmapConfig v-if="activeWizard === 'heightmap'"  :cfg="heightmapCfg" />

            <template v-if="activeWizard !== 'rotation' && activeWizard !== 'heightmap'">
              <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300 cursor-pointer">
                <input type="checkbox" v-model="probePositioned" class="rounded" />
                I have positioned the probe as shown above
              </label>
            </template>

            <p
              v-if="activeWizard === 'rotation' && ps.measuredWidth === null && ps.measuredHeight === null"
              class="text-xs text-amber-600 dark:text-amber-400 px-1"
            >
              Stock has not been measured yet — probing positions will be based on entered dimensions.
            </p>

            <button
              @click="startWizard"
              :disabled="activeWizard !== 'rotation' && activeWizard !== 'heightmap' && !probePositioned"
              class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              Start Probing
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Progress overlay (all clients, bottom-anchored) ───────────────────── -->
    <Teleport to="body">
      <div
        v-if="ps.phase === 'running' && ps.wizardKey"
        class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl p-4 space-y-3">
          <p class="text-sm font-semibold text-gray-900 dark:text-slate-100">{{ wizardTitles[ps.wizardKey] ?? ps.wizardKey }}</p>
          <UiProbingProgressBar :ps="ps" @abort="wsSend({ t: 'probing:abort' })" />
          <template v-if="ps.wizardKey === 'center-in' && ps.currentStepLabel?.includes('Continue')">
            <p class="text-xs text-center text-amber-600 dark:text-amber-400">
              Jog probe inside pocket, then click Continue
            </p>
            <button
              @click="wsSend({ t: 'probing:continue' })"
              class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Continue
            </button>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- ── Result / abort overlay (all clients, centered modal) ─────────────── -->
    <Teleport to="body">
      <div
        v-if="(ps.phase === 'completed' || ps.phase === 'aborted') && ps.wizardKey && !resultDismissed"
        class="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
        @click.self="closeResult"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl w-full max-w-3xl">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <h3 class="text-base font-semibold text-gray-900 dark:text-slate-100">{{ wizardTitles[ps.wizardKey] ?? ps.wizardKey }}</h3>
            <button
              @click="closeResult"
              class="p-1 text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-md transition-colors"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-5 space-y-4">

            <!-- Completed -->
            <template v-if="ps.phase === 'completed'">
              <div class="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg p-3 space-y-1.5">
                <p class="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">Probing Complete</p>
                <template v-if="ps.measuredWidth !== null">
                  <p class="text-xs text-emerald-700 dark:text-emerald-400">Width: {{ ps.measuredWidth!.toFixed(3) }} mm</p>
                </template>
                <template v-if="ps.measuredHeight !== null">
                  <p class="text-xs text-emerald-700 dark:text-emerald-400">Height: {{ ps.measuredHeight!.toFixed(3) }} mm</p>
                </template>
                <template v-if="ps.measuredDiameter !== null">
                  <p class="text-xs text-emerald-700 dark:text-emerald-400">Diameter: {{ ps.measuredDiameter!.toFixed(3) }} mm</p>
                </template>
                <template v-for="r in ps.stepResults" :key="`${r.axis}${r.direction}`">
                  <p class="text-xs text-emerald-700 dark:text-emerald-400">{{ r.axis }}{{ r.direction }}: {{ r.edgeWpos.toFixed(3) }} mm</p>
                </template>
                <template v-if="ps.rotation">
                  <p class="text-xs text-emerald-700 dark:text-emerald-400">Rotation: {{ ps.rotation.rotationDeg.toFixed(3) }}°</p>
                  <p class="text-xs text-emerald-700 dark:text-emerald-400">Bow: {{ ps.rotation.bowMm.toFixed(3) }} mm</p>
                </template>
                <template v-if="ps.wizardKey === 'heightmap' && ps.heightmap">
                  <p class="text-xs text-emerald-700 dark:text-emerald-400">
                    {{ ps.heightmap.colCount }}×{{ ps.heightmap.rowCount }} grid · {{ ps.heightmap.values.filter(v => v !== null).length }} / {{ ps.heightmap.values.length }} points
                  </p>
                </template>
              </div>

              <button
                v-if="ps.wizardKey === 'heightmap' && ps.heightmap"
                @click="viewHeightmap"
                class="w-full py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                View Heightmap
              </button>

              <div class="flex gap-2">
                <button
                  @click="repeatWizard"
                  class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Repeat
                </button>
                <button
                  @click="closeResult"
                  class="flex-1 py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </template>

            <!-- Aborted / error -->
            <template v-if="ps.phase === 'aborted'">
              <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                <p class="text-xs font-semibold text-red-800 dark:text-red-300 uppercase tracking-wide">
                  {{ ps.errorMessage ? 'Probing Failed' : 'Probing Stopped' }}
                </p>
                <p v-if="ps.errorMessage" class="text-xs text-red-700 dark:text-red-400 mt-1">{{ ps.errorMessage }}</p>
              </div>
              <div class="flex gap-2">
                <button
                  @click="repeatWizard"
                  class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Retry
                </button>
                <button
                  @click="closeResult"
                  class="flex-1 py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </template>

          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { DEFAULT_PROBE_COMPENSATION } from '~~/server/utils/tool/types'
import { useSyncStore } from '~/stores/sync'
import { useModals } from '~/composables/useModals'
import { wsSend } from '~/composables/useWsSend'
import { useCurrentUser } from '~/composables/useCurrentUser'
import { useNav } from '~/composables/useNav'

const machine = useMachineStore()
const syncStore = useSyncStore()
const modals = useModals()
const ps = syncStore.probingState
const currentUser = useCurrentUser()
const isViewer = computed(() => currentUser.value.isViewer)
const nav = useNav()

// ── Tabs ──────────────────────────────────────────────────────────────────────

const tabs = [
  { key: 'stock',      label: 'Stock' },
  { key: 'xyz',        label: 'XYZ' },
  { key: 'edges',      label: 'Edges' },
  { key: 'correction', label: 'Correction' },
]

const activeTab = computed({
  get: () => nav.probingTab.value,
  set: (v) => { nav.probingTab.value = v },
})

function setTab(key: string) {
  activeTab.value = key
}

const isProbing = computed(() => ps.phase === 'running')

// ── Probe tool resolution ─────────────────────────────────────────────────────

const probeTool = computed(() => {
  const all = [...(machine.toolLibrary?.machine ?? []), ...(machine.toolLibrary?.app ?? [])]
  const loaded = machine.loadedToolNumber
  if (loaded !== null) {
    const t = all.find(e => e.number === loaded && e.type.toLowerCase().trim() === 'probe')
    if (t) return t
  }
  return all.find(e => e.type.toLowerCase().trim() === 'probe') ?? null
})

const probeConfig = computed(() => probeTool.value?.probeConfig ?? {
  wiggleEnabled: true,
  fastFeedMmPerMin: 500,
  slowFeedMmPerMin: 5,
  cycles: 3,
  averageN: 2,
})

const probeCompensation = computed(() => probeTool.value?.probeCompensation ?? DEFAULT_PROBE_COMPENSATION)

// ── Per-wizard config objects ─────────────────────────────────────────────────

const cornerCfg = reactive({
  safeHeightMm: 20,
  buffer: 10,
  skipX: false,
  skipY: false,
  skipZ: false,
  corner: 'front-left' as 'front-left' | 'front-right' | 'back-left' | 'back-right',
})

const centerOutCfg = reactive({
  safeHeightMm: 20,
  buffer: 10,
  skipX: false,
  skipY: false,
  skipZ: false,
})

const centerInCfg = reactive({
  buffer: 10,
})

const rotationCfg = reactive({
  safeHeightMm: 20,
  insideOffset: 20,
  edge: 'top' as 'top' | 'bottom' | 'left' | 'right',
})

const heightmapCfg = reactive({
  safeHeightMm: 20,
  buffer: 10,
  edgeOffset: 5,
  resolution: 10,
})

// ── Edge probing ──────────────────────────────────────────────────────────────

function probeEdge(axis: 'X' | 'Y' | 'Z', direction: '+' | '-') {
  wsSend({
    t: 'probing:edge',
    payload: {
      axis,
      direction,
      probeConfig: probeConfig.value,
      compensation: probeCompensation.value,
      buffer: 10,
    },
  })
}

const lastEdgeResult = computed(() => {
  if (ps.phase !== 'completed' || ps.wizardKey !== 'edge') return null
  return ps.stepResults[0] ?? null
})

// ── Wizard ────────────────────────────────────────────────────────────────────

const activeWizard = ref<string | null>(null)
const probePositioned = ref(false)

// resultDismissed starts true so no stale result shows on page load.
// It flips false when a run completes (watcher below) and true again
// when the user closes/repeats or a new run begins.
const resultDismissed = ref(true)

const wizardTitles: Record<string, string> = {
  'corner':     'Corner Probing (XYZ)',
  'center-out': 'Center Probing — Outside In',
  'center-in':  'Center Probing — Pocket/Hole',
  'rotation':   'Stock Rotation Probe',
  'heightmap':  'Surface Heightmap',
}

function openWizard(key: string) {
  activeWizard.value = key
  probePositioned.value = false
}

function repeatWizard() {
  activeWizard.value = ps.wizardKey
  probePositioned.value = false
  resultDismissed.value = true
}

function closeResult() {
  resultDismissed.value = true
  activeWizard.value = null
}

function viewHeightmap() {
  resultDismissed.value = true
  showHeightmapModal.value = true
}

function startWizard() {
  if (!activeWizard.value) return
  const key = activeWizard.value

  const cfgMap: Record<string, object> = {
    'corner':     { ...cornerCfg },
    'center-out': { ...centerOutCfg },
    'center-in':  { ...centerInCfg },
    'rotation':   { ...rotationCfg },
    'heightmap':  { ...heightmapCfg },
  }
  const cfg = cfgMap[key]
  if (!cfg) return

  wsSend({
    t: 'probing:start',
    payload: {
      wizardKey: key,
      config: cfg,
      probeConfig: probeConfig.value,
      compensation: probeCompensation.value,
    },
  })
}

// Show the result overlay when a run finishes, unless calibration owns the sequence.
// The prevPhase === 'running' guard prevents the overlay from appearing
// for clients that connect after the run is already done.
watch(() => ps.phase, (phase, prevPhase) => {
  if ((phase === 'completed' || phase === 'aborted') && prevPhase === 'running') {
    if (!syncStore.calibrationActive) resultDismissed.value = false
  }
})

// ── Stock dialog ──────────────────────────────────────────────────────────────

const stockModal = modals.active('stock')
const showStockDialog = computed<boolean>({
  get: () => !!stockModal.value,
  set: (open) => {
    if (open) modals.open('stock')
    else if (stockModal.value) modals.resolve(stockModal.value.id)
  },
})

const dialogStock = reactive({ shape: 'rect' as 'rect' | 'round', width: 200, height: 150, depth: 25, diameter: 50 })

function seedDialog() {
  const s = machine.stock
  Object.assign(dialogStock, s
    ? { shape: s.shape, width: s.width ?? 200, height: s.height ?? 150, depth: s.depth, diameter: s.diameter ?? 50 }
    : { shape: 'rect', width: 200, height: 150, depth: 25, diameter: 50 }
  )
}

watch(showStockDialog, (open) => { if (open) seedDialog() })

function openStockDialog() {
  seedDialog()
  showStockDialog.value = true
}

function applyStockDialog() {
  wsSend({
    t: 'ui:stock:set',
    payload: {
      shape: dialogStock.shape,
      width: dialogStock.width,
      height: dialogStock.height,
      depth: dialogStock.depth,
      diameter: dialogStock.diameter,
    },
  })
  showStockDialog.value = false
}

// ── Heightmap result modal ────────────────────────────────────────────────────

const showHeightmapModal = ref(false)

const heightmapMinMax = computed<[number, number]>(() => {
  const vals = (ps.heightmap?.values ?? []).filter((v): v is number => v !== null)
  if (vals.length === 0) return [0, 0]
  return [Math.min(...vals), Math.max(...vals)]
})

function heightmapCellColor(val: number | null, [min, max]: [number, number]): string {
  if (val === null) return '#374151'
  const range = max - min
  const t = range > 0 ? (val - min) / range : 0.5
  const r = Math.round(t * 220 + 30)
  const g = Math.round((1 - Math.abs(t - 0.5) * 2) * 180 + 30)
  const b = Math.round((1 - t) * 220 + 30)
  return `rgb(${r},${g},${b})`
}
</script>
