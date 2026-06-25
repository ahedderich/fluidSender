import { useSettingsStore } from '~/stores/settings'

export default defineNuxtRouteMiddleware(async (to) => {
  const s = useSettingsStore()

  if (!s.initialized) {
    await s.hydrate()
  }

  // Always allow the settings page
  if (to.path === '/settings') return

  // Block dashboard access until at least one machine is configured
  if (!s.hasMachines) {
    return navigateTo('/settings')
  }
})
