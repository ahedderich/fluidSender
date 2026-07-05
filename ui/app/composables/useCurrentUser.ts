import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useSyncStore } from '~/stores/sync'

export interface CurrentUser {
  username: string
  role: 'viewer' | 'operator' | 'admin'
  isAdmin: boolean
  isOperator: boolean
  isViewer: boolean
  canControl: boolean
}

export function useCurrentUser(): ComputedRef<CurrentUser> {
  const sync = useSyncStore()
  return computed(() => {
    const session = sync.session
    const role = session?.role ?? 'admin'
    return {
      username: session?.username ?? 'local',
      role,
      isAdmin: role === 'admin',
      isOperator: role === 'operator',
      isViewer: role === 'viewer',
      canControl: role === 'operator' || role === 'admin',
    }
  })
}
