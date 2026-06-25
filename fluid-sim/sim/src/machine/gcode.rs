use crate::machine::modal::{DistanceMode, Plane, Units};
use crate::machine::motion::{MoveKind, PendingMove};
use crate::machine::spindle::SpindleState;
use crate::machine::coolant::CoolantState;
use crate::machine::state::{MachineState, MachineStatus, AXIS_COUNT};
use crate::protocol::parser::{Word, extract_axes, gcodes, mcodes, word_val};

/// Outcome of interpreting one GCode line.
pub enum InterpretResult {
    /// Enqueue a motion/probe move (async, `ok` sent immediately before move completes).
    Move(PendingMove),
    /// Immediate success — return `ok` right away.
    Ok,
    /// Error — return `error:N`.
    Error(u32),
    /// Soft reset requested.
    SoftReset,
    /// Feed hold.
    FeedHold,
    /// Cycle start.
    CycleStart,
}

pub fn interpret(words: &[Word], state: &mut MachineState) -> InterpretResult {
    if !state.is_accepting_commands() {
        return InterpretResult::Error(9); // error:9 = command locked
    }

    let gs = gcodes(words);
    let ms = mcodes(words);
    let f = word_val(words, 'F');
    let s = word_val(words, 'S');

    // Update feed rate if F present
    if let Some(feed) = f {
        state.feed = feed;
    }

    // Process modal G codes first (units, plane, distance, WCS)
    for &g in &gs {
        match g as u32 {
            17 => state.modal.plane = Plane::Xy,
            18 => state.modal.plane = Plane::Xz,
            19 => state.modal.plane = Plane::Yz,
            20 => state.modal.units = Units::Inch,
            21 => state.modal.units = Units::Mm,
            54 => state.modal.wcs = 1,
            55 => state.modal.wcs = 2,
            56 => state.modal.wcs = 3,
            57 => state.modal.wcs = 4,
            58 => state.modal.wcs = 5,
            59 => state.modal.wcs = 6,
            90 => state.modal.distance = DistanceMode::Absolute,
            91 => state.modal.distance = DistanceMode::Relative,
            _ => {}
        }
    }

    // M codes
    for &m in &ms {
        match m as u32 {
            3 => { // spindle CW
                let rpm = s.unwrap_or(0.0);
                state.spindle = SpindleState::on_cw(rpm);
                state.spindle_speed = rpm;
            }
            4 => { // spindle CCW
                let rpm = s.unwrap_or(0.0);
                state.spindle = SpindleState::on_ccw(rpm);
                state.spindle_speed = rpm;
            }
            5 => {
                state.spindle = SpindleState::off();
                state.spindle_speed = 0.0;
            }
            7 => state.coolant = CoolantState::Mist,
            8 => state.coolant = CoolantState::Flood,
            9 => state.coolant = CoolantState::Off,
            0 | 1 => { // program pause
                state.status = MachineStatus::Hold;
            }
            2 | 30 => { // program end
                state.status = MachineStatus::Idle;
                state.spindle = SpindleState::off();
                state.coolant = CoolantState::Off;
            }
            _ => {} // ignore unknown M codes
        }
    }

    // Motion / coordinate G codes
    for &g in &gs {
        match g {
            // G0 rapid, G1 linear
            g if g == 0.0 || g == 1.0 => {
                let axes = extract_axes(words);
                let target = resolve_target(state, axes);
                let feed = if g == 0.0 {
                    // Rapid: use max rate for slowest axis involved
                    max_rate_for_move(state, &target)
                } else {
                    state.feed
                };
                return InterpretResult::Move(PendingMove {
                    kind: MoveKind::Linear,
                    target,
                    feed,
                    probe: None,
                });
            }
            // G2/G3 arc
            g if g == 2.0 || g == 3.0 => {
                let axes = extract_axes(words);
                let target = resolve_target(state, axes);
                let i = word_val(words, 'I').unwrap_or(0.0);
                let j = word_val(words, 'J').unwrap_or(0.0);
                let k = word_val(words, 'K').unwrap_or(0.0);
                let feed = state.feed;
                return InterpretResult::Move(PendingMove {
                    kind: MoveKind::Arc {
                        clockwise: g == 2.0,
                        offset: [i, j, k],
                    },
                    target,
                    feed,
                    probe: None,
                });
            }
            // G4 dwell
            g if g == 4.0 => {
                let p = word_val(words, 'P').unwrap_or(0.0);
                return InterpretResult::Move(PendingMove {
                    kind: MoveKind::Dwell { seconds: p },
                    target: state.pos,
                    feed: 0.0,
                    probe: None,
                });
            }
            // G10 L20 Pn — set WCO so current WPos = specified value
            g if g == 10.0 => {
                let l = word_val(words, 'L').unwrap_or(0.0) as u32;
                if l == 20 {
                    let axes = extract_axes(words);
                    for i in 0..AXIS_COUNT {
                        if let Some(v) = axes[i] {
                            let v_mm = state.modal.units.to_mm(v);
                            state.wco[i] = state.pos[i] - v_mm;
                        }
                    }
                }
                return InterpretResult::Ok;
            }
            // G28 go to stored position
            g if g == 28.0 => {
                if let Some(stored) = state.modal.g28_pos {
                    return InterpretResult::Move(PendingMove {
                        kind: MoveKind::Linear,
                        target: stored,
                        feed: max_rate_for_move(state, &stored),
                        probe: None,
                    });
                }
                // No stored pos: go to machine zero
                let home = [0.0; AXIS_COUNT];
                return InterpretResult::Move(PendingMove {
                    kind: MoveKind::Linear,
                    target: home,
                    feed: max_rate_for_move(state, &home),
                    probe: None,
                });
            }
            // G28.1 store current position for G28
            g if (g - 28.1).abs() < 0.01 => {
                state.modal.g28_pos = Some(state.pos);
                return InterpretResult::Ok;
            }
            // G30 secondary predefined position
            g if g == 30.0 => {
                if let Some(stored) = state.modal.g30_pos {
                    return InterpretResult::Move(PendingMove {
                        kind: MoveKind::Linear,
                        target: stored,
                        feed: max_rate_for_move(state, &stored),
                        probe: None,
                    });
                }
                let home = [0.0; AXIS_COUNT];
                return InterpretResult::Move(PendingMove {
                    kind: MoveKind::Linear,
                    target: home,
                    feed: max_rate_for_move(state, &home),
                    probe: None,
                });
            }
            // G38.2 probe toward, error on miss
            // G38.3 probe toward, no error
            // G38.4 probe away, error on miss
            // G38.5 probe away, no error
            g if (g - 38.2).abs() < 0.01 || (g - 38.3).abs() < 0.01
              || (g - 38.4).abs() < 0.01 || (g - 38.5).abs() < 0.01 =>
            {
                let axes = extract_axes(words);
                let target = resolve_target(state, axes);
                let feed = state.feed;
                let error_on_miss = (g - 38.2).abs() < 0.01 || (g - 38.4).abs() < 0.01;
                let away = (g - 38.4).abs() < 0.01 || (g - 38.5).abs() < 0.01;
                return InterpretResult::Move(PendingMove {
                    kind: MoveKind::Linear,
                    target,
                    feed,
                    probe: Some(crate::machine::motion::ProbeConfig {
                        error_on_miss,
                        probe_away: away,
                    }),
                });
            }
            // G53 machine coordinate one-shot (handled in resolve_target via word)
            g if g == 53.0 => {} // resolved at target computation time
            // G92 set coordinate offset
            g if g == 92.0 => {
                let axes = extract_axes(words);
                for i in 0..AXIS_COUNT {
                    if let Some(v) = axes[i] {
                        let v_mm = state.modal.units.to_mm(v);
                        // G92 sets offset so current pos reads as v_mm in WCS
                        state.modal.g92_offset[i] = state.pos[i] - state.wco[i] - v_mm;
                    }
                }
                return InterpretResult::Ok;
            }
            // G92.1 clear G92 offsets
            g if (g - 92.1).abs() < 0.01 => {
                state.modal.g92_offset = [0.0; AXIS_COUNT];
                return InterpretResult::Ok;
            }
            _ => {}
        }
    }

    InterpretResult::Ok
}

