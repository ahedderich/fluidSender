import { computed } from 'vue'
import { useSyncStore } from '~/stores/sync'
import { wsSend } from '~/composables/useWsSend'

export function useJobControl() {
  const sync = useSyncStore()
  const job = computed(() => sync.job)

  return {
    job,
    loadJob: (fileId: string) => wsSend({ t: 'job:load', payload: { fileId } }),
    startJob: () => wsSend({ t: 'job:start' }),
    pauseJob: () => wsSend({ t: 'job:pause' }),
    resumeJob: () => wsSend({ t: 'job:resume' }),
    cancelJob: () => wsSend({ t: 'job:cancel' }),
    clearJob: () => wsSend({ t: 'job:clear' }),
    confirmRecovery: (resumePtr: number) =>
      wsSend({ t: 'job:recover:confirm', payload: { resumePtr } }),
  }
}
