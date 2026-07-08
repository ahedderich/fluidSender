<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { connect, disconnect } = useSimConnection()

onMounted(() => { connect() })
onUnmounted(() => { disconnect() })
</script>
