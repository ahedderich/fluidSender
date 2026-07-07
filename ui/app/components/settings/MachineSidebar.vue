<template>
  <aside class="w-64 flex-none flex flex-col border-r border-gray-200 dark:border-slate-700">
    <div class="px-4 py-3.5 border-b border-gray-200 dark:border-slate-700">
      <h2 class="text-sm font-semibold text-gray-900 dark:text-slate-100">Settings</h2>
    </div>

    <div class="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
      <p class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 px-2 pb-1.5">
        Machines
      </p>

      <button
        v-for="m in machines"
        :key="m.id"
        type="button"
        @click="emit('update:panel', m.id)"
        class="w-full text-left px-2.5 py-2.5 rounded-lg transition-colors"
        :class="panel === m.id
          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50'"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="w-2 h-2 rounded-full shrink-0"
            :class="isMachineConnected(m.id) ? 'bg-emerald-400' : 'bg-gray-300 dark:bg-slate-600'"
          />
          <span class="text-sm font-medium truncate">{{ m.name }}</span>
        </div>
        <div class="text-xs text-gray-400 dark:text-slate-500 mt-0.5 ml-4 truncate">
          <template v-if="m.connection.type === 'usb'">
            USB · {{ m.connection.serialPort || 'no port' }}
          </template>
          <template v-else>
            TCP · {{ m.connection.tcpHost || 'no host' }}
          </template>
        </div>
      </button>

      <button
        type="button"
        @click="emit('add')"
        class="w-full text-left flex items-center gap-2 px-2.5 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors mt-1"
      >
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Machine
      </button>
    </div>

    <div class="border-t border-gray-200 dark:border-slate-700 p-2">
      <button
        type="button"
        @click="emit('update:panel', 'app')"
        class="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors"
        :class="panel === 'app'
          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/50'"
      >
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        App Settings
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import type { MachineProfile } from '~/stores/settings'

defineProps<{
  panel: string
  machines: MachineProfile[]
}>()

const emit = defineEmits<{
  'update:panel': [id: string]
  'add': []
  'remove': [id: string]
}>()

const machine = useMachineStore()

function isMachineConnected(id: string): boolean {
  return machine.connected && machine.connectedMachineId === id
}
</script>
