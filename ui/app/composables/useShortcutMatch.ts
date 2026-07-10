import { useSettingsStore } from '~/stores/settings'
import type { ShortcutActionId } from '~/stores/settings'

/** Shared key-binding matcher — used by the global shortcut handler and by
 *  per-dialog confirm/cancel shortcuts, so both read bindings the same way. */
export function useShortcutMatch() {
  const settings = useSettingsStore()

  function isSafetyHeld(e: KeyboardEvent): boolean {
    const key = settings.app.shortcuts.safetyKey
    if (key === 'none') return true
    if (key === 'shift') return e.shiftKey
    if (key === 'ctrl') return e.ctrlKey
    if (key === 'alt') return e.altKey
    return false
  }

  function matchesBinding(binding: string, e: KeyboardEvent): boolean {
    if (!binding) return false
    const parts = binding.toLowerCase().split('+')
    const rawKey = parts[parts.length - 1]
    const needsCtrl = parts.includes('ctrl')
    const needsAlt = parts.includes('alt')
    // Only enforce shift from the binding string when shift is NOT the safety key
    // (avoids double-counting when safety key is shift)
    const needsExtraShift = parts.includes('shift') && settings.app.shortcuts.safetyKey !== 'shift'

    if (e.ctrlKey !== needsCtrl) return false
    if (e.altKey !== needsAlt) return false
    if (needsExtraShift && !e.shiftKey) return false
    return e.key.toLowerCase() === rawKey
  }

  function fires(actionId: ShortcutActionId, e: KeyboardEvent): boolean {
    const binding = (settings.app.shortcuts as unknown as Record<string, string>)[actionId]
    if (!binding) return false
    const safetyKey = settings.app.shortcuts.safetyKey
    const requiresSafety = (settings.app.shortcuts.requiresSafetyKey[actionId] ?? false) && safetyKey !== 'none'

    if (requiresSafety) {
      if (!isSafetyHeld(e)) return false
    } else if (safetyKey !== 'none' && isSafetyHeld(e)) {
      // Safety key held but not required — skip to avoid conflicting with safety-required bindings
      return false
    }

    return matchesBinding(binding, e)
  }

  return { fires, isSafetyHeld, matchesBinding }
}

export function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable
}
