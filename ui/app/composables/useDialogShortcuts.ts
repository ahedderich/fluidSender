import { useShortcutMatch, isInputFocused } from './useShortcutMatch'

/** Wires the configurable dialogConfirm/dialogCancel shortcuts to a single dialog.
 *  `isOpen` is read on every keydown (not just at mount) since dialog components in
 *  this app stay mounted for the app's lifetime and toggle visibility via v-if. */
export function useDialogShortcuts(
  isOpen: () => boolean,
  handlers: { onConfirm?: () => void; onCancel?: () => void },
) {
  const { fires } = useShortcutMatch()

  function onKeyDown(e: KeyboardEvent) {
    if (!isOpen()) return
    // Single-character bindings (the 'c' default for confirm) must not hijack normal
    // typing in a dialog's own form fields; Escape and other non-printable keys are
    // safe to act on regardless of focus.
    if (isInputFocused() && e.key.length === 1) return

    if (handlers.onCancel && fires('dialogCancel', e)) {
      e.preventDefault()
      handlers.onCancel()
      return
    }
    if (handlers.onConfirm && fires('dialogConfirm', e)) {
      e.preventDefault()
      handlers.onConfirm()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown, true))
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown, true))
}
