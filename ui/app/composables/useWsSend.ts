import { ref } from 'vue'

let _send: (msg: unknown) => void = () => {}

export const wsConnected = ref(false)

export function setWsSend(fn: (msg: unknown) => void) {
  _send = fn
}

export function wsSend(msg: unknown) {
  _send(msg)
}
