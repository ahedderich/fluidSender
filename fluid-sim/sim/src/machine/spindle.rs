use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SpindleMode {
    #[default]
    Off,
    Cw,
    Ccw,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SpindleState {
    pub mode: SpindleMode,
    pub rpm: f64,
}

impl SpindleState {
    pub fn on_cw(rpm: f64) -> Self { Self { mode: SpindleMode::Cw, rpm } }
    pub fn on_ccw(rpm: f64) -> Self { Self { mode: SpindleMode::Ccw, rpm } }
    pub fn off() -> Self { Self { mode: SpindleMode::Off, rpm: 0.0 } }

    pub fn accessory_flag(&self) -> Option<char> {
        match self.mode {
            SpindleMode::Off => None,
            SpindleMode::Cw => Some('S'),
            SpindleMode::Ccw => Some('C'),
        }
    }
}
