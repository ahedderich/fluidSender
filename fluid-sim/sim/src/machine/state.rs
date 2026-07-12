use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

use crate::machine::coolant::CoolantState;
use crate::machine::modal::ModalState;
use crate::machine::probe::ProbeDeviations;
use crate::machine::spindle::SpindleState;
use crate::machine::stock::{StockDefinition, StockShape};

pub const AXIS_COUNT: usize = 6;
pub const AXIS_NAMES: [&str; AXIS_COUNT] = ["x", "y", "z", "a", "b", "c"];
/// Number of planner buffer slots, matching FluidNC firmware default.
pub const MAX_PLANNER_SLOTS: i32 = 15;
/// Default reported firmware version (mirrors FluidNC's own current release numbering).
pub const DEFAULT_FIRMWARE_VERSION: &str = "4.0.3";
pub const SIM_MACHINE_NAME: &str = "CNC Router (Simulator)";
pub const SIM_BOARD_NAME: &str = "BlackBox X32";

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LimitState {
    #[serde(rename = "xMin")]
    pub x_min: bool,
    #[serde(rename = "xMax")]
    pub x_max: bool,
    #[serde(rename = "yMin")]
    pub y_min: bool,
    #[serde(rename = "yMax")]
    pub y_max: bool,
    #[serde(rename = "zMin")]
    pub z_min: bool,
    #[serde(rename = "zMax")]
    pub z_max: bool,
}

impl LimitState {
    pub fn any_active(&self) -> bool {
        self.x_min || self.x_max || self.y_min || self.y_max || self.z_min || self.z_max
    }

