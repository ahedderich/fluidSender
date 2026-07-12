use serde::Serialize;

use crate::machine::state::{
    MachineState, MachineStatus, AXIS_COUNT, MAX_PLANNER_SLOTS, SIM_BOARD_NAME, SIM_MACHINE_NAME,
};

/// `Grbl <ver> [FluidNC v<ver> (Simulator)] ready` — sent on connect and after a soft reset.
pub fn greeting(firmware_version: &str) -> String {
    format!(
        "Grbl {ver} [FluidNC v{ver} (Simulator)] ready\r\n[MSG: Machine: Connected]\r\nok\r\n",
        ver = firmware_version
    )
}

/// `$I` response.
pub fn build_info(firmware_version: &str) -> String {
    format!(
        "[VER:{ver} FluidNC sim-build (Simulator-SPIFFS) :]\r\n[OPT:MPH]\r\nok\r\n",
        ver = firmware_version
    )
}

/// `$SS` startup-log response.
pub fn startup_log(state: &MachineState) -> String {
    format!(
        concat!(
            "[MSG:INFO: FluidNC v{ver} https://github.com/bdring/FluidNC\r\n",
            "[MSG:INFO: Compiled with Simulator SDK\r\n",
            "[MSG:INFO: Local filesystem type is spiffs\r\n",
            "[MSG:INFO: Configuration file:config.yaml\r\n",
            "[MSG:INFO: Machine {name}\r\n",
            "[MSG:INFO: Board {board}\r\n",
            "[MSG:INFO: Axis count {axis_count}\r\n",
            "[MSG:INFO: Connected - IP is 127.0.0.1\r\n",
            "ok\r\n",
        ),
        ver = state.firmware_version,
        name = SIM_MACHINE_NAME,
        board = SIM_BOARD_NAME,
        axis_count = state.axis_count,
    )
}

#[derive(Serialize)]
struct HomingCfg {
    cycle: u8,
    positive_direction: bool,
    mpos: f64,
    feed_rate: u32,
    seek_rate: u32,
    settle_ms: u32,
}

#[derive(Serialize)]
struct StandardStepper {
    step_pin: &'static str,
    direction_pin: &'static str,
    disable_pin: &'static str,
}

#[derive(Serialize)]
struct Motor0 {
    standard_stepper: StandardStepper,
    limit_neg_pin: &'static str,
}

#[derive(Serialize)]
struct AxisCfg {
    steps_per_mm: f64,
    max_rate_mm_per_min: f64,
    acceleration: f64,
    max_travel_mm: f64,
    soft_limits: bool,
    homing: HomingCfg,
    motor0: Motor0,
}

#[derive(Serialize)]
struct AxesCfg {
    x: AxisCfg,
    y: AxisCfg,
    z: AxisCfg,
}

#[derive(Serialize)]
struct SteppingCfg {
    engine: &'static str,
    idle_ms: u32,
    pulse_us: u32,
    dir_delay_us: u32,
    disable_delay_us: u32,
}

#[derive(Serialize)]
struct SpindleCfg {
    #[serde(rename = "type")]
    kind: &'static str,
    output_pin: &'static str,
    pwm_freq: u32,
    min_rpm: u32,
    max_rpm: u32,
}

#[derive(Serialize)]
struct ProbeCfg {
    pin: &'static str,
    hard_stop: bool,
    check_mode_start: bool,
}

#[derive(Serialize)]
struct CoolantCfg {
    flood_pin: &'static str,
    mist_pin: &'static str,
}

#[derive(Serialize)]
struct SimConfigYaml {
    name: &'static str,
    board: &'static str,
    stepping: SteppingCfg,
    axes: AxesCfg,
    spindle: SpindleCfg,
    probe: ProbeCfg,
    coolant: CoolantCfg,
}

/// Cosmetic per-axis wiring (pins, homing timing) — not modeled by the sim's motion
/// logic, so these stay fixed regardless of live config. Only `steps_per_mm`,
/// `max_rate_mm_per_min`, `acceleration`, and `max_travel_mm` are pulled from live
/// state below, since those are the fields a tester can actually change at runtime.
fn axis_cfg(state: &MachineState, i: usize, homing: HomingCfg, motor0: Motor0) -> AxisCfg {
    AxisCfg {
        steps_per_mm: state.steps_per_mm[i],
        max_rate_mm_per_min: state.max_rate[i],
        acceleration: state.acceleration[i],
        max_travel_mm: state.travel[i],
        soft_limits: false,
        homing,
        motor0,
    }
}

