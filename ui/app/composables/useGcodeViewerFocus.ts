import { ref } from 'vue'

// Deliberately a plain module-scope ref, NOT Pinia / synced state — this tracks
// per-browser-tab DOM focus, which must never be broadcast across clients
// (see GCODE_VIEWER_PLAN.md §2 / CLAUDE.md State Sync Protocol). Mirrors the
// existing unsynced `activeJogKey` pattern in useKeyboardShortcuts.ts.
const gcodeViewerFocused = ref(false)

export function useGcodeViewerFocus() {
  return { gcodeViewerFocused }
}
