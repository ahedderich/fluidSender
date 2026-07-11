<template>
  <!-- Only active on non-workspace pages; workspace page uses ProbingPanel's own overlays -->
  <template v-if="route.path !== '/'">
    <!-- Progress overlay — shown on all non-workspace clients while a probe runs -->
    <Teleport to="body">
      <div
        v-if="ps.phase === 'running' && ps.wizardKey"
        class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
      >
        <div class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl p-4 space-y-3">
          <p class="text-sm font-semibold text-gray-900 dark:text-slate-100">{{ wizardTitles[ps.wizardKey] ?? ps.wizardKey }}</p>
          <UiProbingProgressBar :ps="ps" @abort="wsSend({ t: 'probing:abort' })" />
          <template v-if="ps.wizardKey === 'center-in' && ps.currentStepLabel?.includes('Continue')">
            <p class="text-xs text-center text-amber-600 dark:text-amber-400">
              Jog probe inside pocket, then click Continue
            </p>
            <button
              @click="wsSend({ t: 'probing:continue' })"
              class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Continue
              <UiShortcutBadge action="dialogConfirm" />
            </button>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Result overlay — suppressed when calibration owns the probe sequence -->
    <DialogsDialogFrame
      :open="!!showResult && !sync.calibrationActive"
      :title="ps.wizardKey ? (wizardTitles[ps.wizardKey] ?? ps.wizardKey) : ''"
      size="3xl"
      @close="dismiss"
    >
      <div class="space-y-4">
        <template v-if="ps.phase === 'completed'">
          <div class="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg p-3 space-y-1.5">
            <p class="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">Probing Complete</p>
            <template v-if="ps.measuredWidth !== null">
              <p class="text-xs text-emerald-700 dark:text-emerald-400">Width: {{ ps.measuredWidth!.toFixed(3) }} mm</p>
            </template>
            <template v-if="ps.measuredHeight !== null">
              <p class="text-xs text-emerald-700 dark:text-emerald-400">Height: {{ ps.measuredHeight!.toFixed(3) }} mm</p>
            </template>
            <template v-if="ps.measuredDiameter !== null">
              <p class="text-xs text-emerald-700 dark:text-emerald-400">Diameter: {{ ps.measuredDiameter!.toFixed(3) }} mm</p>
            </template>
            <template v-for="r in ps.stepResults" :key="`${r.axis}${r.direction}`">
              <p class="text-xs text-emerald-700 dark:text-emerald-400">{{ r.axis }}{{ r.direction }}: {{ r.edgeWpos.toFixed(3) }} mm</p>
            </template>
          </div>
          <p class="text-xs text-center text-gray-400 dark:text-slate-500">Go to workspace to repeat or review full results.</p>
        </template>
        <template v-else-if="ps.phase === 'aborted'">
          <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <p class="text-xs font-semibold text-red-800 dark:text-red-300 uppercase tracking-wide">
              {{ ps.errorMessage ? 'Probing Failed' : 'Probing Stopped' }}
            </p>
            <p v-if="ps.errorMessage" class="text-xs text-red-700 dark:text-red-400 mt-1">{{ ps.errorMessage }}</p>
          </div>
        </template>
      </div>

      <template #footer>
        <DialogsDialogButton variant="primary" shortcut="dialogConfirm" class="flex-1" @click="dismiss">
          OK
        </DialogsDialogButton>
      </template>
    </DialogsDialogFrame>
  </template>
</template>

<script setup lang="ts">
import { useSyncStore } from '~/stores/sync'
import { wsSend } from '~/composables/useWsSend'
import { useDialogShortcuts } from '~/composables/useDialogShortcuts'

const sync = useSyncStore()
const ps = sync.probingState
const route = useRoute()

// Gated by route, matching the template's own v-if — the workspace page ('/') has
// its own copy of these overlays (ProbingPanel.vue) with its own shortcut wiring;
// without this guard both would fire for the same keypress.
const onNonWorkspacePage = () => route.path !== '/'

const resultDismissed = ref(true)

const showResult = computed(
  () => (ps.phase === 'completed' || ps.phase === 'aborted') && ps.wizardKey && !resultDismissed.value,
)

watch(() => ps.phase, (phase, prevPhase) => {
  if ((phase === 'completed' || phase === 'aborted') && prevPhase === 'running') {
    resultDismissed.value = false
  }
  if (phase === 'running') {
    resultDismissed.value = true
  }
})

function dismiss() {
  resultDismissed.value = true
}

const showContinue = computed(() =>
  ps.phase === 'running' && ps.wizardKey === 'center-in' && !!ps.currentStepLabel?.includes('Continue'),
)
useDialogShortcuts(() => onNonWorkspacePage() && ps.phase === 'running' && !!ps.wizardKey, {
  onConfirm: () => { if (showContinue.value) wsSend({ t: 'probing:continue' }) },
  onCancel: () => wsSend({ t: 'probing:abort' }),
})

useDialogShortcuts(() => onNonWorkspacePage() && !!showResult.value, { onConfirm: dismiss, onCancel: dismiss })

const wizardTitles: Record<string, string> = {
  'corner':     'Corner Probing (XYZ)',
  'center-out': 'Center Probing — Outside In',
  'center-in':  'Center Probing — Pocket/Hole',
  'rotation':   'Stock Rotation Probe',
  'heightmap':  'Surface Heightmap',
}
</script>
