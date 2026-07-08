import { computed } from 'vue'
import { useSyncStore } from '~/stores/sync'
import { wsSend } from '~/composables/useWsSend'

// Synced selection state (active machine, selected tool, selected file). Shared
// across every browser via the server.
export function useSelection() {
  const sync = useSyncStore()

  const activeMachineId = computed<string>({
    get: () => sync.selection.activeMachineId,
    set: (v) => wsSend({ t: 'ui:selection', payload: { activeMachineId: v } }),
  })

  const selectedToolId = computed<string | null>({
    get: () => sync.selection.selectedToolId,
    set: (v) => wsSend({ t: 'ui:selection', payload: { selectedToolId: v } }),
  })

  const selectedFile = computed<string | null>({
    get: () => sync.selection.selectedFile,
    set: (v) => wsSend({ t: 'ui:selection', payload: { selectedFile: v } }),
  })

  return { activeMachineId, selectedToolId, selectedFile }
}
