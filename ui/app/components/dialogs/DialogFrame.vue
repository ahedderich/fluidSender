<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/20 dark:bg-black/40" @click="dismissible && emit('close')" />

        <Transition
          enter-active-class="transition duration-150"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition duration-100"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="open"
            ref="cardRef"
            class="relative bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-2xl w-full flex flex-col max-h-[90vh]"
            :class="sizeClass"
            @click.stop
          >
            <div
              v-if="title || $slots.header"
              class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700 shrink-0"
            >
              <slot name="header">
                <h3 class="text-base font-semibold text-gray-900 dark:text-slate-100">{{ title }}</h3>
              </slot>
              <button
                v-if="closable"
                type="button"
                class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded transition-colors shrink-0"
                @click="emit('close')"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto" :class="noBodyPadding ? '' : 'p-5'">
              <slot />
            </div>

            <div v-if="$slots.footer" class="px-5 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center gap-2.5 shrink-0">
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Shared modal chrome for every dialog in the app: backdrop, card, transitions,
 *  header/close-X, and focus management. On open, focus moves to the first
 *  form control in the body; if there isn't one, it falls back to the button
 *  marked `data-dialog-primary` (set automatically by DialogButton's
 *  primary/danger variants). Tab is trapped inside the card while open, so it
 *  cycles through the dialog's own controls instead of reaching the page
 *  behind it. Keyboard shortcuts (Enter/Escape) stay owned by each dialog via
 *  useDialogShortcuts, since confirm/cancel semantics vary per dialog
 *  (multi-phase flows, recording modes, etc). */
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  dismissible?: boolean
  closable?: boolean
  noBodyPadding?: boolean
}>(), {
  title: undefined,
  size: 'sm',
  dismissible: true,
  closable: undefined,
})

const emit = defineEmits<{ close: [] }>()

const closable = computed(() => props.closable ?? props.dismissible)

const sizeClass = computed(() => ({
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
}[props.size]))

const cardRef = ref<HTMLElement | null>(null)

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  const root = cardRef.value
  if (!root) return

  const formEl = root.querySelector<HTMLElement>(
    'input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled)',
  )
  if (formEl) {
    formEl.focus()
    return
  }
  root.querySelector<HTMLElement>('[data-dialog-primary]')?.focus()
})

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const root = cardRef.value
  if (!root) return

  const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => el.offsetParent !== null)
  if (focusable.length === 0) {
    e.preventDefault()
    return
  }

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  const active = document.activeElement

  if (e.shiftKey) {
    if (active === first || !root.contains(active)) {
      e.preventDefault()
      last.focus()
    }
  } else if (active === last || !root.contains(active)) {
    e.preventDefault()
    first.focus()
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('keydown', onKeyDown, true)
  } else {
    window.removeEventListener('keydown', onKeyDown, true)
  }
})

onUnmounted(() => window.removeEventListener('keydown', onKeyDown, true))
</script>
