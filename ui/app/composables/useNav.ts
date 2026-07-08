import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSyncStore } from '~/stores/sync'
import { useUiStore } from '~/stores/ui'
import { wsSend } from '~/composables/useWsSend'

// navMode is browser-local (buttons vs joystick is a per-user preference, not
// a shared session state). All other nav keys are server-synced.
export function useNav() {
  const sync = useSyncStore()
  const { navMode } = storeToRefs(useUiStore())

  const probingTab = computed<string>({
    get: () => sync.nav.probingTab,
    set: (v) => wsSend({ t: 'ui:nav', payload: { probingTab: v } }),
  })

  const route = computed<string>({
    get: () => sync.nav.route,
    set: (v) => wsSend({ t: 'ui:nav', payload: { route: v } }),
  })

  // Probing wizard: which wizard is open + the current step, synced across browsers.
  const activeWizard = computed<string | null>({
    get: () => sync.nav.wizard.key,
    set: (v) => wsSend({ t: 'ui:nav', payload: { wizard: { key: v, step: 0 } } }),
  })

  const wizardStep = computed<number>({
    get: () => sync.nav.wizard.step,
    set: (v) => wsSend({ t: 'ui:nav', payload: { wizard: { key: sync.nav.wizard.key, step: v } } }),
  })

  return { navMode, probingTab, route, activeWizard, wizardStep }
}
