use crate::machine::state::{MachineState, MachineStatus, AXIS_COUNT, MAX_PLANNER_SLOTS};

pub const GREETING: &str =
    "Grbl 4.0.3 [FluidNC v4.0.3 (Simulator)] ready\r\n[MSG: Machine: Connected]\r\nok\r\n";

pub const BUILD_INFO_RESPONSE: &str =
    "[VER:4.0.3 FluidNC sim-build (Simulator-SPIFFS) :]\r\n[OPT:MPH]\r\nok\r\n";

pub const STARTUP_LOG: &str = concat!(
    "[MSG:INFO: FluidNC v4.0.3 https://github.com/bdring/FluidNC\r\n",
    "[MSG:INFO: Compiled with Simulator SDK\r\n",
    "[MSG:INFO: Local filesystem type is spiffs\r\n",
    "[MSG:INFO: Configuration file:config.yaml\r\n",
    "[MSG:INFO: Machine CNC Router (Simulator)\r\n",
    "[MSG:INFO: Board BlackBox X32\r\n",
    "[MSG:INFO: Axis count 3\r\n",
    "[MSG:INFO: Connected - IP is 127.0.0.1\r\n",
    "ok\r\n",
);

pub const SIM_CONFIG_YAML: &str = concat!(
    "name: CNC Router (Simulator)\r\n",
    "board: BlackBox X32\r\n",
    "stepping:\r\n",
    "  engine: RMT\r\n",
    "  idle_ms: 0\r\n",
    "  pulse_us: 4\r\n",
    "  dir_delay_us: 0\r\n",
    "  disable_delay_us: 0\r\n",
    "axes:\r\n",
    "  x:\r\n",
    "    steps_per_mm: 400\r\n",
    "    max_rate_mm_per_min: 10000\r\n",
    "    acceleration: 2000\r\n",
    "    max_travel_mm: 500\r\n",
    "    soft_limits: false\r\n",
    "    homing:\r\n",
    "      cycle: 1\r\n",
    "      positive_direction: false\r\n",
    "      mpos: 0\r\n",
    "      feed_rate: 200\r\n",
    "      seek_rate: 1000\r\n",
    "      settle_ms: 500\r\n",
    "    motor0:\r\n",
    "      standard_stepper:\r\n",
    "        step_pin: gpio.12\r\n",
    "        direction_pin: gpio.14\r\n",
    "        disable_pin: gpio.13\r\n",
    "      limit_neg_pin: gpio.15\r\n",
    "  y:\r\n",
    "    steps_per_mm: 400\r\n",
    "    max_rate_mm_per_min: 10000\r\n",
    "    acceleration: 2000\r\n",
    "    max_travel_mm: 500\r\n",
    "    soft_limits: false\r\n",
    "    homing:\r\n",
    "      cycle: 1\r\n",
    "      positive_direction: false\r\n",
    "      mpos: 0\r\n",
    "      feed_rate: 200\r\n",
    "      seek_rate: 1000\r\n",
    "      settle_ms: 500\r\n",
    "    motor0:\r\n",
    "      standard_stepper:\r\n",
    "        step_pin: gpio.26\r\n",
    "        direction_pin: gpio.27\r\n",
    "        disable_pin: gpio.28\r\n",
    "      limit_neg_pin: gpio.29\r\n",
    "  z:\r\n",
    "    steps_per_mm: 400\r\n",
    "    max_rate_mm_per_min: 5000\r\n",
    "    acceleration: 1000\r\n",
    "    max_travel_mm: 100\r\n",
    "    soft_limits: false\r\n",
    "    homing:\r\n",
    "      cycle: 2\r\n",
    "      positive_direction: true\r\n",
    "      mpos: 0\r\n",
    "      feed_rate: 200\r\n",
    "      seek_rate: 500\r\n",
    "      settle_ms: 500\r\n",
    "    motor0:\r\n",
    "      standard_stepper:\r\n",
    "        step_pin: gpio.30\r\n",
    "        direction_pin: gpio.31\r\n",
    "        disable_pin: gpio.32\r\n",
    "      limit_neg_pin: gpio.33\r\n",
    "spindle:\r\n",
    "  type: PWM\r\n",
    "  output_pin: gpio.2\r\n",
    "  pwm_freq: 5000\r\n",
    "  min_rpm: 0\r\n",
    "  max_rpm: 24000\r\n",
    "probe:\r\n",
    "  pin: gpio.34\r\n",
    "  hard_stop: true\r\n",
    "  check_mode_start: false\r\n",
    "coolant:\r\n",
    "  flood_pin: gpio.4\r\n",
    "  mist_pin: gpio.5\r\n",
    "ok\r\n",
);

