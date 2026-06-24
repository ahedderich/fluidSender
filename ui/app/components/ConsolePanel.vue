<template>
  <div
    class="bg-slate-800 dark:bg-slate-800 bg-white rounded-lg border border-slate-700 dark:border-slate-700 border-gray-200 flex flex-col shrink-0 min-h-0"
  >
    <div class="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-slate-700 dark:border-slate-700 border-gray-100 shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-400 text-gray-500">
        Console
      </h2>
      <button
        @click="machine.consoleLog.splice(0)"
        class="text-xs text-slate-500 dark:text-slate-500 text-gray-400 hover:text-slate-300 dark:hover:text-slate-300 hover:text-gray-600 transition-colors"
      >
        Clear
      </button>
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
            'text-blue-400 dark:text-blue-400 text-blue-600': entry.type === 'sent',
            'text-slate-300 dark:text-slate-300 text-gray-700': entry.type === 'recv',
            'text-slate-500 dark:text-slate-500 text-gray-400': entry.type === 'info',
            'text-red-400 dark:text-red-400 text-red-600': entry.type === 'error',
          }"
          class="shrink-0 select-none"
        >{{ entry.type === 'sent' ? '►' : entry.type === 'error' ? '✕' : '◄' }}</span>
        <span
          :class="{
            'text-blue-300 dark:text-blue-300 text-blue-700': entry.type === 'sent',
            'text-slate-200 dark:text-slate-200 text-gray-800': entry.type === 'recv',
            'text-slate-400 dark:text-slate-400 text-gray-500': entry.type === 'info',
            'text-red-300 dark:text-red-300 text-red-700': entry.type === 'error',
          }"
          class="break-all"
        >{{ entry.text }}</span>
      </div>

      <div v-if="!autoScroll" class="sticky bottom-0 flex justify-center py-1">
        <button
          @click="scrollToBottom"
          class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-full shadow-lg transition-colors"
        >
          ↓ Jump to latest
        </button>
      </div>
    </div>

    <!-- Input -->
    <div class="flex gap-2 p-2 border-t border-slate-700 dark:border-slate-700 border-gray-100 shrink-0">
      <input
        v-model="inputCmd"
        @keydown.enter="sendCmd"
        @keydown.up="historyUp"
        @keydown.down="historyDown"
        placeholder="Send command..."
        class="flex-1 bg-slate-900 dark:bg-slate-900 bg-gray-50 border border-slate-600 dark:border-slate-600 border-gray-200 text-slate-200 dark:text-slate-200 text-gray-900 text-xs font-mono px-2.5 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-600 dark:placeholder-slate-600 placeholder-gray-300"
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
