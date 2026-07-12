<template>
  <SettingsCard title="Profile">
    <SettingsRow label="Machine Name">
      <input v-model="machine.name" type="text" class="settings-input w-48" />
    </SettingsRow>
    <SettingsRow label="Machine Type">
      <select v-model="machine.type" class="settings-input w-48">
        <option value="router">CNC Router</option>
        <option value="laser">Laser Engraver</option>
        <option value="plasma">Plasma Cutter</option>
      </select>
    </SettingsRow>
  </SettingsCard>

  <SettingsCard title="Connection">
    <SettingsRow label="Type">
      <div class="flex rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 text-xs font-medium">
        <button
          type="button"
          @click="machine.connection.type = 'usb'"
          :class="machine.connection.type === 'usb' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
          class="px-3 py-1.5 transition-colors"
        >USB Serial</button>
        <button
          type="button"
          @click="machine.connection.type = 'tcp'"
          :class="machine.connection.type === 'tcp' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
          class="px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-slate-600"
        >TCP / WiFi</button>
      </div>
    </SettingsRow>
    <template v-if="machine.connection.type === 'usb'">
      <SettingsRow label="Serial Port">
        <div class="flex items-center gap-2">
          <select
            v-if="availablePorts.length > 0"
            v-model="machine.connection.serialPort"
            class="settings-input w-48 font-mono"
          >
            <option value="">— select port —</option>
            <option v-for="p in availablePorts" :key="p.path" :value="p.path">
              {{ p.path }}{{ p.manufacturer ? ` (${p.manufacturer})` : '' }}
            </option>
          </select>
          <input
            v-else
            v-model="machine.connection.serialPort"
            type="text"
            class="settings-input w-48 font-mono"
            placeholder="/dev/ttyUSB0"
          />
          <button
            type="button"
            @click="refreshPorts"
            :disabled="loadingPorts"
            class="p-1.5 rounded text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
            title="Refresh ports"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" :class="{ 'animate-spin': loadingPorts }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <p v-if="availablePorts.length === 0 && !loadingPorts" class="mt-1 text-xs text-gray-400 dark:text-slate-500">
          No ports detected — enter path manually or click refresh
        </p>
      </SettingsRow>
      <SettingsRow label="Baud Rate">
        <select v-model.number="machine.connection.baudRate" class="settings-input w-32">
          <option :value="115200">115 200</option>
          <option :value="921600">921 600</option>
        </select>
      </SettingsRow>
    </template>
    <template v-else>
      <div class="mx-3 mb-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-md">
        <p class="text-xs text-amber-700 dark:text-amber-400 font-medium">TCP/WiFi is less stable than USB. Use USB when possible.</p>
      </div>
      <SettingsRow label="Host">
        <input v-model="machine.connection.tcpHost" type="text" class="settings-input w-48 font-mono" placeholder="192.168.1.100" />
      </SettingsRow>
      <SettingsRow label="Port">
        <input v-model.number="machine.connection.tcpPort" type="number" class="settings-input w-24 font-mono" />
      </SettingsRow>
    </template>
  </SettingsCard>

  <SettingsCard title="Firmware">
    <SettingsRow label="Current Version">
      <span class="text-sm font-mono text-gray-600 dark:text-slate-400">
        {{ machine.lastKnownFirmwareVersion ? `v${machine.lastKnownFirmwareVersion}` : 'Unknown — connect at least once' }}
      </span>
    </SettingsRow>
    <SettingsRow label="Latest Release">
      <div class="flex items-center gap-2">
        <span class="text-sm font-mono text-gray-600 dark:text-slate-400">
          {{ machine.firmwareUpdateCheck?.latestVersion ? `v${machine.firmwareUpdateCheck.latestVersion}` : '—' }}
        </span>
        <span
          v-if="updateAvailable"
          class="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
        >Update available</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Last Checked">
      <span class="text-xs text-gray-500 dark:text-slate-400">{{ lastCheckedLabel }}</span>
    </SettingsRow>
    <div class="px-3 pb-3">
      <button
        type="button"
        @click="machineStore.checkFirmwareUpdate(machine.id)"
        class="px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 transition-colors"
      >
        Check for Updates
      </button>
    </div>
  </SettingsCard>

  <SettingsCard title="Network">
    <p class="px-3 pt-2 pb-1 text-[11px] text-gray-400 dark:text-slate-500 italic">
      Latest boot information — reflects the last successful connect, not necessarily the current state.
    </p>
    <SettingsRow label="Config Status">
      <span v-if="!machine.bootInfo" class="text-sm text-gray-400 dark:text-slate-500">Unknown — connect at least once</span>
      <span v-else-if="machine.bootInfo.configValid" class="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">Valid</span>
      <span
        v-else
        class="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 max-w-56 truncate"
        :title="machine.bootInfo.configError ?? undefined"
      >Invalid — {{ machine.bootInfo.configError ?? 'see boot log' }}</span>
    </SettingsRow>
    <SettingsRow label="Network Mode">
      <span class="text-sm font-mono text-gray-600 dark:text-slate-400">{{ networkModeLabel }}</span>
    </SettingsRow>
    <SettingsRow label="SSID">
      <span class="text-sm font-mono text-gray-600 dark:text-slate-400">{{ machine.bootInfo?.ssid ?? '—' }}</span>
    </SettingsRow>
    <SettingsRow label="IP Address">
      <span class="text-sm font-mono text-gray-600 dark:text-slate-400">{{ machine.bootInfo?.ip ?? '—' }}</span>
    </SettingsRow>
    <SettingsRow label="HTTP Server">
      <span class="text-sm font-mono text-gray-600 dark:text-slate-400">
        {{ machine.bootInfo?.httpPort ? `Running on port ${machine.bootInfo.httpPort}` : '—' }}
      </span>
    </SettingsRow>
    <div v-if="webUiUrl" class="px-3 pb-3">
      <a
        :href="webUiUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-block px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 transition-colors"
      >
        Open FluidNC WebUI ↗
      </a>
    </div>
  </SettingsCard>

