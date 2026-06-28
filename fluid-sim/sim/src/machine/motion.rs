use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time;
use std::sync::Arc; // used in tests

use crate::machine::probe::{check_probe_contact, ProbeHit};
use crate::machine::state::{MachineState, MachineStatus, SharedMachineState, StateBroadcast, AXIS_COUNT};

/// Probe options for a motion move that behaves as a probing cycle.
#[derive(Debug, Clone)]
pub struct ProbeConfig {
    /// If true, reaching target without contact is error:54.
    pub error_on_miss: bool,
    /// If true, probe away (contact *loss* triggers, not contact).
    pub probe_away: bool,
}

#[derive(Debug, Clone)]
pub enum MoveKind {
    Linear,
    Arc {
        clockwise: bool,
        /// I, J, K centre offsets relative to current position
        offset: [f64; 3],
    },
    Jog,
    Dwell { seconds: f64 },
}

#[derive(Debug, Clone)]
pub struct PendingMove {
    pub kind: MoveKind,
    pub target: [f64; AXIS_COUNT],
    pub feed: f64,
    pub probe: Option<ProbeConfig>,
}

/// Result sent back to the connection handler after a move completes.
#[derive(Debug)]
pub enum MoveResult {
    Ok,
    ProbeContact([f64; 3]),
    ProbeNoContact,
    Alarm(u32),
}

pub type MoveTx = mpsc::Sender<(PendingMove, tokio::sync::oneshot::Sender<MoveResult>)>;
pub type MoveRx = mpsc::Receiver<(PendingMove, tokio::sync::oneshot::Sender<MoveResult>)>;

/// Spawn the motion controller task. Returns the channel sender used to enqueue moves.
pub fn spawn_motion_task(
    shared: SharedMachineState,
    broadcast: StateBroadcast,
    tick_hz: u32,
) -> MoveTx {
    let (tx, rx) = mpsc::channel(32);
    tokio::spawn(motion_loop(shared, broadcast, rx, tick_hz));
    tx
}

async fn motion_loop(
    shared: SharedMachineState,
    broadcast: StateBroadcast,
    mut rx: MoveRx,
    tick_hz: u32,
) {
    let dt = 1.0 / tick_hz as f64;
    let interval_dur = Duration::from_secs_f64(dt);

    while let Some((mv, result_tx)) = rx.recv().await {
        // Capture epoch at dequeue time — if a soft_reset happened between when this move
        // was queued and now, the epoch will differ and execute_move will skip it.
        let epoch = { shared.read().await.reset_epoch };
        let is_dwell = matches!(mv.kind, MoveKind::Dwell { .. });
        let result = execute_move(&shared, &broadcast, &mv, dt, interval_dur, epoch).await;
        // Decrement planner count — but NOT for dwell: G4 drains the planner, never fills it.
        if !is_dwell {
            let mut state = shared.write().await;
            if state.planner_buf_used > 0 { state.planner_buf_used -= 1; }
            let _ = broadcast.send(());
        }
        let _ = result_tx.send(result);
    }
}

async fn execute_move(
    shared: &SharedMachineState,
    broadcast: &StateBroadcast,
    mv: &PendingMove,
    dt: f64,
    interval_dur: Duration,
    epoch: u64,
) -> MoveResult {
    match &mv.kind {
        MoveKind::Dwell { seconds } => {
            {
                let mut state = shared.write().await;
                if state.reset_epoch != epoch { return MoveResult::Ok; }
                state.status = MachineStatus::Run;
                let _ = broadcast.send(());
            }
            let millis = (*seconds * 1000.0) as u64;
            time::sleep(Duration::from_millis(millis)).await;
            {
                let mut state = shared.write().await;
                if state.reset_epoch != epoch { return MoveResult::Ok; }
                // Dwell always completes to Idle — all prior planner moves are done
                // because the motion channel is FIFO and dwell queues after them.
                state.status = MachineStatus::Idle;
                state.feed = 0.0;
                let _ = broadcast.send(());
            }
            return MoveResult::Ok;
        }
        MoveKind::Arc { clockwise, offset } => {
            // Convert arc to linear segments then execute
            let segments = {
                let state = shared.read().await;
                arc_to_segments(&state.pos, &mv.target, *clockwise, *offset, &state)
            };
            for seg_target in segments {
                let seg_mv = PendingMove {
                    kind: MoveKind::Linear,
                    target: seg_target,
                    feed: mv.feed,
                    probe: mv.probe.clone(),
                };
                let result = execute_linear(shared, broadcast, &seg_mv, dt, interval_dur, epoch).await;
                if !matches!(result, MoveResult::Ok) { return result; }
            }
            return MoveResult::Ok;
        }
        MoveKind::Linear | MoveKind::Jog => {
            return execute_linear(shared, broadcast, mv, dt, interval_dur, epoch).await;
        }
    }
}