    pub fn pn_string(&self, probe: bool, door: bool) -> String {
        let mut s = String::new();
        if self.x_min {
            s.push('X');
        }
        if self.x_max {
            s.push('x');
        }
        if self.y_min {
            s.push('Y');
        }
        if self.y_max {
            s.push('y');
        }
        if self.z_min {
            s.push('Z');
        }
        if self.z_max {
            s.push('z');
        }
        if probe {
            s.push('P');
        }
        if door {
            s.push('D');
        }
        s
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProbeState {
    pub triggered: bool,
    #[serde(default)]
    pub deviations: ProbeDeviations,
}

/// Tool-setter trigger geometry, configured from the sim-ui. `trigger_z` is the
/// physical machine-Z of the switch's contact surface with a hypothetical
/// zero-length tool — it is the sim-side ground truth that a tester calibrates
/// against via FluidSender's own "measure + apply baseline" flow, not a value
/// meant to be copied into FluidSender's settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsetterConfig {
    pub enabled: bool,
    pub x: f64,
    pub y: f64,
    pub radius: f64,
    pub trigger_z: f64,
}

impl Default for ToolsetterConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            x: 0.0,
            y: 0.0,
            radius: 4.0,
            trigger_z: -60.0,
        }
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
        Self {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            a: 0.0,
            b: 0.0,
            c: 0.0,
        }
    }

    pub fn from_arr(arr: &[f64; AXIS_COUNT]) -> Self {
        Self {
            x: arr[0],
            y: arr[1],
            z: arr[2],
            a: arr[3],
            b: arr[4],
            c: arr[5],
        }
    }

    pub fn get(&self, axis: usize) -> f64 {
        match axis {
            0 => self.x,
            1 => self.y,
            2 => self.z,
            3 => self.a,
            4 => self.b,
            5 => self.c,
            _ => 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MachineState {
    #[serde(rename = "machineState")]
    pub status: MachineStatus,
    pub pos: [f64; AXIS_COUNT],
    pub wco: [f64; AXIS_COUNT],
    pub feed: f64,
    #[serde(rename = "spindleSpeed")]
    pub spindle_speed: f64,
    pub spindle: SpindleState,
    pub coolant: CoolantState,
    pub limits: LimitState,
    pub probe: ProbeState,
    pub door: bool,
    #[serde(rename = "feedOverride")]
    pub feed_override: u8,
    #[serde(rename = "spindleOverride")]
    pub spindle_override: u8,
    #[serde(rename = "simSpeed")]
    pub sim_speed: u8,
    #[serde(rename = "axisCount")]
    pub axis_count: usize,
    pub travel: [f64; AXIS_COUNT],
    /// Per-axis max rate (mm/min). Rapids (G0/G28/G30) run at the vector rate that
    /// keeps every participating axis at or below its max — F words are ignored.
    #[serde(skip)]
    pub max_rate: [f64; AXIS_COUNT],
    /// Per-axis acceleration and steps/mm as declared in config.yaml. Not read by any
    /// motion logic (FluidNC's real firmware needs them for step generation, which this
    /// sim doesn't model) — reported purely so `$Config`/`$LocalFS/Show` reflect the
    /// same numbers a real controller would, instead of disconnected placeholder values.
    #[serde(skip)]
    pub acceleration: [f64; AXIS_COUNT],
    #[serde(skip)]
    pub steps_per_mm: [f64; AXIS_COUNT],
    /// Version string reported in the greeting/`$I`/`$SS` banners, e.g. "4.0.3".
    /// Settable at runtime via the control API so the sim-ui can exercise FluidSender's
    /// update-check flow against arbitrary versions without restarting the sim.
    #[serde(rename = "firmwareVersion")]
    pub firmware_version: String,
    #[serde(rename = "fluidConfig")]
    pub fluid_config: HashMap<String, String>,
    /// Stock definition used for probe collision detection; set via the control API.
    /// Persists across soft-resets.
    #[serde(skip)]
    pub stock: Option<StockDefinition>,
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
    /// Tool length offset from G43.1 (Z only in practice); cleared by G49. Persists
    /// across soft_reset — real firmware only clears this on power cycle, which the
    /// sim does not model as a distinct lifecycle event.
    #[serde(rename = "toolLengthOffset")]
    pub tool_length_offset: [f64; AXIS_COUNT],
    /// Physical length of the currently loaded tool, set from the sim-ui as a stand-in
    /// for the operator physically swapping the tool (M6 never reaches the sim for
    /// manual/toolsetter toolchange strategies — FluidSender intercepts it client-side).
    #[serde(rename = "toolLength")]
    pub tool_length: f64,
    /// Tool-setter trigger geometry. Persists across soft_reset (the physical switch
    /// doesn't move when an alarm is cleared).
    pub toolsetter: ToolsetterConfig,
}

impl MachineState {
    pub fn new(
        axis_count: usize,
        travel: [f64; AXIS_COUNT],
        deviations: ProbeDeviations,
        sim_speed: u8,
    ) -> Self {
        let mut fluid_config = HashMap::new();
        fluid_config.insert("board".into(), SIM_BOARD_NAME.into());
        fluid_config.insert("name".into(), SIM_MACHINE_NAME.into());
        fluid_config.insert("stepping/engine".into(), "RMT".into());
        // Per-axis steps_per_mm/max_rate_mm_per_min/acceleration/max_travel_mm are
        // deliberately absent here — effective_fluid_config() computes them live from
        // travel/max_rate/acceleration/steps_per_mm so they can never go stale relative
        // to those fields.
        fluid_config.insert("axes/x/homing/cycle".into(), "2".into());
        fluid_config.insert("axes/y/homing/cycle".into(), "2".into());
        fluid_config.insert("axes/z/homing/cycle".into(), "1".into());
        fluid_config.insert("axes/x/motor0/limit_neg_pin".into(), "gpio.1".into());
        fluid_config.insert("axes/x/motor0/limit_pos_pin".into(), "gpio.2".into());
        fluid_config.insert("axes/x/motor0/hard_limits".into(), "true".into());
        fluid_config.insert("axes/x/motor0/pulloff_mm".into(), "3".into());
        fluid_config.insert("axes/y/motor0/limit_neg_pin".into(), "gpio.3".into());
        fluid_config.insert("axes/y/motor0/limit_pos_pin".into(), "gpio.4".into());
        fluid_config.insert("axes/y/motor0/hard_limits".into(), "true".into());
        fluid_config.insert("axes/y/motor0/pulloff_mm".into(), "3".into());
        fluid_config.insert("axes/z/motor0/limit_neg_pin".into(), "gpio.5".into());
        fluid_config.insert("axes/z/motor0/limit_pos_pin".into(), "gpio.6".into());
        fluid_config.insert("axes/z/motor0/hard_limits".into(), "true".into());
        fluid_config.insert("axes/z/motor0/pulloff_mm".into(), "3".into());
        fluid_config.insert("probe/pin".into(), "gpio.22".into());
        fluid_config.insert("probe/toolsetter_pin".into(), "gpio.23".into());
        fluid_config.insert("probe/check_mode_start".into(), "false".into());
        fluid_config.insert("probe/hard_stop".into(), "true".into());
        fluid_config.insert("control/safety_door_pin".into(), "gpio.25".into());
        fluid_config.insert("control/reset_pin".into(), "NO_PIN".into());
        fluid_config.insert("control/feed_hold_pin".into(), "NO_PIN".into());
        fluid_config.insert("control/cycle_start_pin".into(), "NO_PIN".into());

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
            probe: ProbeState {
                triggered: false,
                deviations,
            },
            door: false,
            feed_override: 100,
            spindle_override: 100,
            sim_speed,
            axis_count,
            travel,
            max_rate: [5000.0, 5000.0, 1000.0, 1000.0, 1000.0, 1000.0],
            acceleration: [200.0, 200.0, 100.0, 100.0, 100.0, 100.0],
            steps_per_mm: [80.0, 80.0, 400.0, 80.0, 80.0, 80.0],
            firmware_version: DEFAULT_FIRMWARE_VERSION.to_string(),
            fluid_config,
            stock: None,
            modal: ModalState::default(),
            planned_pos: initial_pos,
            homing_in_progress: false,
            hold_pending: false,
            jog_cancel_pending: false,
            planner_buf_used: 0,
            modal_feed: 0.0,
            reset_epoch: 0,
            tool_length_offset: [0.0; AXIS_COUNT],
            tool_length: 0.0,
            toolsetter: ToolsetterConfig::default(),
        }
    }

    pub fn wpos(&self) -> [f64; AXIS_COUNT] {
        let mut w = [0.0; AXIS_COUNT];
        for (i, wi) in w.iter_mut().enumerate() {
            *wi = self.pos[i] - self.wco[i] - self.tool_length_offset[i];
        }
        w
    }

    /// `fluid_config` merged with the live per-axis values (x/y/z only, matching the
    /// scope of the reported `config.yaml`) so callers never read stale numbers that
    /// diverge from `travel`/`max_rate`/`acceleration`/`steps_per_mm` after a runtime
    /// change via the control API.
    pub fn effective_fluid_config(&self) -> HashMap<String, String> {
        let mut m = self.fluid_config.clone();
        for (i, name) in ["x", "y", "z"].iter().enumerate() {
            m.insert(
                format!("axes/{name}/steps_per_mm"),
                format!("{:.3}", self.steps_per_mm[i]),
            );
            m.insert(
                format!("axes/{name}/max_rate_mm_per_min"),
                format!("{:.0}", self.max_rate[i]),
            );
            m.insert(
                format!("axes/{name}/acceleration"),
                format!("{:.0}", self.acceleration[i]),
            );
            m.insert(
                format!("axes/{name}/max_travel_mm"),
                format!("{:.3}", self.travel[i]),
            );
        }
        m
    }

    /// Ephemeral collision volume for the tool-setter, reusing the stock contact-test
    /// machinery: a round "stock" whose top surface sits at `trigger_z + tool_length`,
    /// with an oversized depth so a straight-down probe always contacts it regardless
    /// of approach height. `None` when the tool-setter isn't enabled.
    pub fn toolsetter_volume(&self) -> Option<StockDefinition> {
        if !self.toolsetter.enabled {
            return None;
        }
        Some(StockDefinition {
            shape: StockShape::Round {
                diameter: self.toolsetter.radius * 2.0,
            },
            depth: 1000.0,
            ox: self.toolsetter.x,
            oy: self.toolsetter.y,
            oz: self.toolsetter.trigger_z + self.tool_length,
            hole: None,
            point: None,
        })
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
        self.feed_override = 100;
        self.spindle_override = 100;
        // Snap planned position to actual — queued moves are discarded on reset
        self.planned_pos = self.pos;
        // Signal motion tasks to abort — any move with an older epoch is a stale pre-reset move
        self.reset_epoch = self.reset_epoch.wrapping_add(1);
    }

    pub fn is_accepting_commands(&self) -> bool {
        matches!(
            self.status,
            MachineStatus::Idle | MachineStatus::Run | MachineStatus::Check
        )
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
