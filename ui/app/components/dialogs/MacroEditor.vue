<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/30" @click="$emit('close')" />
      <div
        class="relative bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700 shrink-0">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-slate-100">
            {{ props.macro ? 'Edit Macro' : 'New Macro' }}
          </h2>
          <button
            type="button"
            @click="$emit('close')"
            class="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <!-- Section 1: Basic settings -->
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Name</label>
              <input
                v-model="form.name"
                type="text"
                class="settings-input w-full"
                placeholder="My Macro"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Trigger</label>
              <div class="flex gap-2">
                <button
                  v-for="kind in (['direct', 'confirm', 'form'] as const)"
                  :key="kind"
                  type="button"
                  @click="setTriggerKind(kind)"
                  class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                  :class="form.triggerKind === kind
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-blue-400'"
                >
                  {{ triggerLabels[kind] }}
                </button>
              </div>
            </div>

            <div v-if="form.triggerKind === 'confirm'">
              <label class="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Confirm message (optional)</label>
              <input
                v-model="form.confirmMessage"
                type="text"
                class="settings-input w-full"
                placeholder="Run this macro?"
              />
            </div>
          </div>

          <!-- Section 2: Input variables (form trigger only) -->
          <div v-if="form.triggerKind === 'form'" class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-gray-700 dark:text-slate-300">Input Variables</span>
              <button
                type="button"
                @click="addVariable"
                class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                + Add Variable
              </button>
            </div>
            <div v-if="form.variables.length === 0" class="text-xs text-gray-400 dark:text-slate-500 italic">
              No variables defined
            </div>
            <div
              v-for="(variable, idx) in form.variables"
              :key="variable.id"
              class="border border-gray-200 dark:border-slate-700 rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-slate-900/50"
            >
              <div class="flex gap-2">
                <div class="flex-1">
                  <label class="block text-[10px] font-medium text-gray-500 dark:text-slate-400 mb-0.5">Name</label>
                  <input
                    v-model="variable.name"
                    type="text"
                    class="settings-input w-full font-mono text-xs"
                    placeholder="varName"
                  />
                  <p v-if="variable.name && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable.name)" class="text-[10px] text-red-500 mt-0.5">
                    Must be a valid identifier
                  </p>
                </div>
                <div class="w-28">
                  <label class="block text-[10px] font-medium text-gray-500 dark:text-slate-400 mb-0.5">Type</label>
                  <select v-model="variable.type" class="settings-input w-full text-xs">
                    <option value="number">number</option>
                    <option value="string">string</option>
                    <option value="boolean">boolean</option>
                  </select>
                </div>
                <div v-if="!variable.required" class="w-24">
                  <label class="block text-[10px] font-medium text-gray-500 dark:text-slate-400 mb-0.5">Default</label>
                  <input
                    v-model="variable.default"
                    type="text"
                    class="settings-input w-full text-xs"
                    placeholder="0"
                  />
                </div>
                <div class="flex flex-col justify-end pb-0.5">
                  <label class="block text-[10px] font-medium text-gray-500 dark:text-slate-400 mb-1">Required</label>
                  <button
                    type="button"
                    @click="variable.required = !variable.required"
                    class="w-8 h-4 rounded-full transition-colors relative flex-shrink-0"
                    :class="variable.required ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'"
                    :title="variable.required ? 'Required — user must enter a value' : 'Optional — uses default if blank'"
                  >
                    <span
                      class="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all"
                      :class="variable.required ? 'left-4' : 'left-0.5'"
                    />
                  </button>
                </div>
                <button
                  type="button"
                  @click="removeVariable(idx)"
                  class="self-end mb-0.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Remove variable"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div>
                <label class="block text-[10px] font-medium text-gray-500 dark:text-slate-400 mb-0.5">Hint</label>
                <input
                  v-model="variable.hint"
                  type="text"
                  class="settings-input w-full text-xs"
                  placeholder="Description shown to the user"
                />
              </div>
            </div>
          </div>

          <!-- Section 3: GCode editor -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-medium text-gray-700 dark:text-slate-300">GCode</label>
              <div class="relative">
                <button
                  type="button"
                  @click="insertMenuOpen = !insertMenuOpen"
                  class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Insert Variable ▾
                </button>
                <div
                  v-if="insertMenuOpen"
                  class="absolute right-0 top-full mt-1 z-10 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg w-64 max-h-72 overflow-y-auto"
                >
                  <div v-if="form.triggerKind === 'form' && form.variables.length" class="px-3 py-1.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide border-b border-gray-100 dark:border-slate-700">
                    Input Variables
                  </div>
                  <template v-if="form.triggerKind === 'form'">
                    <button
                      v-for="v in form.variables"
                      :key="v.id"
                      type="button"
                      @click="insertVar(`[${v.name}]`)"
                      class="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300"
                    >
                      [{{ v.name }}]
                    </button>
                  </template>
                  <div class="px-3 py-1.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide border-b border-gray-100 dark:border-slate-700 mt-1">
                    System Variables
                  </div>
                  <button
                    v-for="sv in systemVars"
                    :key="sv"
                    type="button"
                    @click="insertVar(`[${sv}]`)"
                    class="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300"
                  >
                    [{{ sv }}]
                  </button>
                  <div class="px-3 py-1.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide border-b border-gray-100 dark:border-slate-700 mt-1">
                    Tool Change Variables
                  </div>
                  <button
                    v-for="tv in toolChangeVars"
                    :key="tv"
                    type="button"
                    @click="insertVar(`[${tv}]`)"
                    class="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300"
                  >
                    [{{ tv }}]
                  </button>
                </div>
              </div>
            </div>
            <textarea
              ref="gcodeTextarea"
              v-model="form.gcode"
              rows="12"
              class="w-full font-mono text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg p-3 text-gray-800 dark:text-slate-200 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="; Enter GCode or macro directives&#10;G0 Z[safeZ]&#10;%wait"
            />
            <p v-if="parseError" class="text-xs text-red-500 dark:text-red-400">{{ parseError }}</p>
            <p v-if="parseWarning" class="text-xs text-amber-600 dark:text-amber-400">{{ parseWarning }}</p>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-slate-700 shrink-0">
          <button
            type="button"
            @click="$emit('close')"
            class="px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-800 dark:hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="save"
            :disabled="saving"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useSettingsStore } from '~/stores/settings'
