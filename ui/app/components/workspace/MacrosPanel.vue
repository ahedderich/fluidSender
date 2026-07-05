<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex flex-col gap-2"
  >
    <!-- Header -->
    <div class="flex items-center justify-between shrink-0">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
        Macros
      </h2>
      <span v-if="sync.macroRun?.status === 'running'" class="flex items-center gap-1 text-[10px] text-blue-500 dark:text-blue-400">
        <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Running
      </span>
    </div>

    <!-- Macro buttons grid -->
    <div v-if="allMacros.length" class="grid grid-cols-2 gap-1.5 content-start flex-1">
      <button
        v-for="macro in allMacros"
        :key="macro.id"
        @click="handleMacroClick(macro)"
        :disabled="isMacroDisabled(macro)"
        class="relative px-2 py-2 rounded-lg text-xs font-medium transition-colors text-center leading-tight break-words min-h-[2.25rem] flex items-center justify-center group"
        :class="isMacroDisabled(macro)
          ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 opacity-50 cursor-not-allowed'
          : 'bg-gray-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-gray-700 dark:text-slate-300 cursor-pointer'"
      >
        <!-- Source badge -->
        <span
          class="absolute top-0.5 right-1 text-[9px] font-bold leading-none opacity-40 group-hover:opacity-60"
        >{{ macro.source }}</span>
        <!-- Tool change badge -->
        <span
          v-if="macro.requiresToolChange"
          class="absolute top-0.5 left-1"
          :title="'Requires active tool change mode'"
        >
          <svg class="w-2.5 h-2.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
        </span>
        <!-- Trigger kind badge -->
        <span
          v-if="macro.trigger.kind !== 'direct'"
          class="absolute bottom-0.5 right-1 text-[8px] opacity-50"
        >{{ macro.trigger.kind === 'confirm' ? '?' : '✎' }}</span>
        {{ macro.name }}
      </button>
    </div>

    <!-- Empty state -->
    <div v-else class="flex-1 flex flex-col items-center justify-center py-4 text-center gap-2">
      <svg class="w-6 h-6 text-gray-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
      <p class="text-xs text-gray-400 dark:text-slate-500">No macros configured</p>
      <RouterLink
        to="/settings"
        class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        Add in Settings
      </RouterLink>
    </div>

    <!-- Input form modal -->
    <DialogsMacroInputForm
      v-if="formMacro"
      :macro="formMacro"
      @submit="(fv) => { settings.runMacro(formMacro!.id, fv); formMacro = null }"
      @cancel="formMacro = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSettingsStore } from '~/stores/settings'
import { useSyncStore } from '~/stores/sync'
import { useConfirm } from '~/composables/useConfirm'
import { useCurrentUser } from '~/composables/useCurrentUser'
import type { Macro } from '~/types/macro'

const settings = useSettingsStore()
const sync = useSyncStore()
const { confirm } = useConfirm()
const currentUser = useCurrentUser()

const formMacro = ref<Macro | null>(null)

interface MacroWithSource extends Macro {
  source: string
}

const allMacros = computed<MacroWithSource[]>(() => [
  ...settings.app.macros.map((m) => ({ ...m, source: 'A' })),
  ...(settings.activeMachine?.macros ?? []).map((m) => ({ ...m, source: 'M' })),
])

function isMacroDisabled(macro: Macro): boolean {
  if (currentUser.value.isViewer) return true
  return macro.requiresToolChange && sync.job?.status !== 'tool_change'
}

async function handleMacroClick(macro: MacroWithSource) {
  if (isMacroDisabled(macro)) return

  const trigger = macro.trigger

  if (trigger.kind === 'direct') {
    settings.runMacro(macro.id)
  } else if (trigger.kind === 'confirm') {
    const ok = await confirm({
      title: macro.name,
      message: trigger.message ?? 'Run this macro?',
      confirmLabel: 'Run',
    })
    if (ok) settings.runMacro(macro.id)
  } else if (trigger.kind === 'form') {
    formMacro.value = macro
  }
}
</script>