/// Resolve target machine position from axis words + current modal state.
pub fn resolve_target(state: &MachineState, axes: [Option<f64>; AXIS_COUNT]) -> [f64; AXIS_COUNT] {
    let mut target = state.pos;
    for i in 0..AXIS_COUNT {
        let Some(v) = axes[i] else { continue };
        let v_mm = state.modal.units.to_mm(v);
        target[i] = match state.modal.distance {
            DistanceMode::Absolute => v_mm + state.wco[i],
            DistanceMode::Relative => state.pos[i] + v_mm,
        };
    }
    target
}

fn max_rate_for_move(state: &MachineState, _target: &[f64; AXIS_COUNT]) -> f64 {
    // Use a default rapid feed; in a full implementation would use per-axis max_rate
    // For now use the feed rate already set, with a reasonable default minimum
    if state.feed > 0.0 { state.feed } else { 3000.0 }
}

/// Interpret a jog command ($J=...).
/// Returns None if the jog is rejected (machine not ready), else the pending move.
pub fn interpret_jog(words: &[Word], state: &mut MachineState) -> Option<PendingMove> {
    if !matches!(state.status, MachineStatus::Idle) { return None; }

    // $J always runs in relative or absolute based on G90/G91 in the jog command
    let mut jog_modal = state.modal.clone();
    for w in words {
        match (w.letter, w.value as u32) {
            ('G', 90) => jog_modal.distance = DistanceMode::Absolute,
            ('G', 91) => jog_modal.distance = DistanceMode::Relative,
            _ => {}
        }
    }

    // Temporarily swap modal for target calculation
    let saved_modal = std::mem::replace(&mut state.modal, jog_modal);
    let axes = extract_axes(words);
    let target = resolve_target(state, axes);
    state.modal = saved_modal;

    let feed = word_val(words, 'F').unwrap_or(state.feed).max(1.0);

    Some(PendingMove {
        kind: MoveKind::Jog,
        target,
        feed,
        probe: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::machine::spindle::SpindleMode;
    use crate::protocol::parser::parse_gcode_words;

    fn default_state() -> MachineState {
        let travel = [300.0, 200.0, 80.0, 360.0, 360.0, 360.0];
        MachineState::new(3, travel, 2.0, 1)
    }

    #[test]
    fn g90_g91_modal_switch() {
        let mut state = default_state();
        let words = parse_gcode_words("G91").unwrap();
        interpret(&words, &mut state);
        assert_eq!(state.modal.distance, DistanceMode::Relative);

        let words = parse_gcode_words("G90").unwrap();
        interpret(&words, &mut state);
        assert_eq!(state.modal.distance, DistanceMode::Absolute);
    }

    #[test]
    fn g10_l20_updates_wco() {
        let mut state = default_state();
        // Machine at X=150, G10 L20 X0 means WCO.x = 150 so WPos.x = 0
        let words = parse_gcode_words("G10 L20 P1 X0").unwrap();
        interpret(&words, &mut state);
        assert!((state.wco[0] - 150.0).abs() < 1e-6, "wco.x={}", state.wco[0]);
    }

    #[test]
    fn g54_switches_wcs() {
        let mut state = default_state();
        let words = parse_gcode_words("G55").unwrap();
        interpret(&words, &mut state);
        assert_eq!(state.modal.wcs, 2);
    }

    #[test]
    fn m3_sets_spindle() {
        let mut state = default_state();
        let words = parse_gcode_words("M3 S1500").unwrap();
        interpret(&words, &mut state);
        assert_eq!(state.spindle.mode, SpindleMode::Cw);
        assert!((state.spindle_speed - 1500.0).abs() < 1e-6);
    }

    #[test]
    fn m5_stops_spindle() {
        let mut state = default_state();
        let words = parse_gcode_words("M3 S1000").unwrap();
        interpret(&words, &mut state);
        let words = parse_gcode_words("M5").unwrap();
        interpret(&words, &mut state);
        assert_eq!(state.spindle.mode, SpindleMode::Off);
        assert_eq!(state.spindle_speed, 0.0);
    }

    #[test]
    fn m7_m9_coolant() {
        let mut state = default_state();
        let words = parse_gcode_words("M7").unwrap();
        interpret(&words, &mut state);
        assert_eq!(state.coolant, CoolantState::Mist);
        let words = parse_gcode_words("M9").unwrap();
        interpret(&words, &mut state);
        assert_eq!(state.coolant, CoolantState::Off);
    }

    #[test]
    fn g38_2_produces_probe_move() {
        let mut state = default_state();
        let words = parse_gcode_words("G38.2 Z-10 F100").unwrap();
        state.feed = 100.0;
        let result = interpret(&words, &mut state);
        assert!(matches!(result, InterpretResult::Move(_)));
    }
}
