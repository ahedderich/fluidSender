use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::info;

use crate::machine::probe::ProbeDeviations;
use crate::machine::state::{
    AxisMap, ConsoleBroadcast, LimitState, MachineState, MachineStatus, SharedMachineState,
    StateBroadcast, AXIS_COUNT,
};
use crate::machine::stock::StockDefinition;

#[derive(Clone)]
pub struct AppState {
    pub machine: SharedMachineState,
    pub broadcast: StateBroadcast,
    /// FluidNC protocol traffic, forwarded to the sim-ui console.
    pub console: ConsoleBroadcast,
}

/// Snapshot of simulator state sent to the sim-ui over HTTP/WebSocket.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimState {
    pub machine_state: String,
    pub pos: AxisMap,
    pub wco: AxisMap,
    pub feed: f64,
    pub spindle_speed: f64,
    pub spindle_mode: String,
    pub coolant: String,
    pub limits: LimitState,
    pub probe_triggered: bool,
    pub probe_deviations: ProbeDeviations,
    pub door: bool,
    pub sim_speed: u8,
    pub axis_count: usize,
    pub travel: AxisMap,
    pub fluid_config: HashMap<String, String>,
}

impl SimState {
    fn from_machine(s: &MachineState) -> Self {
        SimState {
            machine_state: s.status.to_string(),
            pos: AxisMap::from_arr(&s.pos),
            wco: AxisMap::from_arr(&s.wco),
            feed: s.feed,
            spindle_speed: s.spindle_speed,
            spindle_mode: format!("{:?}", s.spindle.mode).to_lowercase(),
            coolant: format!("{:?}", s.coolant).to_lowercase(),
            limits: s.limits.clone(),
            probe_triggered: s.probe.triggered,
            probe_deviations: s.probe.deviations.clone(),
            door: s.door,
            sim_speed: s.sim_speed,
            axis_count: s.axis_count,
            travel: AxisMap::from_arr(&s.travel),
            fluid_config: s.fluid_config.clone(),
        }
    }
}

pub fn router(app: AppState) -> Router {
    Router::new()
        .route("/api/state", get(get_state))
        .route("/api/control/trigger-alarm", post(trigger_alarm))
        .route("/api/control/soft-reset", post(soft_reset))
        .route("/api/control/trigger-limit", post(trigger_limit))
        .route("/api/control/trigger-probe", post(trigger_probe))
        .route("/api/machine/speed", post(set_speed))
        .route("/api/machine/position", post(set_position))
        .route("/api/machine/wco", post(set_wco))
        .route("/api/machine/config", post(set_machine_config))
        .route("/api/stock", post(set_stock))
        .route("/ws/state", get(ws_state_handler))
        .route("/ws/console", get(ws_console_handler))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(app)
}

pub async fn run(port: u16, app: AppState) {
    let addr = format!("0.0.0.0:{}", port);
    let router = router(app);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind control API port");
    info!("Control API listening on {}", addr);
    axum::serve(listener, router)
        .await
        .expect("Control API failed");
}

// --- Handlers ---

async fn get_state(State(app): State<AppState>) -> impl IntoResponse {
    let state = app.machine.read().await;
    Json(SimState::from_machine(&state))
}

async fn trigger_alarm(State(app): State<AppState>) -> StatusCode {
    let mut state = app.machine.write().await;
    state.status = MachineStatus::Alarm;
    let _ = app.broadcast.send(());
    StatusCode::NO_CONTENT
}

async fn soft_reset(State(app): State<AppState>) -> StatusCode {
    let mut state = app.machine.write().await;
    state.soft_reset();
    let _ = app.broadcast.send(());
    StatusCode::NO_CONTENT
}

#[derive(Deserialize)]
struct TriggerLimitBody {
    axis: String,
}

async fn trigger_limit(
    State(app): State<AppState>,
    Json(body): Json<TriggerLimitBody>,
) -> StatusCode {
    let mut state = app.machine.write().await;
    match body.axis.as_str() {
        "xMin" => state.limits.x_min = true,
        "xMax" => state.limits.x_max = true,
        "yMin" => state.limits.y_min = true,
        "yMax" => state.limits.y_max = true,
        "zMin" => state.limits.z_min = true,
        "zMax" => state.limits.z_max = true,
        "door" => {
            state.door = true;
            state.status = MachineStatus::Door;
        }
        _ => return StatusCode::BAD_REQUEST,
    }

    if state.limits.any_active()
        && !matches!(state.status, MachineStatus::Alarm | MachineStatus::Door)
    {
        state.status = MachineStatus::Alarm;
    }

    let _ = app.broadcast.send(());

    // Auto-clear after 500 ms
    let machine = Arc::clone(&app.machine);
    let bcast = app.broadcast.clone();
    let axis = body.axis.clone();
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        let mut s = machine.write().await;
        match axis.as_str() {
            "xMin" => s.limits.x_min = false,
            "xMax" => s.limits.x_max = false,
            "yMin" => s.limits.y_min = false,
            "yMax" => s.limits.y_max = false,
            "zMin" => s.limits.z_min = false,
            "zMax" => s.limits.z_max = false,
            "door" => {
                s.door = false;
            }
            _ => {}
        }
        let _ = bcast.send(());
    });

    StatusCode::NO_CONTENT
}