/// `$LocalFS/Show=config.yaml` response: a config.yaml reflecting the sim's current
/// live configuration (travel/max_rate/acceleration/steps_per_mm), not a fixed mockup.
pub fn config_yaml(state: &MachineState) -> String {
    let cfg = SimConfigYaml {
        name: SIM_MACHINE_NAME,
        board: SIM_BOARD_NAME,
        stepping: SteppingCfg {
            engine: "RMT",
            idle_ms: 0,
            pulse_us: 4,
            dir_delay_us: 0,
            disable_delay_us: 0,
        },
        axes: AxesCfg {
            x: axis_cfg(
                state,
                0,
                HomingCfg {
                    cycle: 1,
                    positive_direction: false,
                    mpos: 0.0,
                    feed_rate: 200,
                    seek_rate: 1000,
                    settle_ms: 500,
                },
                Motor0 {
                    standard_stepper: StandardStepper {
                        step_pin: "gpio.12",
                        direction_pin: "gpio.14",
                        disable_pin: "gpio.13",
                    },
                    limit_neg_pin: "gpio.15",
                },
            ),
            y: axis_cfg(
                state,
                1,
                HomingCfg {
                    cycle: 1,
                    positive_direction: false,
                    mpos: 0.0,
                    feed_rate: 200,
                    seek_rate: 1000,
                    settle_ms: 500,
                },
                Motor0 {
                    standard_stepper: StandardStepper {
                        step_pin: "gpio.26",
                        direction_pin: "gpio.27",
                        disable_pin: "gpio.28",
                    },
                    limit_neg_pin: "gpio.29",
                },
            ),
            z: axis_cfg(
                state,
                2,
                HomingCfg {
                    cycle: 2,
                    positive_direction: true,
                    mpos: 0.0,
                    feed_rate: 200,
                    seek_rate: 500,
                    settle_ms: 500,
                },
                Motor0 {
                    standard_stepper: StandardStepper {
                        step_pin: "gpio.30",
                        direction_pin: "gpio.31",
                        disable_pin: "gpio.32",
                    },
                    limit_neg_pin: "gpio.33",
                },
            ),
        },
        spindle: SpindleCfg {
            kind: "PWM",
            output_pin: "gpio.2",
            pwm_freq: 5000,
            min_rpm: 0,
            max_rpm: 24000,
        },
        probe: ProbeCfg {
            pin: "gpio.34",
            hard_stop: true,
            check_mode_start: false,
        },
        coolant: CoolantCfg {
            flood_pin: "gpio.4",
            mist_pin: "gpio.5",
        },
    };

    let yaml = serde_yaml::to_string(&cfg).unwrap_or_default();
    format!("{}{}", yaml.replace('\n', "\r\n"), ok())
}

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
    // Real FluidNC folds the tool length offset into the reported WCO
    // (System.cpp: wco[axis] += gc_state.tool_length_offset[axis]) so clients that
    // compute WPos = MPos - WCO see the corrected work position without knowing TLO exists.
    let mut reported_wco = state.wco;
    for (rw, tlo) in reported_wco.iter_mut().zip(state.tool_length_offset.iter()) {
        *rw += tlo;
    }
    let wco = format_axes(&reported_wco, n);
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
        let offset = if wcs == state.modal.wcs {
            &active_wco
        } else {
            &zero
        };
        out.push_str(&format!("[G{}:{}]\r\n", 54 + wcs, offset));
    }
    out.push_str(&format!("[G28:{}]\r\n", zero));
    out.push_str(&format!("[G30:{}]\r\n", zero));
    out.push_str(&format!("[G92:{}]\r\n", g92));
    out.push_str(&format!("[TLO:{:.3}]\r\n", state.tool_length_offset[2]));
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

    #[test]
    fn status_folds_tlo_into_reported_wco() {
        let mut state = test_state();
        state.tool_length_offset[2] = 2.5;
        let s = status(&state);
        let wco_start = s.find("WCO:").unwrap() + 4;
        let wco_end = s[wco_start..].find('|').map(|i| wco_start + i).unwrap();
        let z: f64 = s[wco_start..wco_end]
            .split(',')
            .nth(2)
            .unwrap()
            .parse()
            .unwrap();
        assert!((z - 2.5).abs() < 1e-6, "wco.z={}", z);
    }

    #[test]
    fn gcode_params_reports_tool_length_offset() {
        let mut state = test_state();
        state.tool_length_offset[2] = -3.75;
        let out = gcode_params(&state);
        assert!(out.contains("[TLO:-3.750]"), "out: {}", out);
    }

    #[test]
    fn greeting_reports_custom_version() {
        let g = greeting("9.9.9");
        assert!(g.contains("Grbl 9.9.9"), "greeting: {}", g);
        assert!(g.contains("[FluidNC v9.9.9"), "greeting: {}", g);
    }

    #[test]
    fn build_info_reports_custom_version() {
        let b = build_info("9.9.9");
        assert!(b.starts_with("[VER:9.9.9"), "build_info: {}", b);
    }

    #[test]
    fn startup_log_reports_state_version_and_axis_count() {
        let mut state = test_state();
        state.firmware_version = "9.9.9".to_string();
        let log = startup_log(&state);
        assert!(log.contains("FluidNC v9.9.9"), "startup_log: {}", log);
        assert!(log.contains("Axis count 3"), "startup_log: {}", log);
    }

    #[test]
    fn config_yaml_reflects_live_travel_and_max_rate() {
        let mut state = test_state();
        state.travel[0] = 456.0;
        state.max_rate[0] = 7777.0;
        let yaml = config_yaml(&state);
        assert!(yaml.contains("max_travel_mm: 456.0"), "yaml: {}", yaml);
        assert!(
            yaml.contains("max_rate_mm_per_min: 7777.0"),
            "yaml: {}",
            yaml
        );
    }
}
