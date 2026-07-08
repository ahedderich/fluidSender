import { useMachineStore } from '~/stores/machine'
import { useSettingsStore } from '~/stores/settings'
import type { ShortcutActionId } from '~/stores/settings'
import { useJobControl } from './useJobControl'
import { useJog } from './useJog'

export function useKeyboardShortcuts() {
  const settings = useSettingsStore()
  const machine = useMachineStore()
  const jog = useJog()
  const { job, pauseJob, startJob, resumeJob } = useJobControl()

  let activeJogKey: ShortcutActionId | null = null

  function isSafetyHeld(e: KeyboardEvent): boolean {
    const key = settings.app.shortcuts.safetyKey
    if (key === 'none') return true
    if (key === 'shift') return e.shiftKey
    if (key === 'ctrl') return e.ctrlKey
    if (key === 'alt') return e.altKey
    return false
  }

  function baseKeyName(binding: string): string {
    const parts = binding.toLowerCase().split('+')
    return parts[parts.length - 1] ?? ''
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

  function isInputFocused(): boolean {
    const el = document.activeElement
    if (!el) return false
    const tag = el.tagName.toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable
  }

  const JOG_MAP: Array<[ShortcutActionId, number, number, number]> = [
    ['jogXPos', 1, 0, 0],
    ['jogXNeg', -1, 0, 0],
    ['jogYPos', 0, 1, 0],
    ['jogYNeg', 0, -1, 0],
    ['jogZPos', 0, 0, 1],
    ['jogZNeg', 0, 0, -1],
  ]

  function onKeyDown(e: KeyboardEvent) {
    if (isInputFocused()) return
    if (e.repeat) {
      // Suppress scroll/default for held jog keys without re-triggering startJog
      if (activeJogKey) e.preventDefault()
      return
    }

    // Jog directions
    for (const [id, dx, dy, dz] of JOG_MAP) {
      if (fires(id, e)) {
        if (activeJogKey && activeJogKey !== id) jog.stopJog()
        activeJogKey = id
        jog.startJog(dx, dy, dz)
        e.preventDefault()
        return
      }
    }

    // Speed presets
    if (fires('speedFast', e)) { jog.selectSpeed(2); e.preventDefault(); return }
    if (fires('speedMedium', e)) { jog.selectSpeed(1); e.preventDefault(); return }
    if (fires('speedSlow', e)) { jog.selectSpeed(0); e.preventDefault(); return }

    // Cycle controls
    if (!machine.connected) return

    if (fires('feedHold', e) && job.value?.status === 'running') {
      pauseJob(); e.preventDefault(); return
    }
    if (fires('cycleStart', e)) {
      const status = job.value?.status
      if (status === 'paused') resumeJob()
      else if (status === 'loaded' || status === 'complete') startJob()
      e.preventDefault(); return
    }
    if (fires('softReset', e)) {
      machine.sendCommand('\x18'); e.preventDefault(); return
    }
    if (fires('home', e)) {
      machine.sendCommand('$H'); e.preventDefault(); return
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (!activeJogKey) return
    const binding = (settings.app.shortcuts as unknown as Record<string, string>)[activeJogKey]
    if (binding && e.key.toLowerCase() === baseKeyName(binding)) {
      activeJogKey = null
      jog.stopJog()
      e.preventDefault()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
    if (activeJogKey) {
      activeJogKey = null
      jog.stopJog()
    }
  })
}
