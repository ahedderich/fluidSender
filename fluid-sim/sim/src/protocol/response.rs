use crate::machine::state::{MachineState, AXIS_COUNT};

pub const GREETING: &str = "Grbl 3.7.14 [FluidNC v3.7.14 (Simulator)] ready\r\n[MSG: Machine: Connected]\r\nok\r\n";

pub fn ok() -> String { "ok\r\n".to_string() }

pub fn error(code: u32) -> String { format!("error:{}\r\n", code) }

pub fn msg(text: &str) -> String { format!("[MSG:{}]\r\n", text) }

pub fn alarm(code: u32) -> String { format!("ALARM:{}\r\n", code) }

/// Format a full FluidNC status response.
/// `<State|MPos:x,y,z|WCO:x,y,z|FS:f,s|Pn:pins|A:acc>`
pub fn status(state: &MachineState) -> String {
    let n = state.axis_count.min(AXIS_COUNT);
    let mpos = format_axes(&state.pos, n);
    let wco = format_axes(&state.wco, n);
    let f = state.feed as u64;
    let s = state.spindle_speed as u64;
    let pn = state.limits.pn_string(state.probe.triggered, state.door);

    let mut parts = vec![
        state.status.to_string(),
        format!("MPos:{}", mpos),
        format!("WCO:{}", wco),
        format!("FS:{},{}", f, s),
    ];
    if !pn.is_empty() { parts.push(format!("Pn:{}", pn)); }

    // Accessory state
    let mut acc = String::new();
    if let Some(flag) = state.spindle.accessory_flag() { acc.push(flag); }
    acc.push_str(&state.coolant.accessory_flags());
    if !acc.is_empty() { parts.push(format!("A:{}", acc)); }

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
        pos[0], pos[1], pos[2],
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::machine::state::MachineState;

    fn test_state() -> MachineState {
        let travel = [300.0, 200.0, 80.0, 360.0, 360.0, 360.0];
        MachineState::new(3, travel, 2.0, 1)
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
        let mpos_end = s[mpos_start..].find('|').map(|i| mpos_start + i).unwrap_or(s.len());
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
