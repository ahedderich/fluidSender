use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tracing::{error, info, warn};

use crate::machine::gcode::{interpret, interpret_jog, InterpretResult};
use crate::machine::motion::{MoveKind, MoveResult, MoveTx, PendingMove};
use crate::machine::state::{
    now_ms, ConsoleBroadcast, ConsoleEntry, MachineStatus, SharedMachineState, StateBroadcast,
    AXIS_COUNT,
};
use crate::protocol::parser::{parse_line, ParsedLine};
use crate::protocol::realtime::classify;
use crate::protocol::realtime::RealtimeCmd;
use crate::protocol::response::{self, GREETING};

/// Distinguishes what to do when an async operation's receiver fires.
enum PendingKind {
    /// G38 probe: send TLO + ok (or error 54) from the move result.
    Probe,
    /// $H homing: reset position to 0 and send ok after the move completes.
    Homing,
}

pub async fn run(
    port: u16,
    shared: SharedMachineState,
    broadcast: StateBroadcast,
    console: ConsoleBroadcast,
    move_tx: MoveTx,
) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.expect("Failed to bind FluidNC TCP port");
    info!("FluidNC TCP server listening on {}", addr);

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                info!("FluidNC client connected: {}", peer);
                let shared = Arc::clone(&shared);
                let broadcast = broadcast.clone();
                let console = console.clone();
                let move_tx = move_tx.clone();
                tokio::spawn(async move {
                    if let Err(e) =
                        handle_connection(stream, shared, broadcast, console, move_tx, peer.to_string()).await
                    {
                        warn!("FluidNC connection error: {}", e);
                    }
                });
            }
            Err(e) => error!("Accept error: {}", e),
        }
    }
}

/// Broadcast one line of protocol traffic to the sim-ui console (best-effort).
fn log_console(console: &ConsoleBroadcast, dir: &'static str, source: &str, text: &str) {
    let text = text.trim_end_matches(|c| c == '\r' || c == '\n').to_string();
    if text.is_empty() {
        return;
    }
    let _ = console.send(ConsoleEntry {
        dir,
        source: source.to_string(),
        text,
        ts: now_ms(),
    });
}