pub fn ok() -> String {
    "ok\r\n".to_string()
}

pub fn error(code: u32) -> String {
    format!("error:{}\r\n", code)
}

pub fn msg(text: &str) -> String {
    format!("[MSG:{}]\r\n", text)
}

pub fn alarm(code: u32) -> String {
    format!("ALARM:{}\r\n", code)
}

/// Format a full FluidNC status response.
/// `<State|MPos:x,y,z|WCO:x,y,z|FS:f,s|Pn:pins|A:acc>`
pub fn status(state: &MachineState) -> String {
    let n = state.axis_count.min(AXIS_COUNT);
    let mpos = format_axes(&state.pos, n);
    let wco = format_axes(&state.wco, n);
    let f = state.feed as u64;
    let s = state.spindle_speed as u64;
    let pn = state.limits.pn_string(state.probe.triggered, state.door);

    let planner_free = (MAX_PLANNER_SLOTS - state.planner_buf_used).max(0);

    // Real FluidNC emits Hold:0 (stopped) / Hold:1 (decelerating).
    // The simulator stops instantly on hold_pending, so always emit Hold:0.
    let state_str = match state.status {
        MachineStatus::Hold => "Hold:0".to_string(),
        other => other.to_string(),
    };

    let mut parts = vec![
        state_str,
        format!("MPos:{}", mpos),
        format!("WCO:{}", wco),
        format!("FS:{},{}", f, s),
        format!("Bf:{},128", planner_free),
        format!("Ov:{},100,{}", state.feed_override, state.spindle_override),
    ];
    if !pn.is_empty() {
        parts.push(format!("Pn:{}", pn));
    }

    // Accessory state
    let mut acc = String::new();
    if let Some(flag) = state.spindle.accessory_flag() {
        acc.push(flag);
    }
    acc.push_str(&state.coolant.accessory_flags());
    if !acc.is_empty() {
        parts.push(format!("A:{}", acc));
    }

    format!("<{}>\r\n", parts.join("|"))
}

fn format_axes(arr: &[f64; AXIS_COUNT], n: usize) -> String {
    arr[..n]
        .iter()
        .map(|v| format!("{:.3}", v))
        .collect::<Vec<_>>()
        .join(",")
}

/// `[PRB:x,y,z:success]`
pub fn probe_result(pos: [f64; 3], success: bool) -> String {
    format!(
        "[PRB:{:.3},{:.3},{:.3}:{}]\r\n",
        pos[0],
        pos[1],
        pos[2],
        if success { 1 } else { 0 }
    )
}

/// Settings dump line: `$key=value`
pub fn settings_line(key: &str, value: &str) -> String {
    format!("${}={}\r\n", key, value)
}

/// Config read response: `[key=value]`
pub fn config_value(key: &str, value: &str) -> String {
    format!("[{}={}]\r\n", key, value)
}

