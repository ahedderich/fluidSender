import { useSettingsStore } from '~/stores/settings'

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  // useRequestFetch forwards the browser's cookie header during SSR so the
  // JWT in fs_session is visible to the server-side auth middleware.
  const fetchWithCookies = useRequestFetch()
  const { authenticated } = await fetchWithCookies<{ authenticated: boolean }>('/api/auth/session').catch(() => ({ authenticated: false }))
  if (!authenticated) {
    return navigateTo('/login')
  }

  const s = useSettingsStore()
  if (!s.initialized) {
    await s.hydrate(fetchWithCookies as typeof $fetch)
  }

  if (to.path === '/settings') return

  if (!s.hasMachines) {
    return navigateTo('/settings')
  }
})
