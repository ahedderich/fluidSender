use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

use crate::machine::modal::ModalState;
use crate::machine::spindle::SpindleState;
use crate::machine::coolant::CoolantState;

pub const AXIS_COUNT: usize = 6;
pub const AXIS_NAMES: [&str; AXIS_COUNT] = ["x", "y", "z", "a", "b", "c"];
/// Number of planner buffer slots, matching FluidNC firmware default.
pub const MAX_PLANNER_SLOTS: i32 = 15;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum MachineStatus {
    Idle,
    Run,
    Hold,
    Alarm,
    Homing,
    Door,
    Sleep,
    Check,
}

impl std::fmt::Display for MachineStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MachineStatus::Idle => write!(f, "Idle"),
            MachineStatus::Run => write!(f, "Run"),
            MachineStatus::Hold => write!(f, "Hold"),
            MachineStatus::Alarm => write!(f, "Alarm"),
            MachineStatus::Homing => write!(f, "Home"),
            MachineStatus::Door => write!(f, "Door"),
            MachineStatus::Sleep => write!(f, "Sleep"),
            MachineStatus::Check => write!(f, "Check"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LimitState {
    #[serde(rename = "xMin")] pub x_min: bool,
    #[serde(rename = "xMax")] pub x_max: bool,
    #[serde(rename = "yMin")] pub y_min: bool,
    #[serde(rename = "yMax")] pub y_max: bool,
    #[serde(rename = "zMin")] pub z_min: bool,
    #[serde(rename = "zMax")] pub z_max: bool,
}

impl Default for LimitState {
    fn default() -> Self {
        Self { x_min: false, x_max: false, y_min: false, y_max: false, z_min: false, z_max: false }
    }
}

impl LimitState {
    pub fn any_active(&self) -> bool {
        self.x_min || self.x_max || self.y_min || self.y_max || self.z_min || self.z_max
    }

    pub fn pn_string(&self, probe: bool, door: bool) -> String {
        let mut s = String::new();
        if self.x_min { s.push('X'); }
        if self.x_max { s.push('x'); }
        if self.y_min { s.push('Y'); }
        if self.y_max { s.push('y'); }
        if self.z_min { s.push('Z'); }
        if self.z_max { s.push('z'); }
        if probe      { s.push('P'); }
        if door       { s.push('D'); }
        s
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeState {
    pub triggered: bool,
    #[serde(rename = "tipDiameter")] pub tip_diameter: f64,
}

impl Default for ProbeState {
    fn default() -> Self {
        Self { triggered: false, tip_diameter: 2.0 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AxisMap {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub a: f64,
    pub b: f64,
    pub c: f64,
}

impl AxisMap {
    pub fn zeros() -> Self {
        Self { x: 0.0, y: 0.0, z: 0.0, a: 0.0, b: 0.0, c: 0.0 }
    }

    pub fn from_arr(arr: &[f64; AXIS_COUNT]) -> Self {
        Self { x: arr[0], y: arr[1], z: arr[2], a: arr[3], b: arr[4], c: arr[5] }
    }

    pub fn get(&self, axis: usize) -> f64 {
        match axis {
            0 => self.x, 1 => self.y, 2 => self.z,
            3 => self.a, 4 => self.b, 5 => self.c,
            _ => 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MachineState {
    #[serde(rename = "machineState")] pub status: MachineStatus,
    pub pos: [f64; AXIS_COUNT],
    pub wco: [f64; AXIS_COUNT],
    pub feed: f64,
    #[serde(rename = "spindleSpeed")] pub spindle_speed: f64,
    pub spindle: SpindleState,
    pub coolant: CoolantState,
    pub limits: LimitState,
    pub probe: ProbeState,
    pub door: bool,
    #[serde(rename = "simSpeed")] pub sim_speed: u8,
    #[serde(rename = "axisCount")] pub axis_count: usize,
    pub travel: [f64; AXIS_COUNT],
    #[serde(rename = "fluidConfig")] pub fluid_config: HashMap<String, String>,
    #[serde(skip)]
    pub modal: ModalState,
    /// Planned end position: updated when a motion command is accepted into the queue.
    /// Used by resolve_target() so queued G91 relative moves chain off the planned
    /// end of the previous move rather than the live mid-move position.
    #[serde(skip)]
    pub planned_pos: [f64; AXIS_COUNT],
    #[serde(skip)]
    pub homing_in_progress: bool,
    #[serde(skip)]
    pub hold_pending: bool,
    /// Set by \x85 jog-cancel; cleared when a new $J command is interpreted.
    /// Causes the motion task to drain queued jog moves back to Idle instead
    /// of executing them.
    #[serde(skip)]
    pub jog_cancel_pending: bool,
    /// Number of motion commands currently queued in the motion executor (including
    /// the command being actively executed). Reported in the Buf: status field.
    #[serde(skip)]
    pub planner_buf_used: i32,
    /// Modal feed rate (last F word value). Persists across moves and is never zeroed
    /// by motion completion. Used by G1/G2/G3/G38 at dispatch time.
    #[serde(skip)]
    pub modal_feed: f64,
    /// Incremented on every soft_reset. Motion tasks capture this at dispatch time and
    /// abort immediately if it has changed, preventing stale queued moves from executing.
    #[serde(skip)]
    pub reset_epoch: u64,
}

impl MachineState {
    pub fn new(axis_count: usize, travel: [f64; AXIS_COUNT], tip_diameter: f64, sim_speed: u8) -> Self {
        let mut fluid_config = HashMap::new();
        fluid_config.insert("board".into(), "BlackBox X32".into());
        fluid_config.insert("name".into(), "CNC Router (Simulator)".into());
        fluid_config.insert("stepping/engine".into(), "RMT".into());
        fluid_config.insert("axes/x/steps_per_mm".into(), "80.000".into());
        fluid_config.insert("axes/y/steps_per_mm".into(), "80.000".into());
        fluid_config.insert("axes/z/steps_per_mm".into(), "400.000".into());
        fluid_config.insert("axes/x/max_rate_mm_per_min".into(), "5000".into());
        fluid_config.insert("axes/y/max_rate_mm_per_min".into(), "5000".into());
        fluid_config.insert("axes/z/max_rate_mm_per_min".into(), "1000".into());
        fluid_config.insert("axes/x/acceleration".into(), "200".into());
        fluid_config.insert("axes/y/acceleration".into(), "200".into());
        fluid_config.insert("axes/z/acceleration".into(), "100".into());
        fluid_config.insert("axes/x/homing/cycle".into(), "2".into());
        fluid_config.insert("axes/y/homing/cycle".into(), "2".into());
        fluid_config.insert("axes/z/homing/cycle".into(), "1".into());

        let initial_pos = [-150.0, -100.0, 5.0, 0.0, 0.0, 0.0];
        Self {
            status: MachineStatus::Idle,
            pos: initial_pos,
            wco: [0.0; AXIS_COUNT],
            feed: 0.0,
            spindle_speed: 0.0,
            spindle: SpindleState::default(),
            coolant: CoolantState::default(),
            limits: LimitState::default(),
            probe: ProbeState { triggered: false, tip_diameter },
            door: false,
            sim_speed,
            axis_count,
            travel,
            fluid_config,
            modal: ModalState::default(),
            planned_pos: initial_pos,
            homing_in_progress: false,
            hold_pending: false,
            jog_cancel_pending: false,
            planner_buf_used: 0,
            modal_feed: 0.0,
            reset_epoch: 0,
        }
    }

    pub fn wpos(&self) -> [f64; AXIS_COUNT] {
        let mut w = [0.0; AXIS_COUNT];
        for i in 0..AXIS_COUNT {
            w[i] = self.pos[i] - self.wco[i];
        }
        w
    }

    pub fn soft_reset(&mut self) {
        self.status = MachineStatus::Idle;
        self.limits = LimitState::default();
        self.probe.triggered = false;
        self.door = false;
        self.homing_in_progress = false;
        self.hold_pending = false;
        self.jog_cancel_pending = false;
        self.planner_buf_used = 0;
        self.feed = 0.0;
        self.modal_feed = 0.0;
        // Snap planned position to actual — queued moves are discarded on reset
        self.planned_pos = self.pos;
        // Signal motion tasks to abort — any move with an older epoch is a stale pre-reset move
        self.reset_epoch = self.reset_epoch.wrapping_add(1);
    }

    pub fn is_accepting_commands(&self) -> bool {
        matches!(self.status, MachineStatus::Idle | MachineStatus::Run | MachineStatus::Check)
    }
}

pub type SharedMachineState = Arc<RwLock<MachineState>>;
pub type StateBroadcast = broadcast::Sender<()>;

pub fn new_shared(state: MachineState) -> (SharedMachineState, StateBroadcast) {
    let shared = Arc::new(RwLock::new(state));
    let (tx, _) = broadcast::channel(64);
    (shared, tx)
}

/// One line of FluidNC protocol traffic, broadcast to the sim-ui console.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleEntry {
    /// "rx" = received by the sim (a request), "tx" = sent by the sim (a response).
    pub dir: &'static str,
    /// Origin of the request (FluidNC client peer address).
    pub source: String,
    pub text: String,
    /// Epoch milliseconds.
    pub ts: u64,
}

pub type ConsoleBroadcast = broadcast::Sender<ConsoleEntry>;

pub fn new_console() -> ConsoleBroadcast {
    let (tx, _) = broadcast::channel(512);
    tx
}

/// Current time in epoch milliseconds (used for console timestamps).
pub fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
