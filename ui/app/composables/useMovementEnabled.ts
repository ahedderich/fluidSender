import { computed } from 'vue'
import { useMachineStore } from '~/stores/machine'
import { useSyncStore } from '~/stores/sync'
import { useCurrentUser } from '~/composables/useCurrentUser'

const BLOCKING_JOB_STATUSES = ['running', 'pausing', 'recovering', 'stopping'] as const

export function useMovementEnabled() {
  const machine = useMachineStore()
  const sync = useSyncStore()
  const currentUser = useCurrentUser()

  return computed(
    () =>
      machine.connected &&
      !currentUser.value.isViewer &&
      !sync.calibrationActive &&
      !BLOCKING_JOB_STATUSES.includes((sync.job?.status ?? '') as (typeof BLOCKING_JOB_STATUSES)[number]),
  )
}
