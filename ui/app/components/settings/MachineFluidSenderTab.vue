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
        <input v-model="machine.connection.serialPort" type="text" class="settings-input w-48 font-mono" placeholder="/dev/ttyUSB0" />
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

</template>

<script setup lang="ts">
import type { MachineProfile } from '~/stores/settings'

const machine = defineModel<MachineProfile>('machine', { required: true })
</script>
