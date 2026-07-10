<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/30" @click="$emit('cancel')" />
      <div
        class="relative bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-2xl w-80 max-w-full"
        @click.stop
      >
        <div class="px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-100">{{ props.macro.name }}</h3>
        </div>

        <div class="px-5 py-4 space-y-4">
          <template v-if="variables.length">
            <div v-for="variable in variables" :key="variable.id">
              <label class="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                {{ variable.name }}
                <span v-if="variable.required" class="text-red-500">*</span>
              </label>
              <input
                v-if="variable.type === 'number'"
                v-model="values[variable.name]"
                type="number"
                class="settings-input w-full"
                :class="{ 'border-red-500 dark:border-red-500 focus:ring-red-500': submitted && isInvalid(variable) }"
                :placeholder="variable.required ? 'Required' : variable.default"
                @input="submitted = false"
              />
              <input
                v-else-if="variable.type === 'boolean'"
                v-model="boolValues[variable.name]"
                type="checkbox"
                class="w-4 h-4 rounded text-blue-600"
              />
              <input
                v-else
                v-model="values[variable.name]"
                type="text"
                class="settings-input w-full"
                :class="{ 'border-red-500 dark:border-red-500 focus:ring-red-500': submitted && isInvalid(variable) }"
                :placeholder="variable.required ? 'Required' : variable.default"
                @input="submitted = false"
              />
              <p v-if="submitted && isInvalid(variable)" class="text-[10px] text-red-500 mt-0.5">
                This field is required
              </p>
              <p v-else-if="variable.hint" class="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">
                {{ variable.hint }}
              </p>
            </div>
          </template>
          <p v-else class="text-sm text-gray-500 dark:text-slate-400">No input variables</p>
        </div>

        <div class="flex gap-2 px-5 py-4 border-t border-gray-200 dark:border-slate-700">
          <button
            type="button"
            @click="submit"
            class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Run
            <UiShortcutBadge action="dialogConfirm" />
          </button>
          <button
            type="button"
            @click="$emit('cancel')"
            class="flex-1 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
            <UiShortcutBadge action="dialogCancel" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import type { Macro, MacroVariable } from '~/types/macro'
import { useDialogShortcuts } from '~/composables/useDialogShortcuts'

const props = defineProps<{
  macro: Macro
}>()

const emit = defineEmits<{
  (e: 'submit', formValues: Record<string, string>): void
  (e: 'cancel'): void
}>()

const variables = computed<MacroVariable[]>(() =>
  props.macro.trigger.kind === 'form' ? props.macro.trigger.variables : [],
)

const values = reactive<Record<string, string>>(
  Object.fromEntries(
    variables.value.map((v) => [v.name, v.required ? '' : v.default]),
  ),
)
const boolValues = reactive<Record<string, boolean>>(
  Object.fromEntries(
    variables.value
      .filter((v) => v.type === 'boolean')
      .map((v) => [v.name, v.default === 'true']),
  ),
)

const submitted = ref(false)

function isInvalid(v: MacroVariable): boolean {
  if (!v.required || v.type === 'boolean') return false
  return values[v.name] === '' || values[v.name] === undefined
}

function submit() {
  submitted.value = true
  if (variables.value.some((v) => isInvalid(v))) return

  const result: Record<string, string> = {}
  for (const v of variables.value) {
    if (v.type === 'boolean') {
      result[v.name] = String(boolValues[v.name] ?? false)
    } else {
      result[v.name] = values[v.name] ?? v.default
    }
  }
  emit('submit', result)
}

// Only exists in the DOM while open (parent mounts with v-if).
useDialogShortcuts(() => true, { onConfirm: submit, onCancel: () => emit('cancel') })
</script>
