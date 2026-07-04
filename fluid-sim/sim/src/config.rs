use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerConfig {
    pub fluidnc_port: u16,
    pub control_port: u16,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            fluidnc_port: 8765,
            control_port: 8766,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AxisValues {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub a: f64,
    pub b: f64,
    pub c: f64,
}

impl AxisValues {
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

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MachineConfig {
    pub axis_count: usize,
    pub travel: AxisValues,
    pub max_rate: AxisValues,
    pub acceleration: AxisValues,
    pub steps_per_mm: AxisValues,
    pub soft_limits: bool,
    pub homing_duration_ms: u64,
}

impl Default for MachineConfig {
    fn default() -> Self {
        Self {
            axis_count: 3,
            travel: AxisValues {
                x: 300.0,
                y: 200.0,
                z: 80.0,
                a: 360.0,
                b: 360.0,
                c: 360.0,
            },
            max_rate: AxisValues {
                x: 5000.0,
                y: 5000.0,
                z: 1000.0,
                a: 1000.0,
                b: 1000.0,
                c: 1000.0,
            },
            acceleration: AxisValues {
                x: 200.0,
                y: 200.0,
                z: 100.0,
                a: 100.0,
                b: 100.0,
                c: 100.0,
            },
            steps_per_mm: AxisValues {
                x: 80.0,
                y: 80.0,
                z: 400.0,
                a: 80.0,
                b: 80.0,
                c: 80.0,
            },
            soft_limits: true,
            homing_duration_ms: 2000,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProbeConfig {
    pub tip_diameter: f64,
    #[serde(default)]
    pub deviations: crate::machine::probe::ProbeDeviations,
}

impl Default for ProbeConfig {
    fn default() -> Self {
        Self {
            tip_diameter: 2.0,
            deviations: Default::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SimConfig {
    pub speed: u8,
    pub tick_hz: u32,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            speed: 1,
            tick_hz: 50,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Config {
    #[serde(default)]
    pub server: ServerConfig,
    #[serde(default)]
    pub machine: MachineConfig,
    #[serde(default)]
    pub probe: ProbeConfig,
    #[serde(default)]
    pub sim: SimConfig,
}

impl Config {
    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let text = std::fs::read_to_string(path)?;
        let cfg: Self = serde_yaml::from_str(&text)?;
        Ok(cfg)
    }
}
