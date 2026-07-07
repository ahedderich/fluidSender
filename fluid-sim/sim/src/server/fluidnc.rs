use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};
use tracing::{error, info, warn};

use crate::machine::gcode::{interpret, interpret_jog, InterpretResult};
use crate::machine::motion::{MoveKind, MoveResult, MoveTx, PendingMove};
use crate::machine::state::{
    now_ms, ConsoleBroadcast, ConsoleEntry, MachineStatus, SharedMachineState, StateBroadcast,
    AXIS_COUNT, MAX_PLANNER_SLOTS,
};
use crate::protocol::parser::{parse_line, ParsedLine};
use crate::protocol::realtime::classify;
use crate::protocol::realtime::RealtimeCmd;
use crate::protocol::response::{
    self, BUILD_INFO_RESPONSE, GREETING, SIM_CONFIG_YAML, STARTUP_LOG,
};

/// Distinguishes what to do when an async operation's receiver fires.
enum PendingKind {
    /// G38 probe (B2): ok is withheld until the cycle completes, then [PRB:...] + ok.
    /// A miss raises ALARM:5 first when `error_on_miss` (G38.2/G38.4).
    Probe { error_on_miss: bool },
    /// $H homing: reset position to 0 and send ok after the move completes.
    Homing,
    /// G4 dwell: send ok after planner drains + dwell elapses (no planner slot consumed).
    Dwell,
    /// B1: planner drained (0-sec dwell used for ordering); send ok immediately.
    Drain,
    /// B2 M0: planner drained; connection loop sets Hold and waits for ~ before sending ok.
    ProgramPause,
}

pub async fn run(
    port: u16,
    shared: SharedMachineState,
    broadcast: StateBroadcast,
    console: ConsoleBroadcast,
    move_tx: MoveTx,
) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr)
        .await
        .expect("Failed to bind FluidNC TCP port");
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
                    if let Err(e) = handle_connection(
                        stream,
                        shared,
                        broadcast,
                        console,
                        move_tx,
                        peer.to_string(),
                    )
                    .await
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
    let text = text.trim_end_matches(['\r', '\n']).to_string();
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