/// GCode modal state response for `$G`: `[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]`
pub fn gc_state(state: &MachineState) -> String {
    use crate::machine::coolant::CoolantState;
    use crate::machine::modal::{DistanceMode, Plane, Units};
    use crate::machine::spindle::SpindleMode;

    let wcs = format!("G{}", 53 + state.modal.wcs as u32);
    let plane = match state.modal.plane {
        Plane::Xy => "G17",
        Plane::Xz => "G18",
        Plane::Yz => "G19",
    };
    let units = match state.modal.units {
        Units::Mm => "G21",
        Units::Inch => "G20",
    };
    let distance = match state.modal.distance {
        DistanceMode::Absolute => "G90",
        DistanceMode::Relative => "G91",
    };
    let spindle_m = match state.spindle.mode {
        SpindleMode::Off => "M5",
        SpindleMode::Cw => "M3",
        SpindleMode::Ccw => "M4",
    };
    let coolant_m = match state.coolant {
        CoolantState::Off => "M9",
        CoolantState::Mist => "M7",
        CoolantState::Flood => "M8",
    };
    let feed = state.modal_feed as u64;
    let speed = state.spindle_speed as u64;
    format!(
        "[GC:G0 {} {} {} {} G94 {} {} T0 F{} S{}]\r\n",
        wcs, plane, units, distance, spindle_m, coolant_m, feed, speed
    )
}

/// `$#` response: WCS/G92 offsets, TLO, last probe result.
/// Real FluidNC reports each of G54-G59 individually; the simulator only tracks
/// the currently active WCS offset, so the inactive slots report zero.
pub fn gcode_params(state: &MachineState) -> String {
    let n = state.axis_count.min(AXIS_COUNT);
    let zero = format_axes(&[0.0; AXIS_COUNT], n);
    let active_wco = format_axes(&state.wco, n);
    let g92 = format_axes(&state.modal.g92_offset, n);

    let mut out = String::new();
    for wcs in 0..6u8 {
        let offset = if wcs == state.modal.wcs { &active_wco } else { &zero };
        out.push_str(&format!("[G{}:{}]\r\n", 54 + wcs, offset));
    }
    out.push_str(&format!("[G28:{}]\r\n", zero));
    out.push_str(&format!("[G30:{}]\r\n", zero));
    out.push_str(&format!("[G92:{}]\r\n", g92));
    out.push_str("[TLO:0.000]\r\n");
    out.push_str("[PRB:0.000,0.000,0.000:0]\r\n");
    out.push_str(&ok());
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::machine::state::MachineState;

    fn test_state() -> MachineState {
        let travel = [300.0, 200.0, 80.0, 360.0, 360.0, 360.0];
        MachineState::new(3, travel, Default::default(), 1)
    }

    #[test]
    fn ok_response() {
        assert_eq!(ok(), "ok\r\n");
    }

    #[test]
    fn error_response() {
        assert_eq!(error(20), "error:20\r\n");
    }

    #[test]
    fn status_format() {
        let state = test_state();
        let s = status(&state);
        assert!(s.starts_with('<'));
        assert!(s.contains("Idle"));
        assert!(s.contains("MPos:"));
        assert!(s.contains("WCO:"));
        assert!(s.contains("FS:"));
        // 3-axis: exactly 3 comma-separated values in MPos
        let mpos_start = s.find("MPos:").unwrap() + 5;
        let mpos_end = s[mpos_start..]
            .find('|')
            .map(|i| mpos_start + i)
            .unwrap_or(s.len());
        let mpos_str = &s[mpos_start..mpos_end];
        assert_eq!(mpos_str.split(',').count(), 3);
    }

    #[test]
    fn probe_result_success() {
        let r = probe_result([10.0, 20.0, 5.0], true);
        assert_eq!(r, "[PRB:10.000,20.000,5.000:1]\r\n");
    }

    #[test]
    fn probe_result_fail() {
        let r = probe_result([0.0, 0.0, 0.0], false);
        assert!(r.contains(":0]"));
    }

    #[test]
    fn status_includes_pn_when_limit_active() {
        let mut state = test_state();
        state.limits.x_min = true;
        let s = status(&state);
        assert!(s.contains("Pn:X"), "status: {}", s);
    }
}
