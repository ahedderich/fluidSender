import { useMachineStore } from '~/stores/machine'
import { useSettingsStore } from '~/stores/settings'
import type { ShortcutActionId } from '~/stores/settings'
import { useSyncStore } from '~/stores/sync'
import { useJobControl } from './useJobControl'
import { useJog } from './useJog'
import { useShortcutMatch, isInputFocused } from './useShortcutMatch'

export function useKeyboardShortcuts() {
  const settings = useSettingsStore()
  const machine = useMachineStore()
  const sync = useSyncStore()
  const jog = useJog()
  const { job, pauseJob, startJob, resumeJob } = useJobControl()
  const { fires } = useShortcutMatch()

  let activeJogKey: ShortcutActionId | null = null

  function baseKeyName(binding: string): string {
    const parts = binding.toLowerCase().split('+')
    return parts[parts.length - 1] ?? ''
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
    // A synced modal (Confirm, Toolchange, stock/gotopos/tool dialogs, ...) owns the
    // keyboard while it's open — otherwise e.g. the default dialogConfirm binding 'c'
    // would also fire cycleStart underneath the dialog.
    if (sync.modals.length > 0) return
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