/// Split a raw chunk (bytes up to and including `\n`) into the text line and any
/// real-time bytes that were embedded in it.  Real-time bytes (0x85, 0x18, `?`, etc.)
/// are binary commands that FluidNC clients may send without a newline; they can end up
/// concatenated with the next newline-terminated line in the TCP buffer.  Extracting them
/// first lets us handle them without attempting invalid UTF-8 decoding via `lines()`.
fn extract_line_and_rt(buf: &[u8]) -> (String, Vec<u8>) {
    let mut line_bytes: Vec<u8> = Vec::with_capacity(buf.len());
    let mut rt_bytes: Vec<u8> = Vec::new();
    for &b in buf {
        if crate::protocol::parser::is_realtime_byte(b) {
            rt_bytes.push(b);
        } else {
            line_bytes.push(b);
        }
    }
    let line = String::from_utf8_lossy(&line_bytes)
        .trim_end_matches(['\n', '\r'])
        .to_string();
    (line, rt_bytes)
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
    let mut reader = BufReader::new(reader);
    let mut raw_buf: Vec<u8> = Vec::new();
    // Channel for async alarm messages from background move-result monitors.
    let (alarm_tx, mut alarm_rx) = mpsc::channel::<String>(32);

    // Send greeting
    writer.write_all(GREETING.as_bytes()).await?;
    log_console(&console, "tx", &peer, GREETING);

    // Command lines received while a B2 command (probe/dwell/homing/M0) is awaiting its
    // result. Real FluidNC keeps reading its input channel and executes these afterwards;
    // dropping them would desync the client's per-line ok accounting and modal state.
    let mut deferred: std::collections::VecDeque<String> = std::collections::VecDeque::new();

    loop {
        enum Next {
            Line(String),
            Skip,
            Eof,
        }

        // Deferred lines run first; otherwise read from the socket.
        let next = if let Some(l) = deferred.pop_front() {
            // Already rx-logged when it was received during the pending wait.
            Next::Line(l)
        } else {
            tokio::select! {
                biased;

                // Async alarm from a background move-result monitor fires here.
                Some(alarm_msg) = alarm_rx.recv() => {
                    writer.write_all(alarm_msg.as_bytes()).await?;
                    log_console(&console, "tx", &peer, alarm_msg.trim_end());
                    Next::Skip
                }

                // read_until reads raw bytes — no UTF-8 validation — so real-time bytes like
                // 0x85 (jog cancel) never cause the UTF-8 decode error that `lines()` would.
                n = reader.read_until(b'\n', &mut raw_buf) => {
                    let n = n?;
                    if n == 0 {
                        Next::Eof
                    } else {
                        let (line, rt_bytes) = extract_line_and_rt(&raw_buf);
                        raw_buf.clear();

                        log_console(&console, "rx", &peer, &line);

                        // Handle real-time bytes extracted from this chunk.
                        for b in &rt_bytes {
                            let response = handle_realtime(classify(*b), &shared, &broadcast).await;
                            if let Some(resp) = response {
                                writer.write_all(resp.as_bytes()).await?;
                                log_console(&console, "tx", &peer, resp.trim_end());
                            }
                        }

                        // Only dispatch a line command if there is actual text content, OR if
                        // the chunk was a bare blank line (no RT bytes mixed in).  A chunk that
                        // contained only real-time bytes (e.g. \x85 flushed out by the next \n)
                        // should not generate a spurious `ok`.
                        if line.is_empty() && !rt_bytes.is_empty() {
                            Next::Skip
                        } else {
                            Next::Line(line)
                        }
                    }
                }
            }
        };

        let line = match next {
            Next::Eof => break,
            Next::Skip => continue,
            Next::Line(l) => l,
        };

        let parsed = parse_line(&line);
        let (response, pending) = dispatch(parsed, &shared, &broadcast, &move_tx, &alarm_tx).await;
        if !response.is_empty() {
            writer.write_all(response.as_bytes()).await?;
            log_console(&console, "tx", &peer, response.trim_end());
        }

        // For probe / homing / dwell we must wait for the result before sending
        // the final response, but keep reading the stream so `?` queries are
        // answered in real time during the move. Other command lines received
        // meanwhile are deferred, not dropped.
        if let Some((kind, mut rx)) = pending {
            // in_pause is set after M0's drain dwell completes; the loop then waits
            // for ~ (cycle-start) before sending ok and breaking.
            let mut in_pause = false;
            loop {
                tokio::select! {
                    // Guard prevents polling a consumed oneshot in the pause phase.
                    result = &mut rx, if !in_pause => {
                        if matches!(kind, PendingKind::ProgramPause) {
                            // Drain complete — enter M0 Hold; wait for ~ below.
                            let mut state = shared.write().await;
                            state.status = MachineStatus::Hold;
                            let _ = broadcast.send(());
                            drop(state);
                            in_pause = true;
                        } else {
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
                    }
                    inner_n = reader.read_until(b'\n', &mut raw_buf) => {
                        match inner_n? {
                            0 => return Ok(()), // EOF
                            _ => {
                                let (ql, ql_rt) = extract_line_and_rt(&raw_buf);
                                raw_buf.clear();

                                log_console(&console, "rx", &peer, &ql);

                                for b in &ql_rt {
                                    let resp = handle_realtime(classify(*b), &shared, &broadcast).await;
                                    if let Some(r) = resp {
                                        writer.write_all(r.as_bytes()).await?;
                                        log_console(&console, "tx", &peer, r.trim_end());
                                    }
                                }

                                // Status queries are answered in real time; every other
                                // command line is deferred until the pending op resolves
                                // (skipping RT-only chunks, same as the outer loop).
                                if matches!(parse_line(&ql), ParsedLine::StatusQuery) {
                                    let state = shared.read().await;
                                    let resp = response::status(&state);
                                    writer.write_all(resp.as_bytes()).await?;
                                    log_console(&console, "tx", &peer, resp.trim_end());
                                } else if !ql.is_empty() || ql_rt.is_empty() {
                                    deferred.push_back(ql);
                                }
                                if in_pause {
                                    // CycleStart (~) sets state to Idle via handle_realtime.
                                    // Check whether Hold was exited by any means.
                                    let state = shared.read().await;
                                    if !matches!(state.status, MachineStatus::Hold) {
                                        drop(state);
                                        let resp = response::ok();
                                        writer.write_all(resp.as_bytes()).await?;
                                        log_console(&console, "tx", &peer, resp.trim_end());
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    Some(alarm_msg) = alarm_rx.recv() => {
                        writer.write_all(alarm_msg.as_bytes()).await?;
                        log_console(&console, "tx", &peer, alarm_msg.trim_end());
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
        PendingKind::Dwell | PendingKind::Drain => {
            let resp = response::ok();
            writer.write_all(resp.as_bytes()).await?;
            log_console(console, "tx", peer, resp.trim_end());
        }
        PendingKind::ProgramPause => {
            // M0 pause is handled entirely in handle_connection's pending loop;
            // this arm is never reached.
            unreachable!("ProgramPause resolved in connection loop")
        }
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
        PendingKind::Probe { error_on_miss } => match result {
            MoveResult::ProbeContact(pos) => {
                let resp = format!("{}{}", response::probe_result(pos, true), response::ok());
                writer.write_all(resp.as_bytes()).await?;
                log_console(console, "tx", peer, resp.trim_end());
            }
            MoveResult::ProbeNoContact => {
                let pos = { shared.read().await.pos };
                let prb = response::probe_result([pos[0], pos[1], pos[2]], false);
                let resp = if error_on_miss {
                    // FluidNC G38.2/G38.4 miss: send_alarm(ExecAlarm::ProbeFailContact)
                    // → ALARM:5 + Alarm state, then [PRB:...:0], then the line's ok.
                    {
                        let mut state = shared.write().await;
                        state.status = MachineStatus::Alarm;
                        let _ = broadcast.send(());
                    }
                    format!("{}{}{}", response::alarm(5), prb, response::ok())
                } else {
                    // G38.3/G38.5 miss is not an error: [PRB:...:0] + ok.
                    format!("{}{}", prb, response::ok())
                };
                writer.write_all(resp.as_bytes()).await?;
                log_console(console, "tx", peer, resp.trim_end());
            }
            MoveResult::Alarm(code) => {
                // Mid-probe alarm (e.g. soft limit). The line never got its queue-time
                // ok (B2), so ack it after the alarm to keep the one-ok-per-line invariant.
                let resp = format!("{}{}", response::alarm(code), response::ok());
                writer.write_all(resp.as_bytes()).await?;
                log_console(console, "tx", peer, resp.trim_end());
            }
            MoveResult::Ok => {
                // Probe aborted before completion (feed hold / soft reset) — still ack
                // the line so the client's send loop doesn't stall.
                let resp = response::ok();
                writer.write_all(resp.as_bytes()).await?;
                log_console(console, "tx", peer, resp.trim_end());
            }
        },
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
        RealtimeCmd::FeedOvrReset => {
            shared.write().await.feed_override = 100;
            let _ = broadcast.send(());
            None
        }
        RealtimeCmd::FeedOvrCoarsePlus => {
            let mut s = shared.write().await;
            s.feed_override = s.feed_override.saturating_add(10).min(200);
            let _ = broadcast.send(());
            None
        }
        RealtimeCmd::FeedOvrCoarseMinus => {
            let mut s = shared.write().await;
            s.feed_override = s.feed_override.saturating_sub(10).max(10);
            let _ = broadcast.send(());
            None
        }
        RealtimeCmd::FeedOvrFinePlus => {
            let mut s = shared.write().await;
            s.feed_override = s.feed_override.saturating_add(1).min(200);
            let _ = broadcast.send(());
            None
        }
        RealtimeCmd::FeedOvrFineMinus => {
            let mut s = shared.write().await;
            s.feed_override = s.feed_override.saturating_sub(1).max(10);
            let _ = broadcast.send(());
            None
        }
        RealtimeCmd::SpindleOvrReset => {
            shared.write().await.spindle_override = 100;
            let _ = broadcast.send(());
            None
        }
        RealtimeCmd::SpindleOvrCoarsePlus => {
            let mut s = shared.write().await;
            s.spindle_override = s.spindle_override.saturating_add(10).min(200);
            let _ = broadcast.send(());
            None
        }
        RealtimeCmd::SpindleOvrCoarseMinus => {
            let mut s = shared.write().await;
            s.spindle_override = s.spindle_override.saturating_sub(10).max(10);
            let _ = broadcast.send(());
            None
        }
        RealtimeCmd::SpindleOvrFinePlus => {
            let mut s = shared.write().await;
            s.spindle_override = s.spindle_override.saturating_add(1).min(200);
            let _ = broadcast.send(());
            None
        }
        RealtimeCmd::SpindleOvrFineMinus => {
            let mut s = shared.write().await;
            s.spindle_override = s.spindle_override.saturating_sub(1).max(10);
            let _ = broadcast.send(());
            None
        }
        RealtimeCmd::Unknown(_) => None,
    }
}

/// Dispatch a parsed line, returning the immediate response string and an optional pending
/// async result (for operations that must report a final status after motion completes).
///
/// Non-probe moves return `(ok, None)` — the ok is sent as soon as the move is queued,
/// matching real FluidNC behaviour where `ok` means "command accepted into planner".
/// The connection loop is then free to process incoming `?` queries during motion.
/// A background task monitors the move result and pushes ALARM messages to `alarm_tx` if
/// the motion executor trips a soft limit during execution.
async fn dispatch(
    parsed: ParsedLine,
    shared: &SharedMachineState,
    broadcast: &StateBroadcast,
    move_tx: &MoveTx,
    alarm_tx: &mpsc::Sender<String>,
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
            (
                format!("{}{}", response::msg("Caution: Unlocked"), response::ok()),
                None,
            )
        }
        ParsedLine::Restart => {
            let mut state = shared.write().await;
            state.soft_reset();
            let _ = broadcast.send(());
            (GREETING.to_string(), None)
        }
        ParsedLine::GCodeQuery => {
            let state = shared.read().await;
            (
                format!("{}{}", response::gc_state(&state), response::ok()),
                None,
            )
        }
        ParsedLine::BuildInfo => (BUILD_INFO_RESPONSE.to_string(), None),
        ParsedLine::StartupShow => (STARTUP_LOG.to_string(), None),
        ParsedLine::LocalFsShow(_path) => (SIM_CONFIG_YAML.to_string(), None),
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
                (
                    format!("{}{}", response::config_value(&key, val), response::ok()),
                    None,
                )
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
                InterpretResult::Alarm(code) => {
                    // Pre-flight soft limit: machine already set to Alarm in interpret().
                    let _ = broadcast.send(());
                    (response::alarm(code), None)
                }
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
                    let probe_error_on_miss = mv.probe.as_ref().map(|p| p.error_on_miss);
                    let is_probe = probe_error_on_miss.is_some();
                    let (res_tx, res_rx) = oneshot::channel();
                    // Probe moves (B2) drain the planner before running — they never add a
                    // planner slot. Only category-A moves (linear/arc/jog) consume a slot.
                    if !is_probe {
                        let mut state = shared.write().await;
                        state.planner_buf_used =
                            (state.planner_buf_used + 1).min(MAX_PLANNER_SLOTS);
                        let _ = broadcast.send(());
                    }
                    if move_tx.send((mv, res_tx)).await.is_err() {
                        if !is_probe {
                            let mut state = shared.write().await;
                            if state.planner_buf_used > 0 {
                                state.planner_buf_used -= 1;
                            }
                            let _ = broadcast.send(());
                        }
                        return (response::error(9), None);
                    }
                    if let Some(error_on_miss) = probe_error_on_miss {
                        // B2: no ok yet — the single ok follows [PRB:...] once the
                        // probe cycle completes (matches FluidNC's blocking probe).
                        (
                            String::new(),
                            Some((PendingKind::Probe { error_on_miss }, res_rx)),
                        )
                    } else {
                        // Non-probe: ok as soon as queued; motion runs concurrently.
                        // Spawn a background task so in-motion soft limit alarms (e.g. arc
                        // intermediate points) are still delivered to the client.
                        let atx = alarm_tx.clone();
                        tokio::spawn(async move {
                            if let Ok(MoveResult::Alarm(code)) = res_rx.await {
                                let _ = atx.send(response::alarm(code)).await;
                            }
                        });
                        (response::ok(), None)
                    }
                }
                InterpretResult::Dwell(seconds) => {
                    // G4 drains the planner then sleeps — it does NOT consume a planner slot.
                    // Queue to the motion channel for correct ordering after prior moves,
                    // but block this connection loop (don't send ok) until dwell completes.
                    let (res_tx, res_rx) = oneshot::channel();
                    let current_pos = { shared.read().await.pos };
                    if move_tx
                        .send((
                            PendingMove {
                                kind: MoveKind::Dwell { seconds },
                                target: current_pos,
                                feed: 0.0,
                                probe: None,
                            },
                            res_tx,
                        ))
                        .await
                        .is_err()
                    {
                        return (response::error(9), None);
                    }
                    (String::new(), Some((PendingKind::Dwell, res_rx)))
                }
                InterpretResult::DrainAndApply => {
                    // B1: state already applied. Queue a 0-second dwell so the FIFO motion
                    // channel ensures all prior moves finish before ok is sent.
                    let (res_tx, res_rx) = oneshot::channel();
                    let current_pos = { shared.read().await.pos };
                    if move_tx
                        .send((
                            PendingMove {
                                kind: MoveKind::Dwell { seconds: 0.0 },
                                target: current_pos,
                                feed: 0.0,
                                probe: None,
                            },
                            res_tx,
                        ))
                        .await
                        .is_err()
                    {
                        return (response::error(9), None);
                    }
                    (String::new(), Some((PendingKind::Drain, res_rx)))
                }
                InterpretResult::ProgramPause => {
                    // B2 M0: drain planner, then Hold, then wait for ~ before sending ok.
                    let (res_tx, res_rx) = oneshot::channel();
                    let current_pos = { shared.read().await.pos };
                    if move_tx
                        .send((
                            PendingMove {
                                kind: MoveKind::Dwell { seconds: 0.0 },
                                target: current_pos,
                                feed: 0.0,
                                probe: None,
                            },
                            res_tx,
                        ))
                        .await
                        .is_err()
                    {
                        return (response::error(9), None);
                    }
                    (String::new(), Some((PendingKind::ProgramPause, res_rx)))
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
                format!(
                    "{}{}",
                    response::msg("Alarm active — use $X to unlock first"),
                    response::error(9)
                ),
                None,
            );
        }
        state.status = MachineStatus::Homing;
        let _ = broadcast.send(());
    }

    let target = [0.0f64; AXIS_COUNT];
    let (res_tx, res_rx) = oneshot::channel();
    let _ = move_tx
        .send((
            PendingMove {
                kind: MoveKind::Linear,
                target,
                feed: 3000.0,
                probe: None,
            },
            res_tx,
        ))
        .await;

    // Return receiver to caller; handle_connection will answer ? queries while homing runs
    // and send ok + reset position when the receiver fires.
    (String::new(), Some((PendingKind::Homing, res_rx)))
}