async fn handle_connection(
    stream: TcpStream,
    shared: SharedMachineState,
    broadcast: StateBroadcast,
    console: ConsoleBroadcast,
    move_tx: MoveTx,
    peer: String,
) -> anyhow::Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    // Send greeting
    writer.write_all(GREETING.as_bytes()).await?;
    log_console(&console, "tx", &peer, GREETING);

    while let Some(line) = lines.next_line().await? {
        log_console(&console, "rx", &peer, &line);

        // Check for embedded real-time bytes in the line
        for b in line.bytes() {
            if crate::protocol::parser::is_realtime_byte(b) {
                let response = handle_realtime(classify(b), &shared, &broadcast).await;
                if let Some(resp) = response {
                    writer.write_all(resp.as_bytes()).await?;
                    log_console(&console, "tx", &peer, &resp);
                }
            }
        }

        let parsed = parse_line(&line);
        let (response, pending) = dispatch(parsed, &shared, &broadcast, &move_tx).await;
        if !response.is_empty() {
            writer.write_all(response.as_bytes()).await?;
            log_console(&console, "tx", &peer, response.trim_end());
        }

        // For probe and homing operations we must wait for the result before sending the final
        // response — but we keep reading the line stream so that `?` status queries are
        // answered in real time during the move (matching real FluidNC behaviour).
        if let Some((kind, mut rx)) = pending {
            loop {
                tokio::select! {
                    result = &mut rx => {
                        handle_pending_result(
                            kind,
                            result.unwrap_or(MoveResult::Ok),
                            &shared,
                            &broadcast,
                            &mut writer,
                            &console,
                            &peer,
                        ).await?;
                        break;
                    }
                    next_line = lines.next_line() => {
                        match next_line? {
                            None => return Ok(()), // EOF
                            Some(ql) => {
                                log_console(&console, "rx", &peer, &ql);
                                // Handle real-time bytes embedded in the line
                                for b in ql.bytes() {
                                    if crate::protocol::parser::is_realtime_byte(b) {
                                        let resp = handle_realtime(classify(b), &shared, &broadcast).await;
                                        if let Some(r) = resp {
                                            writer.write_all(r.as_bytes()).await?;
                                            log_console(&console, "tx", &peer, r.trim_end());
                                        }
                                    }
                                }
                                // Answer status queries immediately; queue other commands until motion ends
                                let p = parse_line(&ql);
                                if matches!(p, ParsedLine::StatusQuery) {
                                    let state = shared.read().await;
                                    let resp = response::status(&state);
                                    writer.write_all(resp.as_bytes()).await?;
                                    log_console(&console, "tx", &peer, resp.trim_end());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    info!("FluidNC client disconnected");
    Ok(())
}

async fn handle_pending_result(
    kind: PendingKind,
    result: MoveResult,
    shared: &SharedMachineState,
    broadcast: &StateBroadcast,
    writer: &mut tokio::net::tcp::OwnedWriteHalf,
    console: &ConsoleBroadcast,
    peer: &str,
) -> anyhow::Result<()> {
    match kind {
        PendingKind::Homing => {
            {
                let mut state = shared.write().await;
                state.pos = [0.0; AXIS_COUNT];
                state.status = MachineStatus::Idle;
                let _ = broadcast.send(());
            }
            let resp = response::ok();
            writer.write_all(resp.as_bytes()).await?;
            log_console(console, "tx", peer, resp.trim_end());
        }
        PendingKind::Probe => {
            match result {
                MoveResult::ProbeContact(pos) => {
                    let resp = format!(
                        "{}{}{}",
                        response::probe_result(pos, true),
                        response::ok(),
                        ""
                    );
                    writer.write_all(resp.as_bytes()).await?;
                    log_console(console, "tx", peer, resp.trim_end());
                }
                MoveResult::ProbeNoContact => {
                    let pos = { shared.read().await.pos };
                    let resp = format!(
                        "{}{}",
                        response::probe_result([pos[0], pos[1], pos[2]], false),
                        response::error(54)
                    );
                    writer.write_all(resp.as_bytes()).await?;
                    log_console(console, "tx", peer, resp.trim_end());
                }
                MoveResult::Alarm(code) => {
                    let resp = response::alarm(code);
                    writer.write_all(resp.as_bytes()).await?;
                    log_console(console, "tx", peer, resp.trim_end());
                }
                MoveResult::Ok => {}
            }
        }
    }
    Ok(())
}

async fn handle_realtime(
    cmd: RealtimeCmd,
    shared: &SharedMachineState,
    broadcast: &StateBroadcast,
) -> Option<String> {
    match cmd {
        RealtimeCmd::StatusQuery => {
            let state = shared.read().await;
            Some(response::status(&state))
        }
        RealtimeCmd::FeedHold => {
            let mut state = shared.write().await;
            if matches!(state.status, MachineStatus::Run) {
                state.hold_pending = true;
                state.status = MachineStatus::Hold;
                let _ = broadcast.send(());
            }
            None
        }
        RealtimeCmd::CycleStart => {
            let mut state = shared.write().await;
            if matches!(state.status, MachineStatus::Hold) {
                state.status = MachineStatus::Idle;
                let _ = broadcast.send(());
            }
            None
        }
        RealtimeCmd::SoftReset => {
            let mut state = shared.write().await;
            state.soft_reset();
            let _ = broadcast.send(());
            // Send greeting after reset
            Some(GREETING.to_string())
        }
        RealtimeCmd::JogCancel => {
            let mut state = shared.write().await;
            if matches!(state.status, MachineStatus::Run) {
                state.jog_cancel_pending = true;
            }
            None
        }
        RealtimeCmd::SafetyDoor => {
            let mut state = shared.write().await;
            state.status = MachineStatus::Door;
            state.door = true;
            let _ = broadcast.send(());
            None
        }
        _ => None,
    }
}

/// Dispatch a parsed line, returning the immediate response string and an optional pending
/// async result (for operations that must report a final status after motion completes).
///
/// Non-probe moves return `(ok, None)` — the ok is sent as soon as the move is queued,
/// matching real FluidNC behaviour where `ok` means "command accepted into planner".
/// The connection loop is then free to process incoming `?` queries during motion.
async fn dispatch(
    parsed: ParsedLine,
    shared: &SharedMachineState,
    broadcast: &StateBroadcast,
    move_tx: &MoveTx,
) -> (String, Option<(PendingKind, oneshot::Receiver<MoveResult>)>) {
    match parsed {
        ParsedLine::Empty => (response::ok(), None),
        ParsedLine::StatusQuery => {
            let state = shared.read().await;
            (response::status(&state), None)
        }
        ParsedLine::FeedHold => {
            handle_realtime(RealtimeCmd::FeedHold, shared, broadcast).await;
            (String::new(), None)
        }
        ParsedLine::CycleStart => {
            handle_realtime(RealtimeCmd::CycleStart, shared, broadcast).await;
            (String::new(), None)
        }
        ParsedLine::SoftReset => {
            let r = handle_realtime(RealtimeCmd::SoftReset, shared, broadcast)
                .await
                .unwrap_or_default();
            (r, None)
        }
        ParsedLine::JogCancel => {
            handle_realtime(RealtimeCmd::JogCancel, shared, broadcast).await;
            (String::new(), None)
        }
        ParsedLine::Home => do_homing(shared, broadcast, move_tx).await,
        ParsedLine::Unlock => {
            let mut state = shared.write().await;
            state.status = MachineStatus::Idle;
            let _ = broadcast.send(());
            (format!("{}{}", response::msg("Caution: Unlocked"), response::ok()), None)
        }
        ParsedLine::Restart => {
            let mut state = shared.write().await;
            state.soft_reset();
            let _ = broadcast.send(());
            (GREETING.to_string(), None)
        }
        ParsedLine::DumpSettings => {
            let state = shared.read().await;
            let mut out = String::new();
            let mut keys: Vec<_> = state.fluid_config.keys().collect();
            keys.sort();
            for k in keys {
                let v = &state.fluid_config[k];
                out.push_str(&response::settings_line(k, v));
            }
            out.push_str(&response::ok());
            (out, None)
        }
        ParsedLine::ConfigRead(key) => {
            let state = shared.read().await;
            if let Some(val) = state.fluid_config.get(&key) {
                (format!("{}{}", response::config_value(&key, val), response::ok()), None)
            } else {
                (
                    format!(
                        "{}{}",
                        response::msg(&format!("config key not found: {}", key)),
                        response::error(21)
                    ),
                    None,
                )
            }
        }
        ParsedLine::ConfigWrite(key, val) => {
            let mut state = shared.write().await;
            state.fluid_config.insert(key, val);
            let _ = broadcast.send(());
            (response::ok(), None)
        }
        ParsedLine::GCode(words) => {
            let result = {
                let mut state = shared.write().await;
                interpret(&words, &mut state)
            };
            let _ = broadcast.send(());

            match result {
                InterpretResult::Ok => (response::ok(), None),
                InterpretResult::Error(code) => (response::error(code), None),
                InterpretResult::SoftReset => {
                    let r = handle_realtime(RealtimeCmd::SoftReset, shared, broadcast)
                        .await
                        .unwrap_or_default();
                    (r, None)
                }
                InterpretResult::FeedHold => {
                    handle_realtime(RealtimeCmd::FeedHold, shared, broadcast).await;
                    (String::new(), None)
                }
                InterpretResult::CycleStart => {
                    handle_realtime(RealtimeCmd::CycleStart, shared, broadcast).await;
                    (String::new(), None)
                }
                InterpretResult::Move(mv) => {
                    let is_probe = mv.probe.is_some();
                    let (res_tx, res_rx) = oneshot::channel();
                    if move_tx.send((mv, res_tx)).await.is_err() {
                        return (response::error(9), None);
                    }
                    if is_probe {
                        // Probe moves must report contact position after completion
                        (response::ok(), Some((PendingKind::Probe, res_rx)))
                    } else {
                        // Non-probe: ok as soon as queued; motion runs concurrently so the
                        // connection loop can immediately service incoming `?` queries
                        (response::ok(), None)
                    }
                }
            }
        }
        ParsedLine::Jog(words) => {
            let mv_opt = {
                let mut state = shared.write().await;
                interpret_jog(&words, &mut state)
            };
            match mv_opt {
                None => (response::error(9), None),
                Some(mv) => {
                    let (res_tx, _res_rx) = oneshot::channel();
                    let _ = move_tx.send((mv, res_tx)).await;
                    (response::ok(), None)
                }
            }
        }
        ParsedLine::Unknown(_) => (response::error(20), None),
    }
}

async fn do_homing(
    shared: &SharedMachineState,
    broadcast: &StateBroadcast,
    move_tx: &MoveTx,
) -> (String, Option<(PendingKind, oneshot::Receiver<MoveResult>)>) {
    {
        let mut state = shared.write().await;
        if matches!(state.status, MachineStatus::Alarm) {
            return (
                format!("{}{}", response::msg("Alarm active — use $X to unlock first"), response::error(9)),
                None,
            );
        }
        state.status = MachineStatus::Homing;
        let _ = broadcast.send(());
    }

    let target = [0.0f64; AXIS_COUNT];
    let (res_tx, res_rx) = oneshot::channel();
    let _ = move_tx
        .send((PendingMove { kind: MoveKind::Linear, target, feed: 3000.0, probe: None }, res_tx))
        .await;

    // Return receiver to caller; handle_connection will answer ? queries while homing runs
    // and send ok + reset position when the receiver fires.
    (String::new(), Some((PendingKind::Homing, res_rx)))
}