import type { Macro, MacroTrigger, MacroVariable } from '~/types/macro'

const props = defineProps<{
  macro: Macro | null
  scope: 'app' | 'machine'
  machineId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const settings = useSettingsStore()

const triggerLabels = {
  direct: 'Direct execution',
  confirm: 'Confirmation dialog',
  form: 'Input form',
}

const systemVars = [
  'posx', 'posy', 'posz', 'posa',
  'mposx', 'mposy', 'mposz', 'mposa',
  'feed', 'spindleSpeed',
  'modal.wcs', 'modal.units', 'modal.distance',
  'global.*',
]

const toolChangeVars = [
  'tc.currentTool', 'tc.targetTool',
  'tc.currentSlot', 'tc.targetSlot',
  'tc.slots[1].x', 'tc.slots[1].y', 'tc.slots[1].z',
]

interface FormState {
  name: string
  triggerKind: 'direct' | 'confirm' | 'form'
  confirmMessage: string
  variables: MacroVariable[]
  gcode: string
}

const form = reactive<FormState>({
  name: props.macro?.name ?? '',
  triggerKind: props.macro?.trigger.kind ?? 'direct',
  confirmMessage: props.macro?.trigger.kind === 'confirm' ? (props.macro.trigger.message ?? '') : '',
  variables: props.macro?.trigger.kind === 'form'
    ? props.macro.trigger.variables.map((v) => ({ ...v }))
    : [],
  gcode: props.macro?.gcode ?? '',
})

const parseError = ref<string | null>(null)
const parseWarning = ref<string | null>(null)
const saving = ref(false)
const insertMenuOpen = ref(false)
const gcodeTextarea = ref<HTMLTextAreaElement | null>(null)

// Variables always available in the macro runtime context
const KNOWN_RUNTIME_VARS = new Set([
  'posx', 'posy', 'posz', 'posa',
  'mposx', 'mposy', 'mposz', 'mposa',
  'feed', 'spindleSpeed', 'spindleOn',
  'modal', 'global', 'tc',
  'true', 'false',
])

function findUndefinedVars(gcode: string, formVarNames: Set<string>): string[] {
  // Collect variable names assigned inside the macro itself (%name = ...)
  const assigned = new Set<string>()
  for (const line of gcode.split('\n')) {
    const t = line.trim()
    if (t === '' || t.startsWith(';')) continue
    const m = /^%([a-zA-Z_][a-zA-Z0-9_]*)\s*=/.exec(t)
    if (m) assigned.add(m[1]!)
  }

  // Collect root identifiers used inside [...] blocks
  const used = new Set<string>()
  const bracketRe = /\[([^\]]+)\]/g
  let bm
  while ((bm = bracketRe.exec(gcode)) !== null) {
    const expr = bm[1]!
    const tokenRe = /([a-zA-Z_][a-zA-Z0-9_]*)/g
    let tm
    while ((tm = tokenRe.exec(expr)) !== null) {
      const name = tm[1]!
      const before = tm.index > 0 ? expr[tm.index - 1] : ''
      if (before === '.') continue // property name, not a root var
      const rest = expr.slice(tm.index + name.length).trimStart()
      if (rest.startsWith('(')) continue // function call
      used.add(name)
    }
  }

  return [...used].filter(
    (name) => !KNOWN_RUNTIME_VARS.has(name) && !formVarNames.has(name) && !assigned.has(name),
  )
}

