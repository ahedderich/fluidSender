<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { useSimStore } from '~/stores/sim'

const { connect, disconnect } = useSimConnection()
const sim = useSimStore()

// Load persisted tool/tool-setter config before connecting — the WS connect-time
// re-push must send saved config, not this store's in-memory defaults.
onMounted(async () => {
  await sim.loadPersistedConfig()
  connect()
})
onUnmounted(() => { disconnect() })
</script>
