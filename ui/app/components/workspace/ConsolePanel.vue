<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col min-h-0"
  >
    <div class="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Console
      </h2>
      <div class="flex items-center gap-3">
        <button
          @click="toggleFollow"
          class="text-xs transition-colors"
          :class="autoScroll
            ? 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
            : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'"
          title="Toggle auto-scroll to latest"
        >
          {{ autoScroll ? '↓ Following' : '↓ Paused' }}
        </button>
        <button
          @click="machine.clearConsole()"
          :disabled="isViewer"
          class="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>
    </div>

    <!-- Log area -->
    <div
      ref="scrollEl"
      @scroll="onScroll"
      class="flex-1 overflow-y-auto px-2 py-1.5 font-mono text-xs space-y-px min-h-0"
    >
      <div
        v-for="entry in machine.consoleLog"
        :key="entry.id"
        class="flex gap-1.5 leading-5 rounded px-1"
        :class="{
          'bg-blue-50 dark:bg-blue-950/30': entry.type === 'sent',
        }"
      >
        <span class="shrink-0 select-none w-3 text-center" :class="prefixClass(entry.type)">
          {{ prefixChar(entry.type) }}
        </span>
        <span class="break-all" :class="textClass(entry.type)">{{ entry.text }}</span>
      </div>
    </div>

    <!-- Input -->
    <div class="flex gap-2 p-2 border-t border-gray-100 dark:border-slate-700 shrink-0">
      <input
        v-model="inputCmd"
        @keydown.enter="sendCmd"
        @keydown.up.prevent="historyUp"
        @keydown.down.prevent="historyDown"
        :disabled="isViewer"
        placeholder="Send command..."
        class="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-xs font-mono px-2.5 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-300 dark:placeholder-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
      />
      <button
        @click="sendCmd"
        :disabled="isViewer"
        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useCurrentUser } from '~/composables/useCurrentUser'
import type { SyncConsoleEntry } from '~/stores/sync'

const machine = useMachineStore()
const currentUser = useCurrentUser()
const isViewer = computed(() => currentUser.value.isViewer)
const scrollEl = ref<HTMLDivElement>()
const inputCmd = ref('')
const autoScroll = ref(true)
const cmdHistory = ref<string[]>([])
const historyIndex = ref(-1)

function prefixChar(type: SyncConsoleEntry['type']): string {
  if (type === 'sent') return '>'
  if (type === 'recv') return '<'
  if (type === 'error') return '!'
  return '·'
}

function prefixClass(type: SyncConsoleEntry['type']): string {
  if (type === 'sent') return 'text-blue-500 dark:text-blue-400 font-bold'
  if (type === 'recv') return 'text-emerald-600 dark:text-emerald-400 font-bold'
  if (type === 'error') return 'text-red-500 dark:text-red-400 font-bold'
  return 'text-gray-400 dark:text-slate-500'
}

function textClass(type: SyncConsoleEntry['type']): string {
  if (type === 'sent') return 'text-blue-800 dark:text-blue-200'
  if (type === 'recv') return 'text-gray-800 dark:text-slate-100'
  if (type === 'error') return 'text-red-700 dark:text-red-300'
  return 'text-gray-500 dark:text-slate-400 italic'
}

function onScroll() {
  if (!scrollEl.value) return
  const { scrollTop, scrollHeight, clientHeight } = scrollEl.value
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 60
}

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) {
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  }
}

async function toggleFollow() {
  if (autoScroll.value) {
    autoScroll.value = false
  } else {
    autoScroll.value = true
    await scrollToBottom()
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
