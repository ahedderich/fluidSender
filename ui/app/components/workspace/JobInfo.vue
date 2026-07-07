<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <svg class="w-3.5 h-3.5 text-gray-400 dark:text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span class="text-xs font-medium text-gray-700 dark:text-slate-300 truncate">
          {{ job?.filename ?? 'No file loaded' }}
        </span>
      </div>
      <button
        v-if="job && job.status !== 'idle'"
        :disabled="isViewer"
        class="text-xs px-2 py-0.5 text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Clear loaded file"
        @click="clearJob"
      >
        Clear
      </button>
    </div>

    <!-- Crash / checkpoint recovery banner -->
    <div
      v-if="job?.recovery?.available"
      class="px-3 py-2.5 border-b border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 shrink-0"
    >
      <div class="flex items-start gap-2 mb-2.5">
        <svg class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <div class="min-w-0">
          <p class="text-xs font-semibold text-amber-800 dark:text-amber-300">Crash detected</p>
          <p class="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
            Interrupted at line {{ job!.recovery!.checkpointPtr.toLocaleString() }}.
            Home and position the machine before resuming.
          </p>
        </div>
      </div>
      <div class="space-y-1.5">
        <button
          :disabled="!machine.connected || isViewer"
          :title="!machine.connected ? 'Connect to machine before resuming' : undefined"
          class="w-full py-1.5 rounded-md text-xs font-semibold transition-colors"
          :class="machine.connected && !isViewer
            ? 'bg-amber-600 hover:bg-amber-500 text-white'
            : 'bg-amber-200/60 dark:bg-amber-900/40 text-amber-400 dark:text-amber-700 cursor-not-allowed'"
          @click="doRecover()"
        >
          Resume from line {{ job!.recovery!.resumePtr.toLocaleString() }}
        </button>
        <div class="flex gap-1.5">
          <button
            :disabled="isViewer"
            class="flex-1 py-1.5 bg-white dark:bg-slate-700 border border-amber-200 dark:border-slate-600 hover:bg-amber-50 dark:hover:bg-slate-600 text-amber-900 dark:text-slate-200 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            @click="doLoadFresh()"
          >
            Restart from beginning
          </button>
          <button
            :disabled="isViewer"
            class="flex-1 py-1.5 bg-white dark:bg-slate-700 border border-red-200 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            @click="clearJob()"
          >
            Clear job
          </button>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div v-if="job" class="px-3 py-2 border-b border-gray-100 dark:border-slate-700 shrink-0 flex gap-4">
      <!-- XYZ range -->
      <table class="text-xs flex-1 min-w-0">
        <tbody>
          <tr v-for="axis in axisRanges" :key="axis.label">
            <td class="text-gray-400 dark:text-slate-500 py-0.5 pr-2 whitespace-nowrap">{{ axis.label }} Range</td>
            <td class="font-mono text-gray-800 dark:text-slate-200 text-right pr-2">{{ axis.from }}</td>
            <td class="font-mono text-gray-800 dark:text-slate-200 text-right">{{ axis.to }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Scalar stats -->
      <table class="text-xs shrink-0">
        <tbody>
          <tr>
            <td class="text-gray-400 dark:text-slate-500 py-0.5 pr-2 whitespace-nowrap">Lines</td>
            <td class="font-mono text-gray-800 dark:text-slate-200 text-right">{{ job!.totalLines.toLocaleString() }}</td>
          </tr>
          <tr>
            <td class="text-gray-400 dark:text-slate-500 py-0.5 pr-2 whitespace-nowrap">Sent / Exec</td>
            <td class="font-mono text-gray-800 dark:text-slate-200 text-right">{{ job!.sendPtr.toLocaleString() }} / {{ job!.execPtr.toLocaleString() }}</td>
          </tr>
          <tr>
            <td class="text-gray-400 dark:text-slate-500 py-0.5 pr-2 whitespace-nowrap">Est. Time</td>
            <td class="font-mono text-gray-800 dark:text-slate-200 text-right">{{ formatRuntime(job!.estimatedTotalMs) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Transform compensation toggles (only when measurements are present) -->
    <div
      v-if="job && (ps.rotation || ps.heightmap)"
      class="px-3 py-2 border-b border-gray-100 dark:border-slate-700 shrink-0"
    >
      <div class="flex items-center justify-between mb-1.5">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Compensation</h3>
        <span
          v-if="activeMode !== 'none'"
          class="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
        >
          {{ modeLabel }}
        </span>
      </div>
      <div class="flex flex-col gap-1.5">
        <label
          v-if="ps.rotation"
          class="flex items-center justify-between gap-2"
          :class="isAnalyzing ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'"
        >
          <span class="text-xs text-gray-700 dark:text-slate-300">Rotation compensation</span>
          <button
            role="switch"
            :aria-checked="rotationEnabled"
            :disabled="isAnalyzing || isViewer"
            class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:pointer-events-none"
            :class="rotationEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'"
            @click="toggleRotation"
          >
            <span
              class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              :class="rotationEnabled ? 'translate-x-4' : 'translate-x-0'"
            />
          </button>
        </label>
        <label
          v-if="ps.heightmap"
          class="flex items-center justify-between gap-2"
          :class="isAnalyzing ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'"
        >
          <span class="text-xs text-gray-700 dark:text-slate-300">Heightmap compensation</span>
          <button
            role="switch"
            :aria-checked="heightmapEnabled"
            :disabled="isAnalyzing || isViewer"
            class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:pointer-events-none"
            :class="heightmapEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'"
            @click="toggleHeightmap"
          >
            <span
              class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              :class="heightmapEnabled ? 'translate-x-4' : 'translate-x-0'"
            />
          </button>
        </label>
      </div>
    </div>

    <!-- Tool Change banner -->
    <div
      v-if="job?.status === 'tool_change' && job?.toolChangeRequest"
      class="px-3 py-2.5 border-b border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 shrink-0"
    >
      <div class="flex items-start gap-2 mb-2">
        <svg class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l5.654-4.654m5.292-5.293.97-.97a3.75 3.75 0 115.304 5.304l-.97.97" />
        </svg>
        <div class="min-w-0">
          <p class="text-xs font-semibold text-amber-800 dark:text-amber-300">
            {{ job?.toolChangeRequest?.toolChangeType === 'M6' ? 'Tool Change Required' : 'Tool Selection Required' }}
          </p>
          <p class="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
            Load: T{{ job?.toolChangeRequest?.toolNumber }}
            <span v-if="toolChangeLibEntry"> — {{ toolChangeLibEntry.name }} ⌀{{ toolChangeLibEntry.diameter }}mm</span>
          </p>
        </div>
      </div>
      <!-- Macro status -->
      <div v-if="job?.toolChangeRequest?.macroRunning" class="mb-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
        <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        Macro running…
      </div>
      <div v-else-if="job?.toolChangeRequest?.macroError" class="mb-2 text-xs text-red-600 dark:text-red-400">
        ✗ Macro error: {{ job?.toolChangeRequest?.macroError }}
      </div>
      <div v-else-if="job?.toolChangeRequest?.macroError === null && !job?.toolChangeRequest?.macroRunning" class="mb-2 text-xs text-green-600 dark:text-green-400"></div>
      <div class="flex gap-1.5">
        <button
          :disabled="isViewer"
          class="flex-1 py-1.5 bg-white dark:bg-slate-700 border border-amber-200 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="wsSend({ t: 'job:stop' })"
        >
          Cancel Job
        </button>
        <button
          :disabled="(job?.toolChangeRequest?.macroRunning ?? false) || isViewer"
          class="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-xs font-semibold transition-colors"
          @click="wsSend({ t: 'job:resumeToolChange' })"
        >
          Resume →
        </button>
      </div>
    </div>

    <!-- Tool list -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <template v-if="job">
        <div class="px-3 pt-2 pb-1 shrink-0 flex items-center justify-between">
          <p class="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
            Tools ({{ toolSections.length }})
          </p>
          <div class="relative group/legend">
            <button type="button" class="w-4 h-4 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-300 text-[9px] font-bold flex items-center justify-center leading-none cursor-default">?</button>
            <div class="hidden group-hover/legend:block absolute right-0 top-5 z-30 w-52 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl p-2.5 space-y-1.5">
              <p class="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Color Legend</p>
              <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-amber-500 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Next required for job start</span></div>
              <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-green-600 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Loaded & matches next required</span></div>
              <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-purple-600 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Currently loaded tool</span></div>
              <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-blue-600 shrink-0"></span><span class="text-[10px] text-gray-600 dark:text-slate-300">Other tools in this job</span></div>
            </div>
          </div>
        </div>
        <!-- No tool definitions state -->
        <div v-if="!toolSections.length" class="px-3 pb-3">
          <p class="text-xs text-gray-400 dark:text-slate-500 italic">No tool definitions found in this file</p>
        </div>
        <div v-else class="px-3 pb-3 space-y-1.5">
          <div
            v-for="(section, idx) in toolSections"
            :key="idx"
            :class="toolRowClass(section)"
            class="border rounded-lg px-2.5 py-2"
          >
            <div class="flex items-center gap-2">
              <div
                :class="toolBadgeClass(section)"
                class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              >
                {{ section.toolNumber }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium text-gray-800 dark:text-slate-200 truncate">
                  {{ section.commentedName ?? libraryEntry(section)?.name ?? `T${section.toolNumber}` }}
                </p>
                <p class="text-xs text-gray-400 dark:text-slate-500">
                  {{ gcodeToolSubline(section) }}
                </p>
              </div>
              <!-- Not in library tag -->
              <span
                v-if="!libraryEntry(section)"
                class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 shrink-0 whitespace-nowrap"
                title="Tool not found in library"
              >not in library</span>
              <!-- Mismatch tag (name or diameter differs from library) -->
              <button
                v-if="hasMismatch(section)"
                type="button"
                class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 shrink-0 whitespace-nowrap hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors cursor-pointer"
                :title="mismatchTitle(section)"
                @click.stop="scrollToToolPanel"
              >mismatch</button>
              <!-- Load / Unload text button -->
              <button
                type="button"
                :disabled="!machine.connected || isViewer"
                :class="machine.loadedToolNumber === section.toolNumber
                  ? 'hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400'
                  : 'hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-400'"
                class="shrink-0 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                :title="machine.loadedToolNumber === section.toolNumber ? 'Unload tool from spindle' : 'Load tool into spindle'"
                @click="machine.loadedToolNumber === section.toolNumber ? wsSend({ t: 'tool:unload', payload: {} }) : wsSend({ t: 'tool:load', payload: { toolNumber: section.toolNumber } })"
              >
                {{ machine.loadedToolNumber === section.toolNumber ? 'Unload' : 'Load' }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="flex flex-col items-center justify-center h-full py-8 text-center px-4">
          <svg class="w-8 h-8 text-gray-300 dark:text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="text-gray-400 dark:text-slate-500 text-sm">No file loaded</p>
        </div>
      </template>
    </div>

    <!-- Speed overrides -->
    <div class="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-slate-700 shrink-0 space-y-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Overrides</h3>

      <!-- Feed override -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-600 dark:text-slate-300 font-medium w-14 shrink-0">Feed</span>
        <input
          v-model.number="localFeed"
          type="range"
          min="10"
          max="200"
          step="1"
          :style="{ '--val': localFeed }"
          :disabled="!machine.connected || isViewer"
          class="override-slider flex-1 disabled:opacity-40"
          @mousedown="isDraggingFeed = true"
          @touchstart="isDraggingFeed = true"
          @change="applyFeed"
        />
        <div
          v-if="!editingFeed"
          class="w-11 text-right text-xs font-mono cursor-pointer text-gray-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 select-none shrink-0"
          :class="{ 'opacity-40 pointer-events-none': !machine.connected || isViewer }"
          @click="startEditFeed"
        >
          {{ localFeed }}%
        </div>
        <input
          v-else
          ref="feedInput"
          v-model.number="feedEditValue"
          type="number"
          min="10"
          max="200"
          class="w-16 bg-gray-50 dark:bg-slate-900 border border-blue-500 text-gray-900 dark:text-slate-100 text-xs font-mono text-right px-1 py-0.5 rounded focus:outline-none shrink-0"
          @blur="commitFeedEdit"
          @keydown.enter="commitFeedEdit"
          @keydown.escape="cancelFeedEdit"
        />
        <button
          :disabled="!machine.connected || isViewer"
          class="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-sm leading-none shrink-0 transition-colors disabled:opacity-40"
          title="Reset to 100%"
          @click="resetFeed"
        >↺</button>
      </div>

      <!-- Spindle override -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-600 dark:text-slate-300 font-medium w-14 shrink-0">Spindle</span>
        <input
          v-model.number="localSpindle"
          type="range"
          min="10"
          max="200"
          step="1"
          :style="{ '--val': localSpindle }"
          :disabled="!machine.connected || isViewer"
          class="override-slider flex-1 disabled:opacity-40"
          @mousedown="isDraggingSpindle = true"
          @touchstart="isDraggingSpindle = true"
          @change="applySpindle"
        />
        <div
          v-if="!editingSpindle"
          class="w-11 text-right text-xs font-mono cursor-pointer text-gray-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 select-none shrink-0"
          :class="{ 'opacity-40 pointer-events-none': !machine.connected || isViewer }"
          @click="startEditSpindle"
        >
          {{ localSpindle }}%
        </div>
        <input
          v-else
          ref="spindleInput"
          v-model.number="spindleEditValue"
          type="number"
          min="10"
          max="200"
          class="w-16 bg-gray-50 dark:bg-slate-900 border border-blue-500 text-gray-900 dark:text-slate-100 text-xs font-mono text-right px-1 py-0.5 rounded focus:outline-none shrink-0"
          @blur="commitSpindleEdit"
          @keydown.enter="commitSpindleEdit"
          @keydown.escape="cancelSpindleEdit"
        />
        <button
          :disabled="!machine.connected || isViewer"
          class="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-sm leading-none shrink-0 transition-colors disabled:opacity-40"
          title="Reset to 100%"
          @click="resetSpindle"
        >↺</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useSyncStore } from '~/stores/sync'
import { useJobControl } from '~/composables/useJobControl'
import { wsSend } from '~/composables/useWsSend'
import { useCurrentUser } from '~/composables/useCurrentUser'
import type { ToolSection } from '~/types/job'

const machine = useMachineStore()
const syncStore = useSyncStore()
const { job, clearJob, confirmRecovery } = useJobControl()
const currentUser = useCurrentUser()
const isViewer = computed(() => currentUser.value.isViewer)

const ps = syncStore.probingState
const activeMode = computed(() => syncStore.job?.transformMode ?? 'none')
const isAnalyzing = computed(() => syncStore.job?.status === 'analyzing')
const rotationEnabled = computed(
  () => activeMode.value === 'rotated' || activeMode.value === 'rotated_height_adjusted',
)
const heightmapEnabled = computed(
  () => activeMode.value === 'height_adjusted' || activeMode.value === 'rotated_height_adjusted',
)
const modeLabel = computed(() => {
  switch (activeMode.value) {
    case 'rotated': return 'Rotated'
    case 'height_adjusted': return 'Height-adjusted'
    case 'rotated_height_adjusted': return 'Rotated + Height-adjusted'
    default: return ''
  }
})

function sendTransformToggle(rotation: boolean, heightmap: boolean): void {
  wsSend({ t: 'job:setTransformMode', payload: { rotationActive: rotation, heightmapActive: heightmap } })
}

function toggleRotation(): void {
  if (isAnalyzing.value || isViewer.value) return
  sendTransformToggle(!rotationEnabled.value, heightmapEnabled.value)
}

function toggleHeightmap(): void {
  if (isAnalyzing.value || isViewer.value) return
  sendTransformToggle(rotationEnabled.value, !heightmapEnabled.value)
}

function doRecover() {
  const resumePtr = job.value?.recovery?.resumePtr
  if (resumePtr != null) confirmRecovery(resumePtr)
}

function doLoadFresh() {
  wsSend({ t: 'job:recover:fresh' })
}

const toolSections = computed<ToolSection[]>(() => job.value?.toolSections ?? [])

function sectionState(section: ToolSection): 'active' | 'complete' | 'queued' {
  const status = job.value?.status
  if (!status || status === 'idle' || status === 'analyzing') return 'queued'
  const ptr = job.value?.sendPtr ?? 0
  if (ptr > section.endLine) return 'complete'
  if (ptr >= section.startLine) return 'active'
  return 'queued'
}

const allTools = computed(() => [
  ...machine.toolLibrary.machine,
  ...machine.toolLibrary.app,
])

function libraryEntry(section: ToolSection) {
  const scope = job.value?.toolPreferences?.[section.toolNumber] ?? 'M'
  const scopeLib = scope === 'M' ? machine.toolLibrary.machine : machine.toolLibrary.app
  return scopeLib.find((t) => t.number === section.toolNumber)
    ?? allTools.value.find((t) => t.number === section.toolNumber)
    ?? null
}

function hasMismatch(section: ToolSection): boolean {
  const entry = libraryEntry(section)
  if (!entry) return false
  if (section.commentedName && section.commentedName.toLowerCase() !== entry.type.toLowerCase()) return true
  if (section.commentedDiameter != null && Math.abs(section.commentedDiameter - entry.diameter) > 0.05) return true
  return false
}

function mismatchTitle(section: ToolSection): string {
  const entry = libraryEntry(section)
  if (!entry) return ''
  const parts: string[] = []
  if (section.commentedName && section.commentedName.toLowerCase() !== entry.type.toLowerCase()) {
    parts.push(`Type: "${section.commentedName}" vs "${entry.type}"`)
  }
  if (section.commentedDiameter != null && Math.abs(section.commentedDiameter - entry.diameter) > 0.05) {
    parts.push(`⌀ ${section.commentedDiameter}mm vs ${entry.diameter}mm`)
  }
  return parts.join('; ')
}

const toolChangeLibEntry = computed(() => {
  const req = job.value?.toolChangeRequest
  if (!req) return null
  return allTools.value.find((t) => t.number === req.toolNumber) ?? null
})

// FluidNC real-time override bytes
const FEED_RESET = 0x90
const FEED_UP10 = 0x91
const FEED_DOWN10 = 0x92
const FEED_UP1 = 0x93
const FEED_DOWN1 = 0x94

const SPINDLE_RESET = 0x99
const SPINDLE_UP10 = 0x9a
const SPINDLE_DOWN10 = 0x9b
const SPINDLE_UP1 = 0x9c
const SPINDLE_DOWN1 = 0x9d

const editingFeed = ref(false)
const editingSpindle = ref(false)

const localFeed = ref(machine.feedOverride)
const localSpindle = ref(machine.spindleOverride)

const isDraggingFeed = ref(false)
const isDraggingSpindle = ref(false)

let lastSentFeed = machine.feedOverride
let lastSentSpindle = machine.spindleOverride

let pendingFeed: number | null = null
let pendingFeedTimer: ReturnType<typeof setTimeout> | null = null
let pendingSpindle: number | null = null
let pendingSpindleTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => machine.feedOverride,
  (v) => {
    if (isDraggingFeed.value || editingFeed.value) return
    if (pendingFeed !== null) {
      if (Math.abs(v - pendingFeed) <= 1) {
        if (pendingFeedTimer) { clearTimeout(pendingFeedTimer); pendingFeedTimer = null }
        pendingFeed = null
        localFeed.value = v
        lastSentFeed = v
      }
      return
    }
    localFeed.value = v
    lastSentFeed = v
  },
  { immediate: true },
)

watch(
  () => machine.spindleOverride,
  (v) => {
    if (isDraggingSpindle.value || editingSpindle.value) return
    if (pendingSpindle !== null) {
      if (Math.abs(v - pendingSpindle) <= 1) {
        if (pendingSpindleTimer) { clearTimeout(pendingSpindleTimer); pendingSpindleTimer = null }
        pendingSpindle = null
        localSpindle.value = v
        lastSentSpindle = v
      }
      return
    }
    localSpindle.value = v
    lastSentSpindle = v
  },
  { immediate: true },
)

function deltaBytes(delta: number, up10: number, down10: number, up1: number, down1: number) {
  const bytes: number[] = []
  const sign = Math.sign(delta)
  let rem = Math.abs(Math.round(delta))
  while (rem >= 10) { bytes.push(sign > 0 ? up10 : down10); rem -= 10 }
  while (rem >= 1) { bytes.push(sign > 0 ? up1 : down1); rem -= 1 }
  return bytes
}

function clamp(v: number) { return Math.max(10, Math.min(200, Math.round(v))) }

// Feed handlers
const feedInput = ref<HTMLInputElement>()
const feedEditValue = ref(100)

function applyFeed() {
  isDraggingFeed.value = false
  const target = clamp(localFeed.value)
  localFeed.value = target
  const bytes = deltaBytes(target - lastSentFeed, FEED_UP10, FEED_DOWN10, FEED_UP1, FEED_DOWN1)
  if (bytes.length) {
    machine.sendOverride(bytes)
    lastSentFeed = target
    pendingFeed = target
    if (pendingFeedTimer) clearTimeout(pendingFeedTimer)
    pendingFeedTimer = setTimeout(() => { pendingFeed = null }, 2000)
  }
}

function resetFeed() {
  machine.sendOverride([FEED_RESET])
  localFeed.value = 100
  lastSentFeed = 100
  pendingFeed = 100
  if (pendingFeedTimer) clearTimeout(pendingFeedTimer)
  pendingFeedTimer = setTimeout(() => { pendingFeed = null }, 2000)
}

function startEditFeed() {
  feedEditValue.value = localFeed.value
  editingFeed.value = true
  nextTick(() => feedInput.value?.select())
}

function commitFeedEdit() {
  const target = clamp(feedEditValue.value || lastSentFeed)
  localFeed.value = target
  editingFeed.value = false
  const bytes = deltaBytes(target - lastSentFeed, FEED_UP10, FEED_DOWN10, FEED_UP1, FEED_DOWN1)
  if (bytes.length) {
    machine.sendOverride(bytes)
    lastSentFeed = target
    pendingFeed = target
    if (pendingFeedTimer) clearTimeout(pendingFeedTimer)
    pendingFeedTimer = setTimeout(() => { pendingFeed = null }, 2000)
  }
}

function cancelFeedEdit() {
  editingFeed.value = false
  localFeed.value = lastSentFeed
}

// Spindle handlers
const spindleInput = ref<HTMLInputElement>()
const spindleEditValue = ref(100)

function applySpindle() {
  isDraggingSpindle.value = false
  const target = clamp(localSpindle.value)
  localSpindle.value = target
  const bytes = deltaBytes(target - lastSentSpindle, SPINDLE_UP10, SPINDLE_DOWN10, SPINDLE_UP1, SPINDLE_DOWN1)
  if (bytes.length) {
    machine.sendOverride(bytes)
    lastSentSpindle = target
    pendingSpindle = target
    if (pendingSpindleTimer) clearTimeout(pendingSpindleTimer)
    pendingSpindleTimer = setTimeout(() => { pendingSpindle = null }, 2000)
  }
}

function resetSpindle() {
  machine.sendOverride([SPINDLE_RESET])
  localSpindle.value = 100
  lastSentSpindle = 100
  pendingSpindle = 100
  if (pendingSpindleTimer) clearTimeout(pendingSpindleTimer)
  pendingSpindleTimer = setTimeout(() => { pendingSpindle = null }, 2000)
}

function startEditSpindle() {
  spindleEditValue.value = localSpindle.value
  editingSpindle.value = true
  nextTick(() => spindleInput.value?.select())
}

function commitSpindleEdit() {
  const target = clamp(spindleEditValue.value || lastSentSpindle)
  localSpindle.value = target
  editingSpindle.value = false
  const bytes = deltaBytes(target - lastSentSpindle, SPINDLE_UP10, SPINDLE_DOWN10, SPINDLE_UP1, SPINDLE_DOWN1)
  if (bytes.length) {
    machine.sendOverride(bytes)
    lastSentSpindle = target
    pendingSpindle = target
    if (pendingSpindleTimer) clearTimeout(pendingSpindleTimer)
    pendingSpindleTimer = setTimeout(() => { pendingSpindle = null }, 2000)
  }
}

function cancelSpindleEdit() {
  editingSpindle.value = false
  localSpindle.value = lastSentSpindle
}

const currentTool = computed(() => {
  const sections = toolSections.value
  if (!sections.length) return null
  const line = job.value?.sendPtr ?? 0
  return sections.find((s) => line >= s.startLine && line <= s.endLine) ?? sections[0] ?? null
})

const nextRequiredToolNumber = computed(() => {
  const sections = toolSections.value
  if (!sections.length) return null
  const sendPtr = job.value?.sendPtr ?? 0
  const status = job.value?.status
  if (!status || status === 'idle' || status === 'analyzing') {
    return sections[0]?.toolNumber ?? null
  }
  return sections.find(s => sendPtr <= s.endLine)?.toolNumber ?? null
})

function scrollToToolPanel() {
  document.getElementById('tool-management-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function gcodeToolSubline(section: ToolSection): string {
  const parts: string[] = []
  if (section.commentedDiameter != null) {
    parts.push(`⌀${section.commentedDiameter} mm`)
  } else {
    const lib = libraryEntry(section)
    if (lib) parts.push(`⌀${lib.diameter} mm`)
  }
  parts.push(`${section.lineCount.toLocaleString()} lines`)
  return parts.join(' · ')
}

function toolBadgeClass(section: ToolSection): string {
  const isLoaded = machine.loadedToolNumber === section.toolNumber
  const isNext = section.toolNumber === nextRequiredToolNumber.value
  if (isLoaded && isNext) return 'bg-green-600'
  if (isNext) return 'bg-amber-500'
  if (isLoaded) return 'bg-purple-600'
  return 'bg-blue-700'
}

function toolRowClass(section: ToolSection): string {
  const isLoaded = machine.loadedToolNumber === section.toolNumber
  const isNext = section.toolNumber === nextRequiredToolNumber.value
  if (isLoaded && isNext) return 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/60'
  if (isNext) return 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700/60'
  if (isLoaded) return 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700/60'
  return 'bg-blue-50/60 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50'
}

const axisRanges = computed(() => {
  const r = job.value?.axisRanges
  const fmt = (v: number) => v.toFixed(1)
  return [
    { label: 'X', from: r ? fmt(r.x.min) : '—', to: r ? fmt(r.x.max) : '—' },
    { label: 'Y', from: r ? fmt(r.y.min) : '—', to: r ? fmt(r.y.max) : '—' },
    { label: 'Z', from: r ? fmt(r.z.min) : '—', to: r ? fmt(r.z.max) : '—' },
  ]
})

function formatRuntime(ms: number) {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}
</script>