function setTriggerKind(kind: 'direct' | 'confirm' | 'form') {
  form.triggerKind = kind
  if (kind !== 'form') form.variables = []
}

function addVariable() {
  form.variables.push({
    id: `var-${Date.now()}`,
    name: '',
    type: 'number',
    required: false,
    default: '0',
    hint: '',
  })
}

function removeVariable(idx: number) {
  form.variables.splice(idx, 1)
}

function insertVar(text: string) {
  insertMenuOpen.value = false
  const el = gcodeTextarea.value
  if (!el) {
    form.gcode += text
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  form.gcode = form.gcode.slice(0, start) + text + form.gcode.slice(end)
  nextTick(() => {
    el.focus()
    el.setSelectionRange(start + text.length, start + text.length)
  })
}

async function save() {
  if (!form.name.trim()) return
  saving.value = true
  parseError.value = null
  parseWarning.value = null

  try {
    const res = await $fetch<{ ok: boolean; requiresToolChange?: boolean; error?: string }>(
      '/api/macros/parse',
      { method: 'POST', body: { gcode: form.gcode } },
    )

    if (!res.ok) {
      parseError.value = res.error ?? 'Parse error'
      return
    }

    // Check for undefined variables — warn but do not block saving
    const formVarNames = new Set(form.variables.map((v) => v.name).filter(Boolean))
    const undefinedVars = findUndefinedVars(form.gcode, formVarNames)
    if (undefinedVars.length > 0) {
      parseWarning.value = `Saved with warning: undefined variable${undefinedVars.length > 1 ? 's' : ''} — ${undefinedVars.join(', ')}. The macro may fail at runtime.`
    }

    let trigger: MacroTrigger
    if (form.triggerKind === 'confirm') {
      trigger = { kind: 'confirm', message: form.confirmMessage || undefined }
    } else if (form.triggerKind === 'form') {
      trigger = { kind: 'form', variables: form.variables.map((v) => ({ ...v })) }
    } else {
      trigger = { kind: 'direct' }
    }

    const macro: Macro = {
      id: props.macro?.id ?? `macro-${Date.now()}`,
      name: form.name.trim(),
      trigger,
      gcode: form.gcode,
      requiresToolChange: res.requiresToolChange ?? false,
    }

    if (props.scope === 'app') {
      if (props.macro) settings.updateAppMacro(macro)
      else settings.addAppMacro(macro)
    } else {
      const machineId = props.machineId ?? ''
      if (props.macro) settings.updateMachineMacro(machineId, macro)
      else settings.addMachineMacro(machineId, macro)
    }

    await settings.save()

    // Keep modal open when there is a warning so the user sees it
    if (!parseWarning.value) emit('close')
  } finally {
    saving.value = false
  }
}

function handleClickOutside(_e: MouseEvent) {
  if (insertMenuOpen.value) {
    insertMenuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside, true))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside, true))
</script>
