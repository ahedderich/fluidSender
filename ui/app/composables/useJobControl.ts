import { computed } from 'vue'
import { useSyncStore } from '~/stores/sync'
import { wsSend } from '~/composables/useWsSend'

export function useJobControl() {
  const sync = useSyncStore()
  const job = computed(() => sync.job)

  return {
    job,
    loadJob: (fileId: string) => $fetch('/api/jobs/load', { method: 'POST', body: { fileId } }),
    abortAnalysis: () => wsSend({ t: 'job:analyze:abort' }),
    startJob: () => wsSend({ t: 'job:start' }),
    pauseJob: () => wsSend({ t: 'job:pause' }),
    resumeJob: () => wsSend({ t: 'job:resume' }),
    cancelJob: () => wsSend({ t: 'job:cancel' }),
    clearJob: () => wsSend({ t: 'job:clear' }),
    confirmRecovery: (resumePtr: number) =>
      wsSend({ t: 'job:recover:confirm', payload: { resumePtr } }),
  }
}
