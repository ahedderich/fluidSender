// Client-only breakpoint check, kept in sync with Tailwind's `md` (768px) so the
// same cutoff drives both CSS-responsive markup and JS-gated component mounting
// (needed where a component has real mount side effects — e.g. GCodeViewport's
// WebGL context — that a CSS-only `hidden` class wouldn't actually tear down).
// Starts `false` on server and first client paint (matches SSR output, avoids a
// hydration mismatch), corrected immediately on mount.
export function useIsMobile() {
  const isMobile = ref(false)
  let mql: MediaQueryList | null = null
  const update = (e: MediaQueryListEvent) => { isMobile.value = e.matches }

  onMounted(() => {
    mql = window.matchMedia('(max-width: 767px)')
    isMobile.value = mql.matches
    mql.addEventListener('change', update)
  })

  onUnmounted(() => {
    mql?.removeEventListener('change', update)
  })

  return isMobile
}
