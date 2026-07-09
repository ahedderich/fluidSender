<template>
  <div class="contents">
  <main class="flex-1 flex min-h-0 overflow-hidden">

    <!-- Sidebar: machine list + app settings nav -->
    <SettingsMachineSidebar
      v-model:panel="panel"
      :machines="s.machines"
      @add="addMachine"
      @remove="removeMachine"
    />

    <!-- Right panel -->
    <section class="flex-1 overflow-y-auto">

      <!-- ── No machines yet ── -->
      <div v-if="!editingMachine && panel !== 'app'" class="flex-1 flex items-center justify-center p-8">
        <div class="text-center max-w-xs">
          <div class="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-5">
            <svg class="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          </div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-slate-100 mb-2">Add your first machine</h2>
          <p class="text-sm text-gray-500 dark:text-slate-400 mb-6 leading-relaxed">
            Configure a connection to your FluidNC controller to get started.
          </p>
          <button
            type="button"
            @click="addMachine"
            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Add Machine
          </button>
        </div>
      </div>

      <!-- ── Machine Settings ── -->
      <div v-else-if="editingMachine" class="p-5 space-y-4 max-w-3xl">

        <!-- Machine header -->
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-slate-100">{{ editingMachine.name }}</h2>
            <p class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Machine configuration</p>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="text-xs px-2 py-1 rounded-full font-medium"
              :class="isEditingConnected
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'"
            >{{ isEditingConnected ? 'Connected' : 'Offline' }}</span>
            <button
              type="button"
              @click="removeMachine(editingMachine.id)"
              class="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="Remove machine"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Machine tabs -->
        <div class="flex gap-0 border-b border-gray-200 dark:border-slate-700">
          <button
            v-for="tab in machineTabs"
            :key="tab.key"
            type="button"
            @click="machineTab = tab.key"
            class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            :class="machineTab === tab.key
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'"
          >
            {{ tab.label }}
          </button>
        </div>

        <SettingsMachineFluidSenderTab
          v-if="machineTab === 'fluidSender'"
          :machine="editingMachine"
        />

        <SettingsMachineGeneralTab
          v-else-if="machineTab === 'machine'"
          :machine="editingMachine"
        />

        <SettingsMachineToolchangeTab
          v-else-if="machineTab === 'toolchange'"
          :machine="editingMachine"
        />

        <SettingsMachineFirmwareTab
          v-else-if="machineTab === 'firmware'"
          :machine="editingMachine"
          :is-connected="isEditingConnected"
        />

        <SettingsMacrosTab
          v-else-if="machineTab === 'macros'"
          scope="machine"
          :machine-id="editingMachine.id"
          @open-macro-editor="openMacroEditor"
        />

        <!-- Save Machine Settings -->
        <div class="pb-2 pt-1">
          <button
            type="button"
            @click="saveMachineSettings"
            :disabled="s.saving"
            class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ s.saving ? 'Saving…' : 'Save Machine Settings' }}
          </button>
          <p v-if="saveError" class="mt-2 text-xs text-red-500 dark:text-red-400 text-center">{{ saveError }}</p>
          <p v-if="saveSuccess" class="mt-2 text-xs text-emerald-600 dark:text-emerald-400 text-center">Settings saved.</p>
        </div>
      </div>

      <!-- ── App Settings ── -->
      <div v-else-if="panel === 'app'" class="p-5 space-y-4 max-w-2xl">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-slate-100">App Settings</h2>
          <p class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Synced to all connected clients via Bun server</p>
        </div>

        <!-- App tabs -->
        <div class="flex gap-0 border-b border-gray-200 dark:border-slate-700">
          <button
            v-for="tab in appTabs"
            :key="tab.key"
            type="button"
            @click="appTab = tab.key"
            class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            :class="appTab === tab.key
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'"
          >
            {{ tab.label }}
          </button>
        </div>

        <SettingsAppInterfaceTab v-if="appTab === 'interface'" />
        <SettingsAppJogTab v-else-if="appTab === 'jog'" />
        <SettingsMacrosTab v-else-if="appTab === 'macros'" scope="app" @open-macro-editor="openMacroEditor" />
        <SettingsAppAuthTab v-else-if="appTab === 'auth'" />
        <SettingsAppShortcutsTab v-else-if="appTab === 'shortcuts'" />

        <div class="pb-2">
          <button
            type="button"
            @click="saveAppSettings"
            :disabled="s.saving"
            class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ s.saving ? 'Saving…' : 'Save App Settings' }}
          </button>
          <p v-if="saveSuccess" class="mt-2 text-xs text-emerald-600 dark:text-emerald-400 text-center">Settings saved.</p>
        </div>
      </div>

    </section>
  </main>

  <!-- Macro editor modal -->
  <DialogsMacroEditor
    v-if="macroEditorOpen"
    :macro="macroEditorMacro"
    :scope="macroEditorScope"
    :machine-id="macroEditorMachineId"
    @close="macroEditorOpen = false"
  />
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'
import { useMachineStore } from '~/stores/machine'
import { useConfirm } from '~/composables/useConfirm'
import { useCurrentUser } from '~/composables/useCurrentUser'
import type { Macro } from '~/types/macro'

