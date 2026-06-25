use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tracing::{error, info, warn};

use crate::machine::gcode::{interpret, interpret_jog, InterpretResult};
use crate::machine::motion::{MoveKind, MoveResult, MoveTx, PendingMove};
use crate::machine::state::{MachineStatus, SharedMachineState, StateBroadcast};
use crate::protocol::parser::{parse_line, ParsedLine};
use crate::protocol::realtime::classify;
use crate::protocol::realtime::RealtimeCmd;
use crate::protocol::response::{self, GREETING};

pub async fn run(port: u16, shared: SharedMachineState, broadcast: StateBroadcast, move_tx: MoveTx) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.expect("Failed to bind FluidNC TCP port");
    info!("FluidNC TCP server listening on {}", addr);

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                info!("FluidNC client connected: {}", peer);
                let shared = Arc::clone(&shared);
                let broadcast = broadcast.clone();
                let move_tx = move_tx.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream, shared, broadcast, move_tx).await {
                        warn!("FluidNC connection error: {}", e);
                    }
                });
            }
            Err(e) => error!("Accept error: {}", e),
        }
    }
}

async fn handle_connection(
    stream: TcpStream,
    shared: SharedMachineState,
    broadcast: StateBroadcast,
    move_tx: MoveTx,
) -> anyhow::Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    // Send greeting
    writer.write_all(GREETING.as_bytes()).await?;

    while let Some(line) = lines.next_line().await? {
        // Check for embedded real-time bytes in the line
        for b in line.bytes() {
            if crate::protocol::parser::is_realtime_byte(b) {
                let response = handle_realtime(classify(b), &shared, &broadcast).await;
                if let Some(resp) = response {
                    writer.write_all(resp.as_bytes()).await?;
                }
            }
        }

        let parsed = parse_line(&line);
        let response = dispatch(parsed, &shared, &broadcast, &move_tx).await;
        writer.write_all(response.as_bytes()).await?;
    }

    info!("FluidNC client disconnected");
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
                state.hold_pending = true;
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

async fn dispatch(
    parsed: ParsedLine,
    shared: &SharedMachineState,
    broadcast: &StateBroadcast,
    move_tx: &MoveTx,
) -> String {
    match parsed {
        ParsedLine::Empty => response::ok(),
        ParsedLine::StatusQuery => {
            let state = shared.read().await;
            response::status(&state)
            // Status query does NOT get an ok
        }
        ParsedLine::FeedHold => {
            handle_realtime(RealtimeCmd::FeedHold, shared, broadcast).await;
            String::new() // no response for real-time
        }
        ParsedLine::CycleStart => {
            handle_realtime(RealtimeCmd::CycleStart, shared, broadcast).await;
            String::new()
        }
        ParsedLine::SoftReset => {
            handle_realtime(RealtimeCmd::SoftReset, shared, broadcast)
                .await
                .unwrap_or_default()
        }
        ParsedLine::JogCancel => {
            handle_realtime(RealtimeCmd::JogCancel, shared, broadcast).await;
            String::new()
        }
        ParsedLine::Home => {
            do_homing(shared, broadcast, move_tx).await
        }
        ParsedLine::Unlock => {
            let mut state = shared.write().await;
            state.status = MachineStatus::Idle;
            let _ = broadcast.send(());
            format!("{}{}", response::msg("Caution: Unlocked"), response::ok())
        }
        ParsedLine::Restart => {
            let mut state = shared.write().await;
            state.soft_reset();
            let _ = broadcast.send(());
            GREETING.to_string()
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
            out
        }
        ParsedLine::ConfigRead(key) => {
            let state = shared.read().await;
            if let Some(val) = state.fluid_config.get(&key) {
                format!("{}{}", response::config_value(&key, val), response::ok())
            } else {
                format!("{}{}",
                    response::msg(&format!("config key not found: {}", key)),
                    response::error(21)
                )
            }
        }
        ParsedLine::ConfigWrite(key, val) => {
            let mut state = shared.write().await;
            state.fluid_config.insert(key, val);
            let _ = broadcast.send(());
            response::ok()
        }
        ParsedLine::GCode(words) => {
            let result = {
                let mut state = shared.write().await;
                interpret(&words, &mut state)
            };
            let _ = broadcast.send(());

            match result {
                InterpretResult::Ok => response::ok(),
                InterpretResult::Error(code) => response::error(code),
                InterpretResult::SoftReset => {
                    handle_realtime(RealtimeCmd::SoftReset, shared, broadcast)
                        .await
                        .unwrap_or_default()
                }
                InterpretResult::FeedHold => {
                    handle_realtime(RealtimeCmd::FeedHold, shared, broadcast).await;
                    String::new()
                }
                InterpretResult::CycleStart => {
                    handle_realtime(RealtimeCmd::CycleStart, shared, broadcast).await;
                    String::new()
                }
                InterpretResult::Move(mv) => {
                    // Send ok immediately, motion is async
                    let ok = response::ok();
                    let (res_tx, res_rx) = tokio::sync::oneshot::channel();
                    if move_tx.send((mv, res_tx)).await.is_err() {
                        return response::error(9);
                    }
                    // Wait for motion to complete to send probe result if needed
                    match res_rx.await {
                        Ok(MoveResult::ProbeContact(pos)) => {
                            format!("{}{}{}",
                                ok,
                                response::probe_result(pos, true),
                                response::ok()
                            )
                        }
                        Ok(MoveResult::ProbeNoContact) => {
                            let pos = { shared.read().await.pos };
                            format!("{}{}{}",
                                ok,
                                response::probe_result([pos[0], pos[1], pos[2]], false),
                                response::error(54)
                            )
                        }
                        Ok(MoveResult::Alarm(code)) => {
                            format!("{}{}", ok, response::alarm(code))
                        }
                        _ => ok,
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
                None => response::error(9),
                Some(mv) => {
                    let ok = response::ok();
                    let (res_tx, _res_rx) = tokio::sync::oneshot::channel();
                    let _ = move_tx.send((mv, res_tx)).await;
                    ok
                }
            }
        }
        ParsedLine::Unknown(_) => response::error(20),
    }
}

async fn do_homing(
    shared: &SharedMachineState,
    broadcast: &StateBroadcast,
    move_tx: &MoveTx,
) -> String {
    {
        let mut state = shared.write().await;
        if matches!(state.status, MachineStatus::Alarm) {
            return format!("{}{}", response::msg("Alarm active — use $X to unlock first"), response::error(9));
        }
        state.status = MachineStatus::Homing;
        let _ = broadcast.send(());
    }

    // Move all axes to zero
    let target = [0.0f64; crate::machine::state::AXIS_COUNT];
    let feed = 3000.0;
    let (res_tx, res_rx) = tokio::sync::oneshot::channel();
    let _ = move_tx.send((
        PendingMove { kind: MoveKind::Linear, target, feed, probe: None },
        res_tx,
    )).await;

    let _ = res_rx.await;

    {
        let mut state = shared.write().await;
        state.pos = [0.0; crate::machine::state::AXIS_COUNT];
        state.status = MachineStatus::Idle;
        let _ = broadcast.send(());
    }

    response::ok()
}