async fn trigger_probe(State(app): State<AppState>) -> StatusCode {
    let machine = Arc::clone(&app.machine);
    let bcast = app.broadcast.clone();
    {
        let mut s = machine.write().await;
        s.probe.triggered = true;
        let _ = bcast.send(());
    }
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        let mut s = machine.write().await;
        s.probe.triggered = false;
        let _ = bcast.send(());
    });
    StatusCode::NO_CONTENT
}

#[derive(Deserialize)]
struct SetSpeedBody {
    speed: u8,
}

async fn set_speed(State(app): State<AppState>, Json(body): Json<SetSpeedBody>) -> StatusCode {
    let speed = body.speed.clamp(1, 10);
    let mut state = app.machine.write().await;
    state.sim_speed = speed;
    let _ = app.broadcast.send(());
    StatusCode::NO_CONTENT
}

#[derive(Deserialize, Default)]
struct AxisInput {
    x: Option<f64>,
    y: Option<f64>,
    z: Option<f64>,
    a: Option<f64>,
    b: Option<f64>,
    c: Option<f64>,
}

impl AxisInput {
    fn apply_to(&self, arr: &mut [f64; AXIS_COUNT]) {
        if let Some(v) = self.x {
            arr[0] = v;
        }
        if let Some(v) = self.y {
            arr[1] = v;
        }
        if let Some(v) = self.z {
            arr[2] = v;
        }
        if let Some(v) = self.a {
            arr[3] = v;
        }
        if let Some(v) = self.b {
            arr[4] = v;
        }
        if let Some(v) = self.c {
            arr[5] = v;
        }
    }
}

async fn set_position(State(app): State<AppState>, Json(body): Json<AxisInput>) -> StatusCode {
    let mut state = app.machine.write().await;
    body.apply_to(&mut state.pos);
    // A teleport invalidates the planned end position — subsequent relative moves
    // must chain off the new location, not the pre-teleport plan.
    state.planned_pos = state.pos;
    let _ = app.broadcast.send(());
    StatusCode::NO_CONTENT
}

async fn set_wco(State(app): State<AppState>, Json(body): Json<AxisInput>) -> StatusCode {
    let mut state = app.machine.write().await;
    body.apply_to(&mut state.wco);
    let _ = app.broadcast.send(());
    StatusCode::NO_CONTENT
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MachineConfigInput {
    travel: Option<AxisInput>,
    axis_count: Option<usize>,
    probe_deviations: Option<ProbeDeviations>,
}

async fn set_machine_config(
    State(app): State<AppState>,
    Json(body): Json<MachineConfigInput>,
) -> StatusCode {
    let mut state = app.machine.write().await;
    if let Some(t) = body.travel {
        t.apply_to(&mut state.travel);
    }
    if let Some(n) = body.axis_count {
        state.axis_count = n.clamp(1, AXIS_COUNT);
    }
    if let Some(devs) = body.probe_deviations {
        // Deviations are deliberately unclamped — negative values (late trigger) are valid.
        state.probe.deviations = devs;
    }
    let _ = app.broadcast.send(());
    StatusCode::NO_CONTENT
}

async fn set_stock(State(app): State<AppState>, Json(stock): Json<StockDefinition>) -> StatusCode {
    info!("Stock updated: {:?}", stock.shape);
    let mut state = app.machine.write().await;
    state.stock = Some(stock);
    StatusCode::NO_CONTENT
}

// --- WebSocket handler ---

async fn ws_state_handler(ws: WebSocketUpgrade, State(app): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_state(socket, app))
}

async fn ws_console_handler(
    ws: WebSocketUpgrade,
    State(app): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_console(socket, app))
}

/// Streams FluidNC protocol traffic (requests + responses) to the sim-ui.
/// Display-only — incoming messages from the client are ignored.
async fn ws_console(mut socket: WebSocket, app: AppState) {
    let mut rx = app.console.subscribe();
    loop {
        match rx.recv().await {
            Ok(entry) => {
                let json = serde_json::to_string(&entry).unwrap_or_default();
                if socket.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(_) => break,
        }
    }
}

async fn ws_state(mut socket: WebSocket, app: AppState) {
    // Send current state immediately
    {
        let state = app.machine.read().await;
        let json = serde_json::to_string(&SimState::from_machine(&state)).unwrap_or_default();
        if socket.send(Message::Text(json.into())).await.is_err() {
            return;
        }
    }

    let mut rx = app.broadcast.subscribe();

    loop {
        match rx.recv().await {
            Ok(()) => {
                let state = app.machine.read().await;
                let json =
                    serde_json::to_string(&SimState::from_machine(&state)).unwrap_or_default();
                if socket.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
            Err(broadcast::error::RecvError::Lagged(_)) => {
                // Skip missed updates, send current state
                let state = app.machine.read().await;
                let json =
                    serde_json::to_string(&SimState::from_machine(&state)).unwrap_or_default();
                let _ = socket.send(Message::Text(json.into())).await;
            }
            Err(_) => break,
        }
    }
}
