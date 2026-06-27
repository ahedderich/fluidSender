import { useMachineStore } from '~/stores/machine'
import { useSyncStore } from '~/stores/sync'

// On SSR, pre-populate stores from server-side memory so the initial render
// reflects the real connection and job state. @pinia/nuxt serialises the
// stores into the __NUXT__ payload, so the client hydrates with the correct
// state and there is no "flash of disconnected/empty" between page load and
// the first WebSocket snapshot.
export default defineNuxtPlugin(async () => {
  if (import.meta.server) {
    const { getConnection, getJobState } = await import('~~/server/utils/appState')
    const { getLastMachineStatus } = await import('~~/server/utils/machine/poller')
    const machine = useMachineStore()
    const sync = useSyncStore()
    machine.applyServerStatus(getConnection())
    const status = getLastMachineStatus()
    if (status) machine.applyMachineStatus(status)
    const job = getJobState()
    if (job.status !== 'idle') sync.applyJobState(job)
  }
})