</template>

<script setup lang="ts">
import type { MachineProfile } from '~/stores/settings'
import { useMachineStore } from '~/stores/machine'
import { isNewerVersion } from '~~/shared/version'

const machine = defineModel<MachineProfile>('machine', { required: true })
const machineStore = useMachineStore()

const updateAvailable = computed(() => {
  const latest = machine.value.firmwareUpdateCheck?.latestVersion
  const current = machine.value.lastKnownFirmwareVersion
  return !!latest && !!current && isNewerVersion(latest, current)
})

const lastCheckedLabel = computed(() => {
  const checkedAt = machine.value.firmwareUpdateCheck?.checkedAt
  return checkedAt ? new Date(checkedAt).toLocaleString() : 'Never checked'
})

const networkModeLabel = computed(() => {
  const mode = machine.value.bootInfo?.networkMode
  if (mode === 'sta') return 'WiFi (Station)'
  if (mode === 'ap') return 'WiFi (Access Point)'
  return '—'
})

const webUiUrl = computed(() => {
  const info = machine.value.bootInfo
  if (!info?.ip || !info?.httpPort) return null
  return `http://${info.ip}:${info.httpPort}/`
})

interface SerialPortInfo {
  path: string
  manufacturer: string | null
}

const availablePorts = ref<SerialPortInfo[]>([])
const loadingPorts = ref(false)

async function refreshPorts() {
  loadingPorts.value = true
  try {
    availablePorts.value = await $fetch<SerialPortInfo[]>('/api/serial-ports')
  } catch {
    availablePorts.value = []
  } finally {
    loadingPorts.value = false
  }
}

onMounted(() => {
  if (machine.value.connection.type === 'usb') {
    refreshPorts()
  }
})

watch(
  () => machine.value.connection.type,
  (type) => {
    if (type === 'usb') refreshPorts()
  },
)
</script>
