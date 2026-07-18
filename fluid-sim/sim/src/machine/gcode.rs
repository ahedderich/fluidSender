use crate::machine::coolant::CoolantState;
use crate::machine::modal::{DistanceMode, MotionMode, Plane, Units};
use crate::machine::motion::{MoveKind, PendingMove};
use crate::machine::spindle::SpindleState;
use crate::machine::state::{MachineState, MachineStatus, AXIS_COUNT};
use crate::protocol::parser::{extract_axes, gcodes, mcodes, word_val, Word};

/// Outcome of interpreting one GCode line.
pub enum InterpretResult {
    /// Enqueue a motion move. Plain moves are category A (`ok` as soon as queued);
    /// probe moves (`probe.is_some()`) are B2 — the connection handler withholds `ok`
    /// until the probe cycle completes and reports `[PRB:...]`.
    Move(PendingMove),
    /// Category C: immediate success — `ok` sent right away.
    Ok,
    /// Error — `error:N` sent.
    Error(u32),
    SoftReset,
    FeedHold,
    CycleStart,
    /// G4 dwell (B2): drains planner then sleeps; `ok` delayed until dwell elapses.
    Dwell(f64),
    /// Soft limit violation detected pre-flight — machine enters alarm.
    Alarm(u32),
    /// B1: state mutation already applied; `ok` delayed until planner drains to 0.
    DrainAndApply,
    /// B2 (M0): planner drains, machine enters Hold; `ok` only after cycle-start (~).
    ProgramPause,
}

/// Returns true if `target` violates soft limits on any linear axis.
/// Uses symmetric travel: valid range is [-travel[i], +travel[i]].
fn soft_limit_violated(target: &[f64; AXIS_COUNT], state: &MachineState) -> bool {
    target
        .iter()
        .zip(state.travel.iter())
        .take(state.axis_count)
        .any(|(t, travel)| t.abs() > travel + 0.001)
}

