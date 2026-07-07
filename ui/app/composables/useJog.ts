import { wsSend } from './useWsSend'
import { useSyncStore } from '~/stores/sync'
import { useSettingsStore } from '~/stores/settings'
import { useMovementEnabled } from './useMovementEnabled'

const JOG_INTERVAL_MS = 50
const JOG_LOOKAHEAD = 1.5

// Singleton state shared across all useJog() calls in this browser tab
const _isJogging = ref(false)
const _activeSpeedIndex = ref(1)
const _jogSpeed = ref(500)
const _xyStepSize = ref(1.0)
const _zStepSize = ref(0.5)
let _jogInterval: ReturnType<typeof setInterval> | null = null
let _jogTimeout: ReturnType<typeof setTimeout> | null = null

export function useJog() {
  const sync = useSyncStore()
  const settings = useSettingsStore()
  const movementEnabled = useMovementEnabled()

  const canJog = computed(() => movementEnabled.value && (!sync.jogActive || _isJogging.value))

  const speedPresets = computed(() => [
    { label: 'Slow', feedRate: settings.app.jog.slowSpeed, xyStep: 0.1, zStep: 0.05 },
    { label: 'Med', feedRate: settings.app.jog.mediumSpeed, xyStep: 1.0, zStep: 0.5 },
    { label: 'Fast', feedRate: settings.app.jog.fastSpeed, xyStep: 5.0, zStep: 2.0 },
  ])

  function selectSpeed(i: number) {
    _activeSpeedIndex.value = i
    const preset = speedPresets.value[i]
    _jogSpeed.value = preset.feedRate
    _xyStepSize.value = preset.xyStep
    _zStepSize.value = preset.zStep
  }

  function sendTapJog(dx: number, dy: number, dz: number) {
    const parts: string[] = []
    if (dx !== 0) parts.push(`X${(dx * _xyStepSize.value).toFixed(3)}`)
    if (dy !== 0) parts.push(`Y${(dy * _xyStepSize.value).toFixed(3)}`)
    if (dz !== 0) parts.push(`Z${(dz * _zStepSize.value).toFixed(3)}`)
    if (parts.length) {
      wsSend({ t: 'machine:jog:move', payload: { cmd: `$J=G91 ${parts.join(' ')} F${_jogSpeed.value}` } })
    }
  }

  function sendContinuousJog(dx: number, dy: number, dz: number) {
    const feed = _jogSpeed.value
    const seg = (feed / 60) * (JOG_INTERVAL_MS / 1000) * JOG_LOOKAHEAD
    const parts: string[] = []
    if (dx !== 0) parts.push(`X${(dx * seg).toFixed(3)}`)
    if (dy !== 0) parts.push(`Y${(dy * seg).toFixed(3)}`)
    if (dz !== 0) parts.push(`Z${(dz * seg).toFixed(3)}`)
    if (parts.length) {
      wsSend({ t: 'machine:jog:move', payload: { cmd: `$J=G91 ${parts.join(' ')} F${feed}` } })
    }
  }

  function startJog(dx: number, dy: number, dz: number) {
    if (!canJog.value) return
    _isJogging.value = true
    wsSend({ t: 'ui:jog:start' })
    sendTapJog(dx, dy, dz)
    _jogTimeout = setTimeout(() => {
      _jogInterval = setInterval(() => sendContinuousJog(dx, dy, dz), JOG_INTERVAL_MS)
    }, 400)
  }

  function stopJog() {
    if (_jogTimeout) clearTimeout(_jogTimeout)
    const wasRunning = _jogInterval !== null
    if (_jogInterval) clearInterval(_jogInterval)
    _jogTimeout = null
    _jogInterval = null
    if (_isJogging.value) {
      _isJogging.value = false
      if (wasRunning) wsSend({ t: 'machine:jog:cancel' })
      wsSend({ t: 'ui:jog:stop' })
    }
  }

  function onJoystickMove({ x, y, magnitude }: { x: number; y: number; magnitude: number }) {
    if (magnitude < 0.1) {
      if (_isJogging.value) {
        _isJogging.value = false
        wsSend({ t: 'machine:jog:cancel' })
        wsSend({ t: 'ui:jog:stop' })
      }
      return
    }
    if (!canJog.value) return
    if (!_isJogging.value) {
      _isJogging.value = true
      wsSend({ t: 'ui:jog:start' })
    }
    const feed = _jogSpeed.value
    const effectiveFeed = magnitude * feed
    const seg = (feed / 60) * (JOG_INTERVAL_MS / 1000) * JOG_LOOKAHEAD
    wsSend({
      t: 'machine:jog:move',
      payload: { cmd: `$J=G91 X${(x * seg).toFixed(3)} Y${(y * seg).toFixed(3)} F${Math.round(effectiveFeed)}` },
    })
  }

  return {
    isJogging: _isJogging,
    canJog,
    activeSpeedIndex: _activeSpeedIndex,
    jogSpeed: _jogSpeed,
    xyStepSize: _xyStepSize,
    zStepSize: _zStepSize,
    speedPresets,
    selectSpeed,
    startJog,
    stopJog,
    onJoystickMove,
  }
}
