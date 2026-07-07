import { useSyncStore } from '~/stores/sync'
import { wsSend } from '~/composables/useWsSend'
import type { Toast } from '~/stores/sync'

type ToastType = Toast['type']

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Synced toasts: pushing broadcasts to every browser; the server owns the
// auto-dismiss timer so they disappear everywhere at the same time.
export function useToast() {
  const sync = useSyncStore()

  function push(message: string, type: ToastType = 'info', timeout = 4000) {
    wsSend({ t: 'ui:toast:push', payload: { id: newId(), type, message, timeout } satisfies Toast })
  }

  function dismiss(id: string) {
    wsSend({ t: 'ui:toast:dismiss', payload: { id } })
  }

  return {
    toasts: sync.toasts,
    push,
    dismiss,
    info: (m: string, t?: number) => push(m, 'info', t),
    success: (m: string, t?: number) => push(m, 'success', t),
    warning: (m: string, t?: number) => push(m, 'warning', t),
    error: (m: string, t?: number) => push(m, 'error', t),
  }
}