pub fn interpret(words: &[Word], state: &mut MachineState) -> InterpretResult {
    if !state.is_accepting_commands() {
        return InterpretResult::Error(9); // error:9 = command locked
    }

    let gs = gcodes(words);
    let ms = mcodes(words);
    let f = word_val(words, 'F');
    let s = word_val(words, 'S');

    let mut drain_needed = false;
    let mut pause_needed = false;

    // Update feed rate if F present. modal_feed persists across moves; state.feed is
    // the display/execution rate and may be zeroed by motion completion.
    if let Some(feed) = f {
        state.feed = feed;
        state.modal_feed = feed;
    }

    // S word always updates spindle_speed (category C3 when spindle is off;
    // the spindle-on speed-change drain path is not modelled here).
    if let Some(speed) = s {
        state.spindle_speed = speed;
    }

    // T word (category C): preselects the tool immediately, same as real FluidNC's
    // gc_state.tool — M6 is what actually performs the swap, not T.
    if let Some(t) = word_val(words, 'T') {
        state.tool_number = t.max(0.0) as u32;
    }

    // Modal G codes — G17-G21, G90-G91 are category C (immediate).
    // G54-G59 are B1: WCS switch requires planner drain (FORCE_BUFFER_SYNC_DURING_WCO_CHANGE).
    for &g in &gs {
        match g as u32 {
            17 => state.modal.plane = Plane::Xy,
            18 => state.modal.plane = Plane::Xz,
            19 => state.modal.plane = Plane::Yz,
            20 => state.modal.units = Units::Inch,
            21 => state.modal.units = Units::Mm,
            54 => {
                state.modal.wcs = 1;
                drain_needed = true;
            }
            55 => {
                state.modal.wcs = 2;
                drain_needed = true;
            }
            56 => {
                state.modal.wcs = 3;
                drain_needed = true;
            }
            57 => {
                state.modal.wcs = 4;
                drain_needed = true;
            }
            58 => {
                state.modal.wcs = 5;
                drain_needed = true;
            }
            59 => {
                state.modal.wcs = 6;
                drain_needed = true;
            }
            90 => state.modal.distance = DistanceMode::Absolute,
            91 => state.modal.distance = DistanceMode::Relative,
            _ => {}
        }
    }

    // M codes — B1 commands apply state immediately but set drain_needed so `ok` is
    // delayed until the motion channel (FIFO) confirms all prior moves are done.
    for &m in &ms {
        match m as u32 {
            3 => {
                state.spindle = SpindleState::on_cw(state.spindle_speed);
                drain_needed = true;
            }
            4 => {
                state.spindle = SpindleState::on_ccw(state.spindle_speed);
                drain_needed = true;
            }
            5 => {
                state.spindle = SpindleState::off();
                state.spindle_speed = 0.0;
                drain_needed = true;
            }
            7 => {
                state.coolant = CoolantState::Mist;
                drain_needed = true;
            }
            8 => {
                state.coolant = CoolantState::Flood;
                drain_needed = true;
            }
            9 => {
                state.coolant = CoolantState::Off;
                drain_needed = true;
            }
            6 => {
                // Tool change — B1 (safety: don't swap mid-move). The tool number
                // itself was already applied above by the T-word handling, whether T
                // appeared on this line or a previous one.
                drain_needed = true;
            }
            0 => {
                // B2: drain planner then Hold; `ok` arrives only after cycle-start (~).
                pause_needed = true;
            }
            1 => {} // optional stop — no-op in FluidNC
            2 | 30 => {
                state.status = MachineStatus::Idle;
                state.spindle = SpindleState::off();
                state.coolant = CoolantState::Off;
                drain_needed = true;
            }
            _ => {}
        }
    }

    // Update persistent motion mode from any explicit G0–G3 in this line, and collect
    // the information needed to dispatch modal motion after the loop.
    let has_explicit_motion = gs
        .iter()
        .any(|&g| g == 0.0 || g == 1.0 || g == 2.0 || g == 3.0);
    for &g in &gs {
        match g as u32 {
            0 => state.modal.motion_mode = MotionMode::G0,
            1 => state.modal.motion_mode = MotionMode::G1,
            2 => state.modal.motion_mode = MotionMode::G2,
            3 => state.modal.motion_mode = MotionMode::G3,
            _ => {}
        }
    }
    // G28/G30/G38 own their axis words; exclude these from modal-motion dispatch.
    let has_blocking_g = gs.iter().any(|&g| {
        g == 28.0
            || (g - 28.1).abs() < 0.01
            || g == 30.0
            || (g - 30.1).abs() < 0.01
            || (g - 38.2).abs() < 0.01
            || (g - 38.3).abs() < 0.01
            || (g - 38.4).abs() < 0.01
            || (g - 38.5).abs() < 0.01
    });
    let modal_axes = extract_axes(words);
    let has_axis_words = modal_axes.iter().any(|a| a.is_some());

    // G53: non-modal "this line only" override — axis words are used as literal
    // machine coordinates, bypassing WCS/G92/TLO entirely (matches FluidNC's
    // NonModal::AbsoluteOverride handling in GCode.cpp).
    let machine_coords = gs.iter().any(|&g| (g - 53.0).abs() < 0.01);

    // Motion / coordinate G codes.
    for &g in &gs {
        match g {
            // G0 rapid, G1 linear — category A
            g if g == 0.0 || g == 1.0 => {
                let axes = extract_axes(words);
                let target = resolve_target(state, axes, machine_coords);
                if soft_limit_violated(&target, state) {
                    state.status = MachineStatus::Alarm;
                    return InterpretResult::Alarm(2);
                }
                let feed = if g == 0.0 {
                    max_rate_for_move(state, &target)
                } else {
                    state.modal_feed
                };
                state.planned_pos = target;
                return InterpretResult::Move(PendingMove {
                    kind: MoveKind::Linear,
                    target,
                    feed,
                    probe: None,
                });
            }
            // G2/G3 arc — category A
            g if g == 2.0 || g == 3.0 => {
                let axes = extract_axes(words);
                let target = resolve_target(state, axes, machine_coords);
                if soft_limit_violated(&target, state) {
                    state.status = MachineStatus::Alarm;
                    return InterpretResult::Alarm(2);
                }
                let i = word_val(words, 'I').unwrap_or(0.0);
                let j = word_val(words, 'J').unwrap_or(0.0);
                let k = word_val(words, 'K').unwrap_or(0.0);
                let feed = state.modal_feed;
                state.planned_pos = target;
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
            // G4 dwell — B2: drains planner then sleeps; `ok` delayed until dwell elapses
            4.0 => {
                let p = word_val(words, 'P').unwrap_or(0.0);
                return InterpretResult::Dwell(p);
            }
            // G10 L2/L20 Pn — B1: set WCS offset (FORCE_BUFFER_SYNC_DURING_WCO_CHANGE + NVS)
            10.0 => {
                let l = word_val(words, 'L').unwrap_or(0.0) as u32;
                if l == 20 {
                    let axes = extract_axes(words);
                    for (i, axis) in axes.iter().enumerate() {
                        if let Some(v) = axis {
                            let v_mm = state.modal.units.to_mm(*v);
                            state.wco[i] = state.pos[i] - v_mm;
                        }
                    }
                }
                return if pause_needed {
                    InterpretResult::ProgramPause
                } else {
                    InterpretResult::DrainAndApply
                };
            }
            // G28 go to stored position — category A
            28.0 => {
                let target = state.modal.g28_pos.unwrap_or([0.0; AXIS_COUNT]);
                if soft_limit_violated(&target, state) {
                    state.status = MachineStatus::Alarm;
                    return InterpretResult::Alarm(2);
                }
                let feed = max_rate_for_move(state, &target);
                state.planned_pos = target;
                return InterpretResult::Move(PendingMove {
                    kind: MoveKind::Linear,
                    target,
                    feed,
                    probe: None,
                });
            }
            // G28.1 store current position for G28 — B1 (NVS write drains planner)
            g if (g - 28.1).abs() < 0.01 => {
                // planned_pos is the settled position after all queued moves drain.
                state.modal.g28_pos = Some(state.planned_pos);
                return if pause_needed {
                    InterpretResult::ProgramPause
                } else {
                    InterpretResult::DrainAndApply
                };
            }
            // G30 secondary predefined position — category A
            30.0 => {
                let target = state.modal.g30_pos.unwrap_or([0.0; AXIS_COUNT]);
                if soft_limit_violated(&target, state) {
                    state.status = MachineStatus::Alarm;
                    return InterpretResult::Alarm(2);
                }
                let feed = max_rate_for_move(state, &target);
                state.planned_pos = target;
                return InterpretResult::Move(PendingMove {
                    kind: MoveKind::Linear,
                    target,
                    feed,
                    probe: None,
                });
            }
            // G30.1 store current position for G30 — B1 (NVS write drains planner)
            g if (g - 30.1).abs() < 0.01 => {
                state.modal.g30_pos = Some(state.planned_pos);
                return if pause_needed {
                    InterpretResult::ProgramPause
                } else {
                    InterpretResult::DrainAndApply
                };
            }
            // G38.2–G38.5 probe — B2: drains planner then blocks until probe done
            g if (g - 38.2).abs() < 0.01
                || (g - 38.3).abs() < 0.01
                || (g - 38.4).abs() < 0.01
                || (g - 38.5).abs() < 0.01 =>
            {
                let axes = extract_axes(words);
                let target = resolve_target(state, axes, machine_coords);
                let feed = state.modal_feed;
                let error_on_miss = (g - 38.2).abs() < 0.01 || (g - 38.4).abs() < 0.01;
                let away = (g - 38.4).abs() < 0.01 || (g - 38.5).abs() < 0.01;
                state.planned_pos = target;
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
            53.0 => {} // consumed via `machine_coords` above, not here
            // G92 set coordinate offset — B1 (FORCE_BUFFER_SYNC_DURING_WCO_CHANGE)
            92.0 => {
                let axes = extract_axes(words);
                for (i, axis) in axes.iter().enumerate() {
                    if let Some(v) = axis {
                        let v_mm = state.modal.units.to_mm(*v);
                        state.modal.g92_offset[i] = state.pos[i] - state.wco[i] - v_mm;
                    }
                }
                return if pause_needed {
                    InterpretResult::ProgramPause
                } else {
                    InterpretResult::DrainAndApply
                };
            }
            // G92.1 clear G92 offsets — B1
            g if (g - 92.1).abs() < 0.01 => {
                state.modal.g92_offset = [0.0; AXIS_COUNT];
                return if pause_needed {
                    InterpretResult::ProgramPause
                } else {
                    InterpretResult::DrainAndApply
                };
            }
            // G43.1 dynamic tool length offset (Z only) — B1 (FORCE_BUFFER_SYNC_DURING_WCO_CHANGE)
            g if (g - 43.1).abs() < 0.01 => {
                if let Some(z) = word_val(words, 'Z') {
                    state.tool_length_offset[2] = state.modal.units.to_mm(z);
                }
                return if pause_needed {
                    InterpretResult::ProgramPause
                } else {
                    InterpretResult::DrainAndApply
                };
            }
            // G49 cancel tool length offset — B1
            49.0 => {
                state.tool_length_offset = [0.0; AXIS_COUNT];
                return if pause_needed {
                    InterpretResult::ProgramPause
                } else {
                    InterpretResult::DrainAndApply
                };
            }
            _ => {}
        }
    }

    // Modal motion: axis words present, no explicit G0–G3, and no G28/G30/G38 that
    // would claim those axis words for a different purpose.  Dispatch using the
    // persistent motion mode — mirrors FluidNC's execute_line() behaviour for CAM
    // files that omit the G word after the first occurrence.
    if !has_explicit_motion && !has_blocking_g && has_axis_words && !pause_needed && !drain_needed {
        let target = resolve_target(state, modal_axes, machine_coords);
        if soft_limit_violated(&target, state) {
            state.status = MachineStatus::Alarm;
            return InterpretResult::Alarm(2);
        }
        state.planned_pos = target;
        return match state.modal.motion_mode {
            MotionMode::G0 => InterpretResult::Move(PendingMove {
                kind: MoveKind::Linear,
                target,
                feed: max_rate_for_move(state, &target),
                probe: None,
            }),
            MotionMode::G1 => InterpretResult::Move(PendingMove {
                kind: MoveKind::Linear,
                target,
                feed: state.modal_feed,
                probe: None,
            }),
            MotionMode::G2 | MotionMode::G3 => {
                let i = word_val(words, 'I').unwrap_or(0.0);
                let j = word_val(words, 'J').unwrap_or(0.0);
                let k = word_val(words, 'K').unwrap_or(0.0);
                InterpretResult::Move(PendingMove {
                    kind: MoveKind::Arc {
                        clockwise: state.modal.motion_mode == MotionMode::G2,
                        offset: [i, j, k],
                    },
                    target,
                    feed: state.modal_feed,
                    probe: None,
                })
            }
        };
    }

    if pause_needed {
        InterpretResult::ProgramPause
    } else if drain_needed {
        InterpretResult::DrainAndApply
    } else {
        InterpretResult::Ok
    }
}

/// Resolve target machine position from axis words + current modal state.
/// Unspecified axes stay at `planned_pos`; relative offsets are applied to `planned_pos`
/// so that queued G91 commands chain off the planned end of the previous move rather
/// than the live mid-move position.
///
/// `machine_coords` is true when G53 was present on this line — per FluidNC's
/// NonModal::AbsoluteOverride handling, the programmed value is then used as a
/// literal machine coordinate, bypassing WCS/G92/TLO (and distance mode) entirely.
pub fn resolve_target(
    state: &MachineState,
    axes: [Option<f64>; AXIS_COUNT],
    machine_coords: bool,
) -> [f64; AXIS_COUNT] {
    let mut target = state.planned_pos;
    for i in 0..AXIS_COUNT {
        let Some(v) = axes[i] else { continue };
        let v_mm = state.modal.units.to_mm(v);
        target[i] = if machine_coords {
            v_mm
        } else {
            match state.modal.distance {
                DistanceMode::Absolute => v_mm + state.wco[i] + state.tool_length_offset[i],
                DistanceMode::Relative => state.planned_pos[i] + v_mm,
            }
        };
    }
    target
}

/// Vector rate for a rapid (G0/G28/G30). FluidNC rapids ignore the F word entirely:
/// the move runs at the fastest rate where no participating axis exceeds its
/// configured max_rate. Duration is dominated by the slowest axis, so
/// rate = total_distance / max_i(dist_i / max_rate_i).
fn max_rate_for_move(state: &MachineState, target: &[f64; AXIS_COUNT]) -> f64 {
    let mut dist_sq = 0.0;
    let mut duration_min = 0.0f64;
    for ((t, p), rate) in target
        .iter()
        .zip(&state.planned_pos)
        .zip(&state.max_rate)
        .take(state.axis_count.min(AXIS_COUNT))
    {
        let d = (t - p).abs();
        dist_sq += d * d;
        if d > 1e-9 && *rate > 0.0 {
            duration_min = duration_min.max(d / rate);
        }
    }
    let dist = dist_sq.sqrt();
    if duration_min <= 0.0 {
        // Zero-length move (or unconfigured rates) — rate is irrelevant, snap fast.
        return 3000.0;
    }
    dist / duration_min
}

/// Interpret a jog command ($J=...).
/// Returns None if the jog is rejected (machine not ready), else the pending move.
pub fn interpret_jog(words: &[Word], state: &mut MachineState) -> Option<PendingMove> {
    if !matches!(state.status, MachineStatus::Idle | MachineStatus::Run) {
        return None;
    }
    // A new jog command overrides any pending cancel.
    state.jog_cancel_pending = false;

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
    // $J= jogs never carry G53.
    let target = resolve_target(state, axes, false);
    state.modal = saved_modal;

    let feed = word_val(words, 'F').unwrap_or(state.modal_feed).max(1.0);

    // Advance planned_pos so chained relative jogs resolve from planned end
    state.planned_pos = target;

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
        MachineState::new(3, travel, Default::default(), 1)
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
        // Machine at X=-150, G10 L20 X0 means WCO.x = -150 so WPos.x = 0
        let words = parse_gcode_words("G10 L20 P1 X0").unwrap();
        interpret(&words, &mut state);
        assert!(
            (state.wco[0] + 150.0).abs() < 1e-6,
            "wco.x={}",
            state.wco[0]
        );
    }

    #[test]
    fn g53_bypasses_wco_and_tlo_for_this_line_only() {
        let mut state = default_state();
        // Non-zero WCO and TLO, both of which G53 must ignore. Kept small enough
        // that the second (non-G53) move below still lands within travel.z=80.
        state.wco[2] = -20.0;
        state.tool_length_offset[2] = 3.5;

        let words = parse_gcode_words("G53 G0 Z-10").unwrap();
        let result = interpret(&words, &mut state);
        match result {
            InterpretResult::Move(mv) => {
                assert!(
                    (mv.target[2] - (-10.0)).abs() < 1e-9,
                    "G53 target.z should be the literal machine coordinate, got {}",
                    mv.target[2]
                );
            }
            _ => panic!("expected a move"),
        }

        // G53 is non-modal — the very next line (no G53) must resolve through
        // WCO/TLO again, exactly as before. `interpret()` already advanced
        // planned_pos to the G53 move's target, so this chains off that.
        let words = parse_gcode_words("G0 Z-10").unwrap();
        let result = interpret(&words, &mut state);
        match result {
            InterpretResult::Move(mv) => {
                assert!(
                    (mv.target[2] - (-10.0 - 20.0 + 3.5)).abs() < 1e-9,
                    "target.z={}",
                    mv.target[2]
                );
            }
            _ => panic!("expected a move"),
        }
    }

    #[test]
    fn g43_1_sets_tool_length_offset_and_shifts_target() {
        let mut state = default_state();
        let words = parse_gcode_words("G43.1 Z1.234").unwrap();
        let result = interpret(&words, &mut state);
        assert!(matches!(result, InterpretResult::DrainAndApply));
        assert!((state.tool_length_offset[2] - 1.234).abs() < 1e-9);

        // A subsequent absolute Z move must resolve through the new TLO, exactly
        // like it already does through WCO.
        let words = parse_gcode_words("G1 Z0 F100").unwrap();
        let result = interpret(&words, &mut state);
        match result {
            InterpretResult::Move(mv) => {
                assert!(
                    (mv.target[2] - 1.234).abs() < 1e-9,
                    "target.z={}",
                    mv.target[2]
                );
            }
            _ => panic!("expected a move"),
        }
    }

    #[test]
    fn g49_clears_tool_length_offset() {
        let mut state = default_state();
        interpret(&parse_gcode_words("G43.1 Z5.0").unwrap(), &mut state);
        assert!((state.tool_length_offset[2] - 5.0).abs() < 1e-9);

        let result = interpret(&parse_gcode_words("G49").unwrap(), &mut state);
        assert!(matches!(result, InterpretResult::DrainAndApply));
        assert_eq!(state.tool_length_offset, [0.0; AXIS_COUNT]);
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
    fn standalone_t_word_preselects_without_drain() {
        let mut state = default_state();
        let words = parse_gcode_words("T5").unwrap();
        let result = interpret(&words, &mut state);
        assert_eq!(state.tool_number, 5);
        assert!(matches!(result, InterpretResult::Ok));
    }

    #[test]
    fn m6_applies_tool_number_and_drains() {
        let mut state = default_state();
        let words = parse_gcode_words("T3 M6").unwrap();
        let result = interpret(&words, &mut state);
        assert_eq!(state.tool_number, 3);
        assert!(matches!(result, InterpretResult::DrainAndApply));
    }

    #[test]
    fn m6_reuses_previously_selected_tool() {
        let mut state = default_state();
        let words = parse_gcode_words("T7").unwrap();
        interpret(&words, &mut state);
        let words = parse_gcode_words("M6").unwrap();
        let result = interpret(&words, &mut state);
        assert_eq!(state.tool_number, 7);
        assert!(matches!(result, InterpretResult::DrainAndApply));
    }

    #[test]
    fn g0_rapid_ignores_modal_feed() {
        let mut state = default_state();
        state.modal_feed = 5.0; // e.g. left over from a slow probe retract
                                // Z-only move → limited by the Z max rate (1000), not the F word.
        let words = parse_gcode_words("G0 Z-50").unwrap();
        match interpret(&words, &mut state) {
            InterpretResult::Move(mv) => {
                assert!((mv.feed - 1000.0).abs() < 1e-6, "feed={}", mv.feed)
            }
            _ => panic!("expected Move"),
        }
    }

    #[test]
    fn g0_rapid_rate_limited_by_slowest_axis() {
        let mut state = default_state();
        // From (-150, -100, 5): dx=100 (max 5000), dz=55 (max 1000).
        // Duration = max(100/5000, 55/1000) = 0.055 min → rate = |d| / 0.055.
        let words = parse_gcode_words("G0 X-50 Z-50").unwrap();
        let expected = (100.0f64.powi(2) + 55.0f64.powi(2)).sqrt() / 0.055;
        match interpret(&words, &mut state) {
            InterpretResult::Move(mv) => {
                assert!((mv.feed - expected).abs() < 1e-6, "feed={}", mv.feed)
            }
            _ => panic!("expected Move"),
        }
    }

    #[test]
    fn g38_2_produces_probe_move() {
        let mut state = default_state();
        let words = parse_gcode_words("G38.2 Z-10 F100").unwrap();
        state.feed = 100.0;
        let result = interpret(&words, &mut state);
        assert!(matches!(result, InterpretResult::Move(_)));
    }

    #[test]
    fn explicit_g1_sets_motion_mode() {
        let mut state = default_state();
        let words = parse_gcode_words("G1 X-100 F500").unwrap();
        interpret(&words, &mut state);
        assert_eq!(state.modal.motion_mode, MotionMode::G1);
    }

    #[test]
    fn modal_g1_line_dispatches_move() {
        let mut state = default_state();
        // Set G1 mode via explicit command
        let words = parse_gcode_words("G1 X-100 F500").unwrap();
        interpret(&words, &mut state);

        // Modal line: no G word, just axis words
        let words = parse_gcode_words("X-120 Y-50").unwrap();
        let result = interpret(&words, &mut state);
        assert!(
            matches!(result, InterpretResult::Move(ref mv) if mv.feed == 500.0 && matches!(mv.kind, MoveKind::Linear)),
            "expected G1 modal move"
        );
        assert!((state.planned_pos[0] + 120.0).abs() < 1e-6);
        assert!((state.planned_pos[1] + 50.0).abs() < 1e-6);
    }

    #[test]
    fn modal_g0_line_dispatches_rapid() {
        let mut state = default_state();
        // Default motion mode is G0; no need for explicit setup
        let words = parse_gcode_words("X-80").unwrap();
        let result = interpret(&words, &mut state);
        assert!(
            matches!(result, InterpretResult::Move(ref mv) if matches!(mv.kind, MoveKind::Linear)),
            "expected rapid modal move"
        );
    }

    #[test]
    fn modal_g2_arc_dispatches_arc_move() {
        let mut state = default_state();
        state.modal_feed = 600.0;
        // Set G2 mode
        let words = parse_gcode_words("G2 X-100 Y-100 I25 J0").unwrap();
        interpret(&words, &mut state);
        assert_eq!(state.modal.motion_mode, MotionMode::G2);

        // Modal arc continuation
        let words = parse_gcode_words("X-80 Y-120 I10 J0").unwrap();
        let result = interpret(&words, &mut state);
        assert!(
            matches!(result, InterpretResult::Move(ref mv) if matches!(mv.kind, MoveKind::Arc { clockwise: true, .. })),
            "expected G2 modal arc"
        );
    }

    #[test]
    fn g28_axis_words_not_treated_as_modal_motion() {
        let mut state = default_state();
        // Set G1 mode first
        let words = parse_gcode_words("G1 X-50 F300").unwrap();
        interpret(&words, &mut state);
        // G28 with axis word must NOT dispatch a G1 modal move
        let words = parse_gcode_words("G28 G91 Z0").unwrap();
        let result = interpret(&words, &mut state);
        // G28 returns a rapid Move (go to stored position), not a G1 feed move
        assert!(
            matches!(result, InterpretResult::Move(ref mv) if matches!(mv.kind, MoveKind::Linear)),
            "G28 should return its own Move, not a modal G1"
        );
        // The target of G28 is the stored g28_pos (or [0;6] by default), not X-50
        assert_eq!(
            state.modal.motion_mode,
            MotionMode::G1,
            "motion mode unchanged by G28"
        );
    }

    #[test]
    fn motion_mode_not_reset_on_soft_reset() {
        let mut state = default_state();
        let words = parse_gcode_words("G1 X-50 F300").unwrap();
        interpret(&words, &mut state);
        assert_eq!(state.modal.motion_mode, MotionMode::G1);
        state.soft_reset();
        // soft_reset must NOT clear motion_mode (matches FluidNC firmware behaviour)
        assert_eq!(state.modal.motion_mode, MotionMode::G1);
    }
}
