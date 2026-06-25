interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

const visible = ref(false)
const opts = reactive<ConfirmOptions>({ title: '' })
let _resolve: ((v: boolean) => void) | null = null

export function useConfirm() {
  function confirm(options: ConfirmOptions): Promise<boolean> {
    Object.assign(opts, {
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      danger: false,
      message: undefined,
      ...options,
    })
    visible.value = true
    return new Promise((resolve) => {
      _resolve = resolve
    })
  }

  function accept() {
    visible.value = false
    _resolve?.(true)
    _resolve = null
  }

  function dismiss() {
    visible.value = false
    _resolve?.(false)
    _resolve = null
  }

  return { visible, opts, confirm, accept, dismiss }
}
