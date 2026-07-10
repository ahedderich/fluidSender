import { useSettingsStore } from '~/stores/settings'
import type { ShortcutActionId } from '~/stores/settings'

export const KEY_DISPLAY: Record<string, string> = {
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Del',
  ' ': 'Space',
}

export function displayKey(raw: string): string {
  const lower = raw.toLowerCase()
  return KEY_DISPLAY[lower] ?? (raw.length === 1 ? raw.toUpperCase() : raw)
}

export function useShortcutDisplay() {
  const s = useSettingsStore()

  function isSafetyRequired(actionId: ShortcutActionId): boolean {
    return s.app.shortcuts.requiresSafetyKey[actionId] ?? false
  }

  /** Full label for the settings list, e.g. "Shift+C" or "Ctrl+ArrowUp". */
  function format(actionId: ShortcutActionId): string {
    const binding = (s.app.shortcuts as unknown as Record<string, string>)[actionId]
    if (!binding) return '—'

    const safetyKey = s.app.shortcuts.safetyKey
    const requiresSafety = isSafetyRequired(actionId)
    const parts = binding.toLowerCase().split('+')
    const rawKey = parts[parts.length - 1] ?? ''

    const display: string[] = []
    if (requiresSafety && safetyKey !== 'none') {
      display.push(safetyKey.charAt(0).toUpperCase() + safetyKey.slice(1))
    }
    if (parts.includes('ctrl')) display.push('Ctrl')
    if (parts.includes('alt')) display.push('Alt')
    if (parts.includes('shift') && safetyKey !== 'shift') display.push('Shift')
    display.push(displayKey(rawKey))

    return display.join('+')
  }

  /** Compact badge for buttons, e.g. "C" or "ESC" — always includes any modifier keys
   *  in the binding itself, but omits the safety-key modifier since dialog confirm/
   *  cancel default to no safety requirement and this needs to stay short. */
  function badge(actionId: ShortcutActionId): string {
    const binding = (s.app.shortcuts as unknown as Record<string, string>)[actionId]
    if (!binding) return ''
    const parts = binding.toLowerCase().split('+')
    const rawKey = parts[parts.length - 1] ?? ''
    const mods: string[] = []
    if (parts.includes('ctrl')) mods.push('CTRL')
    if (parts.includes('alt')) mods.push('ALT')
    if (parts.includes('shift') && s.app.shortcuts.safetyKey !== 'shift') mods.push('SHIFT')
    return [...mods, displayKey(rawKey).toUpperCase()].join('+')
  }

  return { format, badge, isSafetyRequired }
}
