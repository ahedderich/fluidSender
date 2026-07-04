// Parses FluidNC `$$` dump lines (`$key=value`) into a structured config object.
// The returned shape matches FluidNCConfig in app/stores/settings.ts.

const REAL_PIN = (p: string | undefined): boolean => !!p && p !== 'NO_PIN' && p !== ''

function get(kv: Record<string, string>, k: string): string {
  return kv[k] ?? ''
}
function getNum(kv: Record<string, string>, k: string, def = 0): number {
  const v = kv[k]
  if (v === undefined) return def
  const n = parseFloat(v)
  return isNaN(n) ? def : n
}
function getBool(kv: Record<string, string>, k: string, def = false): boolean {
  const v = kv[k]
  if (v === undefined) return def
  return v === 'true' || v === '1'
}

function defaultMotor(kv: Record<string, string>, pfx: string) {
  return {
    limitNegPin: get(kv, `${pfx}/limit_neg_pin`),
    limitPosPin: get(kv, `${pfx}/limit_pos_pin`),
    hardLimits: getBool(kv, `${pfx}/hard_limits`),
    pulloffMm: getNum(kv, `${pfx}/pulloff_mm`, 3),
  }
}

function defaultHoming(kv: Record<string, string>, pfx: string) {
  return {
    cycle: getNum(kv, `${pfx}/cycle`),
    allowSingleAxis: getBool(kv, `${pfx}/allow_single_axis`),
    positiveDirection: getBool(kv, `${pfx}/positive_direction`),
    mpos: getNum(kv, `${pfx}/mpos`),
    feedRate: getNum(kv, `${pfx}/feed_rate`),
    seekRate: getNum(kv, `${pfx}/seek_rate`),
    settleMs: getNum(kv, `${pfx}/settle_ms`),
    seekScaler: getNum(kv, `${pfx}/seek_scaler`, 1.1),
    feedScaler: getNum(kv, `${pfx}/feed_scaler`, 1.1),
  }
}

export function parseFluidNCConfig(lines: string[]): Record<string, unknown> {
  const kv: Record<string, string> = {}
  for (const line of lines) {
    const m = line.match(/^\$([^=]+)=(.*)$/)
    if (m) kv[m[1].trim()] = m[2].trim()
  }

  const AXIS_NAMES = ['x', 'y', 'z', 'a', 'b', 'c']
  const axes: Record<string, unknown> = {}
  for (const a of AXIS_NAMES) {
    const pfx = `axes/${a}`
    if (!Object.keys(kv).some((k) => k.startsWith(pfx + '/'))) continue
    const motor0 = defaultMotor(kv, `${pfx}/motor0`)
    // Only include this axis if it has at least some config
    if (
      getNum(kv, `${pfx}/steps_per_mm`) === 0 &&
      !REAL_PIN(motor0.limitNegPin) &&
      !REAL_PIN(motor0.limitPosPin)
    ) continue
    axes[a] = {
      stepsPerMm: getNum(kv, `${pfx}/steps_per_mm`),
      maxRateMmPerMin: getNum(kv, `${pfx}/max_rate_mm_per_min`),
      accelerationMmPerSec2: getNum(kv, `${pfx}/acceleration`),
      maxTravelMm: getNum(kv, `${pfx}/max_travel_mm`),
      softLimits: getBool(kv, `${pfx}/soft_limits`),
      idleDisable: getBool(kv, `${pfx}/idle_disable`),
      homing: defaultHoming(kv, `${pfx}/homing`),
      motor0,
    }
  }

  const spindleType = get(kv, 'spindle/type') || 'NoSpindle'

  return {
    name: get(kv, 'name'),
    board: get(kv, 'board'),
    reportInches: getBool(kv, 'report_inches'),
    arcToleranceMm: getNum(kv, 'arc_tolerance_mm', 0.002),
    junctionDeviationMm: getNum(kv, 'junction_deviation_mm', 0.01),
    plannerBlocks: getNum(kv, 'planner_blocks', 16),
    stepping: {
      engine: get(kv, 'stepping/engine') || 'RMT',
      idleMs: getNum(kv, 'stepping/idle_ms'),
      pulseUs: getNum(kv, 'stepping/pulse_us', 4),
      dirDelayUs: getNum(kv, 'stepping/dir_delay_us'),
      disableDelayUs: getNum(kv, 'stepping/disable_delay_us'),
    },
    axes,
    spindle: {
      type: spindleType,
      outputPin: get(kv, 'spindle/output_pin'),
      enablePin: get(kv, 'spindle/enable_pin'),
      directionPin: get(kv, 'spindle/direction_pin'),
      pwmFreq: getNum(kv, 'spindle/pwm_freq', 5000),
      spinupMs: getNum(kv, 'spindle/spinup_ms'),
      spindownMs: getNum(kv, 'spindle/spindown_ms'),
      minRpm: getNum(kv, 'spindle/min_rpm'),
      maxRpm: getNum(kv, 'spindle/max_rpm', 24000),
      disableWithZeroSpeed: getBool(kv, 'spindle/disable_with_zero_speed'),
    },
    probe: {
      pin: get(kv, 'probe/pin'),
      toolsetterPin: get(kv, 'probe/toolsetter_pin'),
      checkModeStart: getBool(kv, 'probe/check_mode_start'),
      hardStop: getBool(kv, 'probe/hard_stop', true),
    },
    coolant: {
      floodPin: get(kv, 'coolant/flood_pin'),
      mistPin: get(kv, 'coolant/mist_pin'),
      delayMs: getNum(kv, 'coolant/delay_ms'),
    },
    control: {
      safetyDoorPin: get(kv, 'control/safety_door_pin'),
      resetPin: get(kv, 'control/reset_pin'),
      feedHoldPin: get(kv, 'control/feed_hold_pin'),
      cycleStartPin: get(kv, 'control/cycle_start_pin'),
    },
    start: {
      mustHome: getBool(kv, 'start/must_home'),
      checkLimits: getBool(kv, 'start/check_limits', true),
    },
    macros: {
      startupLine0: get(kv, 'macros/startup_line0'),
      startupLine1: get(kv, 'macros/startup_line1'),
      afterHoming: get(kv, 'macros/after_homing'),
      afterReset: get(kv, 'macros/after_reset'),
      afterUnlock: get(kv, 'macros/after_unlock'),
    },
  }
}
