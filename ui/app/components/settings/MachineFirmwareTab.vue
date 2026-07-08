<template>
  <div v-if="!machine.fluidncConfig" class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-8 text-center space-y-3">
    <p class="text-sm text-gray-400 dark:text-slate-500">Connect to load firmware configuration</p>
    <button
      v-if="isConnected"
      type="button"
      @click="machineStore.reloadFirmwareConfig()"
      class="px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 transition-colors"
    >
      Load from FluidNC
    </button>
  </div>

  <template v-else>
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-mono text-gray-500 dark:text-slate-400">{{ machine.fluidncConfig.name ?? 'config.yaml' }}</span>
      <button
        type="button"
        @click="downloadConfig"
        class="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 transition-colors"
      >
        Download ↓
      </button>
    </div>

    <div class="bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-auto max-h-[60vh]">
      <pre class="p-3 text-xs font-mono text-gray-700 dark:text-slate-300 whitespace-pre">{{ machine.fluidncConfig.rawYaml }}</pre>
    </div>

    <div class="flex gap-2 pt-2 pb-2">
      <button
        type="button"
        :disabled="!isConnected"
        @click="machineStore.reloadFirmwareConfig()"
        class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
        :class="isConnected
          ? 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 opacity-40 cursor-not-allowed'"
      >
        Read from FluidNC
      </button>
      <button
        type="button"
        :disabled="!isConnected || !machine.fluidncIp"
        :title="!machine.fluidncIp ? 'Upload requires WiFi connection' : 'Upload config and reboot'"
        @click="uploadConfig"
        class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
        :class="isConnected && machine.fluidncIp
          ? 'bg-blue-600 hover:bg-blue-500 text-white'
          : 'bg-blue-600 text-white opacity-40 cursor-not-allowed'"
      >
        Upload &amp; Reboot
      </button>
    </div>
  </template>
</template>

<script setup lang="ts">
import { useConfirm } from '~/composables/useConfirm'
import { useMachineStore } from '~/stores/machine'
import type { MachineProfile } from '~/stores/settings'

const props = defineProps<{
  machine: MachineProfile
  isConnected: boolean
}>()

const { confirm } = useConfirm()
const machineStore = useMachineStore()

function downloadConfig() {
  const yaml = props.machine.fluidncConfig?.rawYaml as string | undefined
  if (!yaml) return
  const blob = new Blob([yaml], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'config.yaml'
  a.click()
  URL.revokeObjectURL(url)
}

async function uploadConfig() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.yaml,.yml'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const confirmed = await confirm({
      title: 'Upload config and reboot?',
      message: `This will replace config.yaml on the FluidNC controller and immediately reboot it. The machine will be unreachable for ~10 seconds.`,
      confirmLabel: 'Upload & Reboot',
    })
    if (!confirmed) return
    const formData = new FormData()
    formData.append('config', file, file.name)
    const res = await fetch('/machine/config-upload', { method: 'POST', body: formData })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Upload failed' }))
      machineStore.addConsole('error', `Config upload failed: ${(err as { message?: string }).message ?? 'unknown error'}`)
    } else {
      machineStore.sendCommand('$BYE')
    }
  }
  input.click()
}
</script>
