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
    // Single-character bindings must not hijack normal typing in a dialog's own form
    // fields, and Enter (the confirm default) must not hijack newline entry in a
    // multi-line textarea (e.g. a macro's GCode editor). Escape and other bindings
    // are safe to act on regardless of focus.
    if (isInputFocused()) {
      const isTextarea = document.activeElement?.tagName === 'TEXTAREA'
      if (e.key.length === 1 || (e.key === 'Enter' && isTextarea)) return
    }

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