const s = useSettingsStore()
const machine = useMachineStore()
const { confirm } = useConfirm()
const currentUser = useCurrentUser()

const panel = ref<string>(s.activeMachineId || (s.machines[0]?.id ?? ''))

const editingMachine = computed(() => {
  if (panel.value === 'app') return null
  return s.machines.find((m) => m.id === panel.value) ?? null
})

const isEditingConnected = computed(
  () => machine.connected && editingMachine.value?.id === s.activeMachineId,
)

function addMachine() {
  s.addMachine()
  panel.value = s.activeMachineId
}

async function removeMachine(id: string) {
  const m = s.machines.find((mc) => mc.id === id)
  const ok = await confirm({
    title: `Remove "${m?.name ?? 'machine'}"?`,
    message: 'This will permanently delete the machine profile and all its settings.',
    confirmLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  s.removeMachine(id)
  await s.save()
  panel.value = s.activeMachineId || ''
}

const saveError = ref('')
const saveSuccess = ref(false)
let saveSuccessTimer: ReturnType<typeof setTimeout> | null = null

async function saveMachineSettings() {
  saveError.value = ''
  saveSuccess.value = false
  try {
    await s.save()
    saveSuccess.value = true
    if (saveSuccessTimer) clearTimeout(saveSuccessTimer)
    saveSuccessTimer = setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch {
    saveError.value = 'Failed to save settings. Check server connection.'
  }
}

async function saveAppSettings() {
  saveError.value = ''
  saveSuccess.value = false
  try {
    await s.save()
    saveSuccess.value = true
    if (saveSuccessTimer) clearTimeout(saveSuccessTimer)
    saveSuccessTimer = setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch {
    saveError.value = 'Failed to save settings.'
  }
}

const machineTabs: Array<{ key: 'fluidSender' | 'machine' | 'toolchange' | 'firmware' | 'macros'; label: string }> = [
  { key: 'fluidSender', label: 'FluidSender' },
  { key: 'machine', label: 'Machine' },
  { key: 'toolchange', label: 'Tool Change' },
  { key: 'firmware', label: 'Firmware Config' },
  { key: 'macros', label: 'Macros' },
]
const machineTab = ref<'fluidSender' | 'machine' | 'toolchange' | 'firmware' | 'macros'>('fluidSender')

const appTabs = computed(() => {
  const tabs: Array<{ key: 'interface' | 'jog' | 'macros' | 'auth' | 'shortcuts'; label: string }> = [
    { key: 'interface', label: 'Interface' },
    { key: 'jog', label: 'Jog & Motion' },
    { key: 'macros', label: 'Macros' },
    { key: 'shortcuts', label: 'Shortcuts' },
  ]
  if (currentUser.value.isAdmin) tabs.splice(3, 0, { key: 'auth', label: 'Authentication' })
  return tabs
})
const appTab = ref<'interface' | 'jog' | 'macros' | 'auth' | 'shortcuts'>('interface')

const macroEditorOpen = ref(false)
const macroEditorMacro = ref<Macro | null>(null)
const macroEditorScope = ref<'app' | 'machine'>('app')
const macroEditorMachineId = ref<string | undefined>(undefined)

function openMacroEditor(macro: Macro | null, scope: 'app' | 'machine', machineId?: string) {
  macroEditorMacro.value = macro
  macroEditorScope.value = scope
  macroEditorMachineId.value = machineId
  macroEditorOpen.value = true
}
</script>
