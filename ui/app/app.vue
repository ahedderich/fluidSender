<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { useUiStore } from '~/stores/ui'
import { useMachineStore } from '~/stores/machine'
import { useSettingsStore } from '~/stores/settings'

const ui = useUiStore()
const machine = useMachineStore()
const settings = useSettingsStore()

useHead({
  htmlAttrs: {
    class: computed(() => (ui.darkMode ? 'dark' : '')),
  },
  title: computed(() =>
    machine.connected && settings.activeMachine?.name
      ? `${settings.activeMachine.name} - FluidSender`
      : 'FluidSender',
  ),
})
</script>
