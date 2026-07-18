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
      class="flex-1 overflow-y-auto px-2 py-1.5 font-mono text-xs space-y-px min-h-0 focus:outline-none"
      @focus="gcodeViewerFocused = true"
      @blur="gcodeViewerFocused = false"
      @keydown="onKeyDown"
    >
      <template v-if="lines.length">
        <template v-for="line in lines" :key="line.index">
          <div
            v-if="sectionByStartLine.get(line.index)"
            class="flex items-baseline gap-1.5 px-1 py-1 mt-1 first:mt-0 bg-slate-700/60 rounded text-slate-300 text-[11px] font-sans"
          >
            <span class="font-semibold">
              T{{ sectionByStartLine.get(line.index)!.toolNumber }}
            </span>
            <span class="truncate">{{ sectionByStartLine.get(line.index)!.commentedName ?? '' }}</span>
            <span class="ml-auto shrink-0 text-slate-500">
              lines {{ sectionByStartLine.get(line.index)!.startLine + 1 }}–{{ sectionByStartLine.get(line.index)!.endLine + 1 }}
            </span>
          </div>
          <div
            :data-line-index="line.index"
            class="flex gap-1.5 leading-5 rounded px-1 cursor-pointer hover:bg-slate-700/50"
            :class="{ 'bg-blue-600/30': line.index === selectedIndex }"
            @click="emit('select', line.index)"
          >
            <span class="shrink-0 select-none w-12 text-right text-slate-500">{{ line.index + 1 }}</span>
            <span class="break-all text-slate-300">{{ line.raw }}</span>
          </div>
        </template>
      </template>
      <div v-else class="text-slate-500 px-1 py-1">No GCode loaded</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GCodeLine, ToolSection } from '~/types/job'
import { useGcodeViewerFocus } from '~/composables/useGcodeViewerFocus'

const props = defineProps<{
  lines: GCodeLine[]
  toolSections: ToolSection[] | null
  selectedIndex: number | null
}>()
const emit = defineEmits<{ select: [index: number] }>()

const { gcodeViewerFocused } = useGcodeViewerFocus()

const scrollEl = ref<HTMLDivElement | null>(null)

const sectionByStartLine = computed(() => {
  const m = new Map<number, ToolSection>()
  for (const s of props.toolSections ?? []) m.set(s.startLine, s)
  return m
})

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

watch(() => props.selectedIndex, async (idx) => {
  if (idx === null) return
  await nextTick()
  scrollEl.value?.querySelector(`[data-line-index="${idx}"]`)?.scrollIntoView({ block: 'nearest' })
})
</script>
