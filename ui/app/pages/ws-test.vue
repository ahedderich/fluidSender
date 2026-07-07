<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWebSocket } from '@vueuse/core'

const value = ref<number | null>(null)

const { status, send, open } = useWebSocket('/ws-test', {
  immediate: false,
  autoReconnect: true,
  onMessage(_ws, event) {
    try {
      const msg = JSON.parse(event.data) as { type: string; value: number }
      if (msg.type === 'value') value.value = msg.value
    } catch {
      // ignore non-JSON frames
    }
  },
})

onMounted(() => open())

function increment() {
  send('increment')
}
</script>

<template>
  <div class="mx-auto max-w-md space-y-6 p-8">
    <h1 class="text-2xl font-bold">WebSocket sync test</h1>

    <div class="space-y-1">
      <p>
        Connection status:
        <span
          class="font-mono"
          :class="{
            'text-green-600': status === 'OPEN',
            'text-amber-600': status === 'CONNECTING',
            'text-red-600': status === 'CLOSED',
          }"
          >{{ status }}</span
        >
      </p>
      <p>
        Server-synced value:
        <span class="font-mono text-xl">{{ value ?? '—' }}</span>
      </p>
    </div>

    <button
      class="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      :disabled="status !== 'OPEN'"
      @click="increment"
    >
      Increment
    </button>

    <p class="text-sm text-gray-500">
      Open this page in two tabs — incrementing in one updates both, proving
      server-authoritative broadcast.
    </p>
  </div>
</template>
