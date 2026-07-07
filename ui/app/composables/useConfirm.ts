import { useModals } from '~/composables/useModals'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

// Confirmation dialogs are synced: opening broadcasts a 'confirm' modal to every
// browser, and the promise resolves when *any* browser accepts or dismisses it.
export function useConfirm() {
  const modals = useModals()

  function confirm(options: ConfirmOptions): Promise<boolean> {
    return modals.open<boolean>('confirm', {
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      danger: false,
      message: undefined,
      ...options,
    })
  }

  return { confirm }
}
