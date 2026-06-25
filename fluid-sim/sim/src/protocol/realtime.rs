/// Real-time single-byte command classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RealtimeCmd {
    StatusQuery,
    FeedHold,
    CycleStart,
    SoftReset,
    JogCancel,
    SafetyDoor,
    /// Feed override +10% (0x91)
    FeedOvPlus10,
    /// Feed override -10% (0x92)
    FeedOvMinus10,
    /// Spindle override +10% (0x9A)
    SpindleOvPlus10,
    /// Spindle override -10% (0x9B)
    SpindleOvMinus10,
    /// Unknown real-time byte — ignore silently
    Unknown(u8),
}

pub fn classify(b: u8) -> RealtimeCmd {
    match b {
        0x3F => RealtimeCmd::StatusQuery,
        0x21 => RealtimeCmd::FeedHold,
        0x7E => RealtimeCmd::CycleStart,
        0x18 => RealtimeCmd::SoftReset,
        0x85 => RealtimeCmd::JogCancel,
        0x84 => RealtimeCmd::SafetyDoor,
        0x91 => RealtimeCmd::FeedOvPlus10,
        0x92 => RealtimeCmd::FeedOvMinus10,
        0x9A => RealtimeCmd::SpindleOvPlus10,
        0x9B => RealtimeCmd::SpindleOvMinus10,
        _ => RealtimeCmd::Unknown(b),
    }
}
