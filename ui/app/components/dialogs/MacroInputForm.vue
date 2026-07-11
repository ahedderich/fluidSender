<template>
  <DialogsDialogFrame :open="true" :title="props.macro.name" size="3xl" @close="$emit('cancel')">
    <div class="space-y-4">
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

    <template #footer>
      <DialogsDialogButton variant="neutral" shortcut="dialogCancel" class="flex-1" @click="$emit('cancel')">
        Cancel
      </DialogsDialogButton>
      <DialogsDialogButton variant="primary" shortcut="dialogConfirm" class="flex-1" @click="submit">
        Run
      </DialogsDialogButton>
    </template>
  </DialogsDialogFrame>
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
