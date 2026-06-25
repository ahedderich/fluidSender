use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CoolantState {
    #[default]
    Off,
    Mist,
    Flood,
}

impl CoolantState {
    pub fn accessory_flags(&self) -> String {
        match self {
            CoolantState::Off => String::new(),
            CoolantState::Mist => "M".to_string(),
            CoolantState::Flood => "F".to_string(),
        }
    }
}
