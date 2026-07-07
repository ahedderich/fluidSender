<template>
  <SettingsCard :title="scope === 'app' ? 'App Macros' : 'Machine Macros'">
    <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
      <div
        v-for="macro in macros"
        :key="macro.id"
        class="flex items-center gap-3 px-3 py-2.5"
      >
        <div class="flex-1 min-w-0 flex items-center gap-2">
          <p class="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{{ macro.name }}</p>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 shrink-0">{{ macro.trigger.kind }}</span>
          <svg v-if="macro.requiresToolChange" class="w-3 h-3 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" title="Requires tool change mode">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
        </div>
        <button
          type="button"
          @click="emit('open-macro-editor', macro, scope, machineId)"
          class="p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 rounded transition-colors shrink-0"
          title="Edit macro"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </button>
        <button
          type="button"
          @click="removeMacro(macro.id)"
          class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors shrink-0"
          title="Remove macro"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div v-if="macros.length === 0" class="px-3 py-4 text-center text-xs text-gray-400 dark:text-slate-500">
        No {{ scope === 'app' ? 'app' : 'machine' }} macros configured
      </div>
    </div>
    <div class="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-slate-700/60">
      <button
        type="button"
        @click="emit('open-macro-editor', null, scope, machineId)"
        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
      >
        Add Macro
      </button>
    </div>
  </SettingsCard>

  <p class="text-xs text-gray-400 dark:text-slate-500 pb-2">
    {{ scope === 'app'
      ? 'App macros are shared across all machines and available to all connected clients.'
      : 'Machine macros are specific to this machine.' }}
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '~/stores/settings'
import type { Macro } from '~/types/macro'

const props = defineProps<{
  scope: 'app' | 'machine'
  machineId?: string
}>()

const emit = defineEmits<{
  'open-macro-editor': [macro: Macro | null, scope: 'app' | 'machine', machineId?: string]
}>()

const s = useSettingsStore()

const macros = computed<Macro[]>(() => {
  if (props.scope === 'app') return s.app.macros
  return s.machines.find((m) => m.id === props.machineId)?.macros ?? []
})

function removeMacro(id: string) {
  if (props.scope === 'app') {
    s.removeAppMacro(id)
  } else if (props.machineId) {
    s.removeMachineMacro(props.machineId, id)
  }
  s.save()
}
</script>
