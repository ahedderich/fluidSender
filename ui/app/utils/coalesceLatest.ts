/**
 * Wraps an apply function so that, no matter how fast values arrive, at most
 * one is ever pending: each call overwrites the previous pending value, and
 * only the latest is applied on the next animation frame. This bounds the
 * client-side backlog to O(1) regardless of server push rate — instead of a
 * slow client falling further and further behind and replaying stale state.
 *
 * A setTimeout fallback covers backgrounded tabs, where rAF stops firing
 * entirely; visibilitychange forces an immediate flush when the tab
 * regains focus so the user isn't staring at a stale frame.
 */
export function createLatestCoalescer<T>(apply: (value: T) => void): (value: T) => void {
  let pending: T | undefined
  let hasPending = false
  let rafId: number | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  function flush() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
    if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null }
    if (!hasPending) return
    const value = pending as T
    hasPending = false
    pending = undefined
    apply(value)
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') flush()
    })
  }

  return (value: T) => {
    pending = value
    hasPending = true
    if (rafId !== null) return // a flush is already scheduled
    rafId = requestAnimationFrame(flush)
    // rAF is paused in backgrounded tabs — fall back to a timer so we still
    // drain at some bounded rate instead of piling up indefinitely.
    timeoutId = setTimeout(flush, 250)
  }
}