async fn execute_linear(
    shared: &SharedMachineState,
    broadcast: &StateBroadcast,
    mv: &PendingMove,
    dt: f64,
    interval_dur: Duration,
    epoch: u64,
) -> MoveResult {
    {
        let mut state = shared.write().await;
        // Abort if a soft_reset happened since this move was queued.
        if state.reset_epoch != epoch {
            return MoveResult::Ok;
        }
        // Skip moves queued behind an active hold or alarm — don't overwrite the status.
        if matches!(state.status, MachineStatus::Hold | MachineStatus::Alarm) {
            return MoveResult::Ok;
        }
        // Skip jog moves queued behind a jog cancel.
        if matches!(mv.kind, MoveKind::Jog) && state.jog_cancel_pending {
            state.status = MachineStatus::Idle;
            state.feed = 0.0;
            let _ = broadcast.send(());
            return MoveResult::Ok;
        }
        state.status = MachineStatus::Run;
        state.feed = mv.feed;
    }
    let _ = broadcast.send(());

    // Guard: a feed rate of 0 (no F word ever set) would cause an infinite tick loop.
    // Snap to target immediately so the job engine can advance rather than hanging.
    if mv.feed <= 0.0 {
        let mut state = shared.write().await;
        for i in 0..AXIS_COUNT { state.pos[i] = mv.target[i]; }
        state.status = MachineStatus::Idle;
        state.feed = 0.0;
        let _ = broadcast.send(());
        return MoveResult::Ok;
    }

    let mut ticker = time::interval(interval_dur);

    loop {
        ticker.tick().await;

        // Acquire lock, compute one tick, release lock
        enum TickResult {
            Continue,
            Done(MoveResult),
        }

        let tick = {
            let mut state = shared.write().await;

            // Abort mid-move if a soft_reset occurred after this move started executing.
            if state.reset_epoch != epoch {
                TickResult::Done(MoveResult::Ok)
            // Jog cancel → return to Idle immediately (not Hold)
            } else if matches!(mv.kind, MoveKind::Jog) && state.jog_cancel_pending {
                state.status = MachineStatus::Idle;
                state.feed = 0.0;
                let _ = broadcast.send(());
                TickResult::Done(MoveResult::Ok)
            // Feed hold (non-jog moves only)
            } else if state.hold_pending || matches!(state.status, MachineStatus::Hold) {
                state.hold_pending = false;
                state.status = MachineStatus::Hold;
                let _ = broadcast.send(());
                TickResult::Done(MoveResult::Ok)
            } else {
                let sim_speed = state.sim_speed as f64;
                let feed_mm_per_sec = (mv.feed / 60.0) * sim_speed;
                let max_step = feed_mm_per_sec * dt;

                // Compute direction to target
                let mut d = [0.0f64; AXIS_COUNT];
                let mut dist_sq = 0.0f64;
                for i in 0..AXIS_COUNT {
                    d[i] = mv.target[i] - state.pos[i];
                    dist_sq += d[i] * d[i];
                }
                let dist = dist_sq.sqrt();

                if dist < 1e-6 {
                    // Already at target
                    state.status = MachineStatus::Idle;
                    state.feed = 0.0;
                    let _ = broadcast.send(());
                    TickResult::Done(MoveResult::Ok)
                } else {
                    let nd: Vec<f64> = d.iter().map(|v| v / dist).collect();
                    let step = max_step.min(dist);

                    // Probe check
                    if mv.probe.is_some() {
                        let dir3 = [nd[0], nd[1], nd[2]];
                        let pos3 = [state.pos[0], state.pos[1], state.pos[2]];
                        let manual = state.probe.triggered;
                        let tip = state.probe.tip_diameter;

                        let probe_hit = check_probe_contact(pos3, dir3, tip, manual, None);
                        if let ProbeHit::Contact(reported) = probe_hit {
                            state.probe.triggered = false;
                            state.status = MachineStatus::Idle;
                            let _ = broadcast.send(());
                            return MoveResult::ProbeContact(reported);
                        }
                    }

                    // Advance position
                    for i in 0..AXIS_COUNT {
                        state.pos[i] += nd[i] * step;
                    }

                    // Check soft limits: |pos| must not exceed travel on any axis.
                    // This supports both negative-travel (router home at max) and
                    // positive-travel coordinate systems without assuming sign convention.
                    let mut over_limit = false;
                    for i in 0..state.axis_count {
                        if state.pos[i].abs() > state.travel[i] + 0.001 {
                            over_limit = true;
                            break;
                        }
                    }
                    if over_limit {
                        state.status = MachineStatus::Alarm;
                        state.planned_pos = state.pos;
                        let _ = broadcast.send(());
                        return MoveResult::Alarm(2);
                    }

                    // Check if reached target
                    let reached = step >= dist - 1e-6;
                    if reached {
                        for i in 0..AXIS_COUNT { state.pos[i] = mv.target[i]; }
                        state.status = MachineStatus::Idle;
                        state.feed = 0.0;
                    }
                    let _ = broadcast.send(());
                    if reached { TickResult::Done(MoveResult::Ok) } else { TickResult::Continue }
                }
            }
        };

        match tick {
            TickResult::Continue => {}
            TickResult::Done(MoveResult::Ok) => {
                // Probe miss check
                if let Some(probe_cfg) = &mv.probe {
                    if probe_cfg.error_on_miss {
                        return MoveResult::ProbeNoContact;
                    }
                }
                return MoveResult::Ok;
            }
            TickResult::Done(other) => return other,
        }
    }
}

