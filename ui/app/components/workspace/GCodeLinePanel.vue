<template>
  <div class="flex flex-col flex-1 min-h-0">
    <!-- Header: jump-to-tool-section selector (top-right) -->
    <div class="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-600/50 shrink-0">
      <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">GCode</span>
      <select
        v-if="toolSections?.length"
        class="bg-slate-900/80 text-slate-300 text-xs rounded border border-slate-600/50 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
        @change="onJumpToSection(($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled selected>Jump to tool…</option>
        <option v-for="s in toolSections" :key="s.startLine" :value="s.startLine">
          T{{ s.toolNumber }} — lines {{ s.startLine + 1 }}–{{ s.endLine + 1 }}
        </option>
      </select>
    </div>

    <div
      ref="scrollEl"
      tabindex="0"
      class="flex-1 overflow-y-auto px-2 py-1.5 font-mono text-xs min-h-0 focus:outline-none"
      @focus="gcodeViewerFocused = true"
      @blur="gcodeViewerFocused = false"
      @keydown="onKeyDown"
    >
      <template v-if="lines.length">
        <!-- Virtualized: only the rows currently in view (+ overscan) are ever
             mounted, regardless of file size. Row heights are fixed constants
             (see ROW_HEIGHT / HEADER_ROW_HEIGHT) rather than measured, which is
             what makes scrollToIndex-based jumps and native scrollbar dragging
             land at the right offset without first rendering everything in between. -->
        <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
          <div
            v-for="vRow in virtualizer.getVirtualItems()"
            :key="vRow.index"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${vRow.size}px`,
              transform: `translateY(${vRow.start}px)`,
            }"
          >
            <template v-if="resolveRow(vRow.index).type === 'header'">
              <div
                class="flex items-baseline gap-1.5 px-1 py-1 bg-slate-700/60 rounded text-slate-300 text-[11px] font-sans h-full box-border"
              >
                <span class="font-semibold">
                  T{{ (resolveRow(vRow.index) as HeaderRow).section.toolNumber }}
                </span>
                <span class="truncate">{{ (resolveRow(vRow.index) as HeaderRow).section.commentedName ?? '' }}</span>
                <span class="ml-auto shrink-0 text-slate-500">
                  lines {{ (resolveRow(vRow.index) as HeaderRow).section.startLine + 1 }}–{{
                    (resolveRow(vRow.index) as HeaderRow).section.endLine + 1
                  }}
                </span>
              </div>
            </template>
            <template v-else>
              <div
                :data-line-index="(resolveRow(vRow.index) as LineRow).lineIndex"
                class="flex gap-1.5 leading-5 rounded px-1 cursor-pointer hover:bg-slate-700/50 h-full box-border overflow-x-auto whitespace-nowrap"
                :class="{ 'bg-blue-600/30': (resolveRow(vRow.index) as LineRow).lineIndex === selectedIndex }"
                @click="emit('select', (resolveRow(vRow.index) as LineRow).lineIndex)"
              >
                <span class="shrink-0 select-none w-12 text-right text-slate-500">{{
                  (resolveRow(vRow.index) as LineRow).lineIndex + 1
                }}</span>
                <span class="text-slate-300">{{ lines[(resolveRow(vRow.index) as LineRow).lineIndex] }}</span>
              </div>
            </template>
          </div>
        </div>
      </template>
      <div v-else class="text-slate-500 px-1 py-1">No GCode loaded</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { ToolSection } from '~/types/job'
import { useGcodeViewerFocus } from '~/composables/useGcodeViewerFocus'

const props = defineProps<{
  lines: string[]
  toolSections: ToolSection[] | null
  selectedIndex: number | null
}>()
const emit = defineEmits<{ select: [index: number] }>()

const { gcodeViewerFocused } = useGcodeViewerFocus()

const scrollEl = ref<HTMLDivElement | null>(null)

const ROW_HEIGHT = 20
const HEADER_ROW_HEIGHT = 32

type HeaderRow = { type: 'header'; section: ToolSection }
type LineRow = { type: 'line'; lineIndex: number }

// toolSections arrive pre-sorted by startLine (single forward pass over the
// file server-side) — relied on by the binary searches below.
const sections = computed(() => props.toolSections ?? [])

// Row index of the header inserted for the k-th section (0-indexed within
// `sections`): each of the k sections before it also occupies one extra row.
function headerRowIndex(k: number): number {
  return sections.value[k]!.startLine + k
}

// Deliberately not materializing a flattened lines+headers array (that would
// mean allocating one object per line just to find headers). Section count is
// tiny compared to line count, so binary-searching over `sections` to insert
// header rows keeps memory proportional to line count only.
function resolveRow(rowIndex: number): HeaderRow | LineRow {
  const secs = sections.value
  if (!secs.length) return { type: 'line', lineIndex: rowIndex }
  let lo = 0
  let hi = secs.length - 1
  let k = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (headerRowIndex(mid) <= rowIndex) {
      k = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (k === -1) return { type: 'line', lineIndex: rowIndex }
  if (headerRowIndex(k) === rowIndex) return { type: 'header', section: secs[k]! }
  return { type: 'line', lineIndex: rowIndex - (k + 1) }
}

function rowIndexForLine(lineIndex: number): number {
  const secs = sections.value
  if (!secs.length) return lineIndex
  let lo = 0
  let hi = secs.length - 1
  let headersBefore = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (secs[mid]!.startLine <= lineIndex) {
      headersBefore = mid + 1
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return lineIndex + headersBefore
}

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.lines.length + sections.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: (index: number) => (resolveRow(index).type === 'header' ? HEADER_ROW_HEIGHT : ROW_HEIGHT),
    overscan: 12,
  })),
)

function onKeyDown(e: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
  // Swallow all arrow keys while focused — see GCODE_VIEWER_PLAN.md §5.3.
  // The global jog handler is already blocked via gcodeViewerFocused (set on
  // focus above), so this isn't load-bearing for safety, just for a clean UX
  // (no stray default scroll from Left/Right, no half-bound keys).
  e.preventDefault()
  if (e.key === 'ArrowUp') moveSelection(-1)
  else if (e.key === 'ArrowDown') moveSelection(1)
}

function moveSelection(delta: number) {
  const current = props.selectedIndex ?? -1
  const next = Math.min(Math.max(current + delta, 0), props.lines.length - 1)
  if (next !== props.selectedIndex) emit('select', next)
}

function onJumpToSection(value: string) {
  const startLine = Number(value)
  if (Number.isNaN(startLine)) return
  emit('select', startLine)
}

watch(() => props.selectedIndex, (idx) => {
  if (idx === null) return
  virtualizer.value.scrollToIndex(rowIndexForLine(idx), { align: 'auto' })
})
</script>
