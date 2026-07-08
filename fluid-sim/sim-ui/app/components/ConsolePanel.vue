<template>
  <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0">
    <!-- Header -->
    <div class="px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0 flex items-center justify-between gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Console
      </h2>
      <div class="flex items-center gap-3">
        <button
          @click="suppressPoll = !suppressPoll"
          class="text-xs transition-colors"
          :class="suppressPoll
            ? 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
            : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'"
          title="Toggle visibility of ? status poll messages"
        >
          {{ suppressPoll ? 'Poll hidden' : 'Poll shown' }}
        </button>
        <span class="text-[10px] text-gray-400 dark:text-slate-500">{{ visibleLog.length }} lines</span>
        <button
          class="text-[11px] text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
          @click="s.clearConsole()"
        >
          Clear
        </button>
      </div>
    </div>

    <!-- Log -->
    <div ref="scroller" class="flex-1 overflow-y-auto min-h-0 font-mono text-xs px-2 py-1.5 space-y-px">
      <p v-if="!visibleLog.length" class="text-gray-400 dark:text-slate-500 px-1 py-2">
        Waiting for FluidNC traffic…
      </p>
      <div
        v-for="(line, i) in visibleLog"
        :key="i"
        class="flex items-baseline gap-1.5 px-1 leading-relaxed rounded"
        :class="{ 'bg-blue-50 dark:bg-blue-950/30': line.dir === 'rx' }"
      >
        <span
          class="shrink-0 select-none w-3 text-center font-bold"
          :class="line.dir === 'rx'
            ? 'text-blue-500 dark:text-blue-400'
            : 'text-emerald-600 dark:text-emerald-400'"
          :title="line.dir === 'rx' ? `received from ${line.source}` : `sent to ${line.source}`"
        >
          {{ line.dir === 'rx' ? '>' : '<' }}
        </span>
        <span
          class="whitespace-pre-wrap break-all"
          :class="line.dir === 'rx'
            ? 'text-blue-800 dark:text-blue-200'
            : 'text-gray-800 dark:text-slate-100'"
        >{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useSimStore } from '~/stores/sim'
import type { ConsoleLine } from '~/stores/sim'

const s = useSimStore()
const scroller = ref<HTMLElement | null>(null)
const suppressPoll = ref(true)

function isPoll(line: ConsoleLine): boolean {
  if (line.dir === 'rx' && line.text.trim() === '?') return true
  if (line.dir === 'tx' && line.text.startsWith('<') && line.text.endsWith('>')) return true
  return false
}

const visibleLog = computed(() =>
  suppressPoll.value ? s.consoleLog.filter((l) => !isPoll(l)) : s.consoleLog,
)

watch(
  () => visibleLog.value.length,
  async () => {
    await nextTick()
    const el = scroller.value
    if (el) el.scrollTop = el.scrollHeight
  },
)
</script>
