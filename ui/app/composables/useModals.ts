import { computed } from 'vue'
import { useSyncStore } from '~/stores/sync'
import { wsSend } from '~/composables/useWsSend'

// Promises returned by `open()` are settled when the server broadcasts that the
// modal was resolved — by *any* browser. Kept at module scope so resolution
// survives across components.
const pending = new Map<string, (result: unknown) => void>()

export function settleModal(id: string, result: unknown) {
  const resolve = pending.get(id)
  if (resolve) {
    pending.delete(id)
    resolve(result)
  }
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `modal-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useModals() {
  const sync = useSyncStore()

  /** Open a modal on every connected browser; resolves when anyone closes it. */
  function open<T = unknown>(kind: string, props?: Record<string, unknown>): Promise<T> {
    const id = newId()
    wsSend({ t: 'ui:modal:open', payload: { id, kind, props } })
    return new Promise<T>((resolve) => {
      pending.set(id, resolve as (r: unknown) => void)
    })
  }

  /** Resolve an open modal (by id) with a result; broadcast to all browsers. */
  function resolve(id: string, result?: unknown) {
    wsSend({ t: 'ui:modal:resolve', payload: { id, result } })
  }

  /** The topmost modal of a given kind, if open (drives a component's v-if). */
  function active(kind: string) {
    return computed(() => sync.modals.find((m) => m.kind === kind) ?? null)
  }

  return { modals: sync.modals, open, resolve, active }
}
