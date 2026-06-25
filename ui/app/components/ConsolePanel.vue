<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <div class="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Console
      </h2>
      <div class="flex items-center gap-2">
        <button
          @click="scrollToBottom"
          class="text-xs text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          title="Jump to latest"
        >
          ↓ Latest
        </button>
        <button
          @click="machine.consoleLog.splice(0)"
          class="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
        >
          Clear
        </button>
      </div>
    </div>

    <!-- Log area -->
    <div
      ref="scrollEl"
      @scroll="onScroll"
      class="flex-1 overflow-y-auto px-2 py-1.5 font-mono text-xs space-y-0.5 min-h-0"
    >
      <div
        v-for="entry in machine.consoleLog"
        :key="entry.id"
        class="flex gap-1.5 leading-5"
      >
        <span
          :class="{
            'text-blue-600 dark:text-blue-400': entry.type === 'sent',
            'text-gray-700 dark:text-slate-300': entry.type === 'recv',
            'text-gray-400 dark:text-slate-500': entry.type === 'info',
            'text-red-600 dark:text-red-400': entry.type === 'error',
          }"
          class="shrink-0 select-none"
        >{{ entry.type === 'sent' ? '►' : entry.type === 'error' ? '✕' : '◄' }}</span>
        <span
          :class="{
            'text-blue-700 dark:text-blue-300': entry.type === 'sent',
            'text-gray-800 dark:text-slate-200': entry.type === 'recv',
            'text-gray-500 dark:text-slate-400': entry.type === 'info',
            'text-red-700 dark:text-red-300': entry.type === 'error',
          }"
          class="break-all"
        >{{ entry.text }}</span>
      </div>
    </div>

    <!-- Input -->
    <div class="flex gap-2 p-2 border-t border-gray-100 dark:border-slate-700 shrink-0">
      <input
        v-model="inputCmd"
        @keydown.enter="sendCmd"
        @keydown.up="historyUp"
        @keydown.down="historyDown"
        placeholder="Send command..."
        class="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-xs font-mono px-2.5 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-300 dark:placeholder-slate-600"
      />
      <button
        @click="sendCmd"
        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors"
      >
        Send
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'

const machine = useMachineStore()
const scrollEl = ref<HTMLDivElement>()
const inputCmd = ref('')
const autoScroll = ref(true)
const cmdHistory = ref<string[]>([])
const historyIndex = ref(-1)

function onScroll() {
  if (!scrollEl.value) return
  const { scrollTop, scrollHeight, clientHeight } = scrollEl.value
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 60
}

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) {
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight
    autoScroll.value = true
  }
}

watch(
  () => machine.consoleLog.length,
  async () => {
    if (autoScroll.value) await scrollToBottom()
  },
)

function sendCmd() {
  const cmd = inputCmd.value.trim()
  if (!cmd) return
  cmdHistory.value.unshift(cmd)
  if (cmdHistory.value.length > 50) cmdHistory.value.pop()
  historyIndex.value = -1
  machine.sendCommand(cmd)
  inputCmd.value = ''
}

function historyUp() {
  if (historyIndex.value < cmdHistory.value.length - 1) {
    historyIndex.value++
    inputCmd.value = cmdHistory.value[historyIndex.value]
  }
}

function historyDown() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    inputCmd.value = cmdHistory.value[historyIndex.value]
  } else {
    historyIndex.value = -1
    inputCmd.value = ''
  }
}
</script>