/// Convert a G2/G3 arc to a series of linear segment targets.
/// Respects G17 (XY), G18 (XZ), G19 (YZ) plane modal state.
fn arc_to_segments(
    start: &[f64; AXIS_COUNT],
    end: &[f64; AXIS_COUNT],
    clockwise: bool,
    offset: [f64; 3],
    state: &MachineState,
) -> Vec<[f64; AXIS_COUNT]> {
    use crate::machine::modal::Plane;

    // Select axis indices and center offsets based on active plane.
    // G17 XY: primary=X(0), secondary=Y(1), linear=Z(2), offsets=I(0),J(1)
    // G18 XZ: primary=X(0), secondary=Z(2), linear=Y(1), offsets=I(0),K(2)
    // G19 YZ: primary=Y(1), secondary=Z(2), linear=X(0), offsets=J(1),K(2)
    let (a1, a2, a_lin, o1, o2) = match state.modal.plane {
        Plane::Xy => (0, 1, 2, offset[0], offset[1]),
        Plane::Xz => (0, 2, 1, offset[0], offset[2]),
        Plane::Yz => (1, 2, 0, offset[1], offset[2]),
    };

    let c1 = start[a1] + o1;
    let c2 = start[a2] + o2;

    let r = ((start[a1] - c1).powi(2) + (start[a2] - c2).powi(2)).sqrt();
    if r < 1e-6 { return vec![*end]; }

    let start_angle = (start[a2] - c2).atan2(start[a1] - c1);
    let end_angle = (end[a2] - c2).atan2(end[a1] - c1);

    let arc_span = if clockwise {
        let mut span = start_angle - end_angle;
        if span < 0.0 { span += std::f64::consts::TAU; }
        -span
    } else {
        let mut span = end_angle - start_angle;
        if span < 0.0 { span += std::f64::consts::TAU; }
        span
    };

    // One segment per 0.1 mm of arc, minimum 4
    let arc_len = r * arc_span.abs();
    let n_segs = ((arc_len / 0.1) as usize).max(4);

    let mut segments = Vec::with_capacity(n_segs);
    for i in 1..=n_segs {
        let frac = i as f64 / n_segs as f64;
        let angle = start_angle + arc_span * frac;
        let mut seg = *start;
        seg[a1] = c1 + r * angle.cos();
        seg[a2] = c2 + r * angle.sin();
        // Interpolate the linear (out-of-plane) axis
        seg[a_lin] = start[a_lin] + (end[a_lin] - start[a_lin]) * frac;
        segments.push(seg);
    }
    segments
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::machine::state::MachineState;

    fn make_shared() -> (SharedMachineState, StateBroadcast) {
        let travel = [300.0, 200.0, 80.0, 360.0, 360.0, 360.0];
        let state = MachineState::new(3, travel, 2.0, 1);
        crate::machine::state::new_shared(state)
    }

    #[tokio::test]
    async fn linear_move_reaches_target() {
        let (shared, bcast) = make_shared();
        let tx = spawn_motion_task(Arc::clone(&shared), bcast, 100);

        let target = {
            let s = shared.read().await;
            let mut t = s.pos;
            t[0] = -50.0;
            t[1] = -50.0;
            t
        };

        let (result_tx, result_rx) = tokio::sync::oneshot::channel();
        tx.send((
            PendingMove { kind: MoveKind::Linear, target, feed: 3000.0, probe: None },
            result_tx,
        )).await.unwrap();

        let result = result_rx.await.unwrap();
        assert!(matches!(result, MoveResult::Ok));

        let state = shared.read().await;
        assert!((state.pos[0] + 50.0).abs() < 0.1, "x={}", state.pos[0]);
        assert!((state.pos[1] + 50.0).abs() < 0.1, "y={}", state.pos[1]);
        assert_eq!(state.status, MachineStatus::Idle);
    }

    #[tokio::test]
    async fn jog_cancel_stops_motion() {
        let (shared, bcast) = make_shared();
        let tx = spawn_motion_task(Arc::clone(&shared), bcast, 100);

        // Start a long jog toward the negative X limit
        let mut target = [0.0f64; AXIS_COUNT];
        target[0] = -250.0;

        let (result_tx, result_rx) = tokio::sync::oneshot::channel();
        tx.send((
            PendingMove { kind: MoveKind::Jog, target, feed: 100.0, probe: None },
            result_tx,
        )).await.unwrap();

        // Let it run a few ticks then trigger hold
        time::sleep(Duration::from_millis(100)).await;
        { shared.write().await.hold_pending = true; }

        let result = result_rx.await.unwrap();
        assert!(matches!(result, MoveResult::Ok));
        let state = shared.read().await;
        // Position should NOT have reached -250
        assert!(state.pos[0] > -250.0, "should not have reached target");
    }

    #[tokio::test]
    async fn soft_limit_triggers_alarm() {
        let (shared, bcast) = make_shared();
        let tx = spawn_motion_task(Arc::clone(&shared), bcast, 100);

        // Move past X travel limit (past -300mm)
        let mut target = [0.0f64; AXIS_COUNT];
        target[0] = -350.0;

        let (result_tx, result_rx) = tokio::sync::oneshot::channel();
        tx.send((
            PendingMove { kind: MoveKind::Linear, target, feed: 5000.0, probe: None },
            result_tx,
        )).await.unwrap();

        let result = result_rx.await.unwrap();
        assert!(matches!(result, MoveResult::Alarm(_)));
        let state = shared.read().await;
        assert_eq!(state.status, MachineStatus::Alarm);
    }
}
