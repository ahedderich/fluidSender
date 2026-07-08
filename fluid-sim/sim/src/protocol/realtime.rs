/// Real-time single-byte command classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RealtimeCmd {
    StatusQuery,
    FeedHold,
    CycleStart,
    SoftReset,
    JogCancel,
    SafetyDoor,
    /// Feed override reset to 100% (0x90)
    FeedOvrReset,
    /// Feed override +10% (0x91)
    FeedOvrCoarsePlus,
    /// Feed override -10% (0x92)
    FeedOvrCoarseMinus,
    /// Feed override +1% (0x93)
    FeedOvrFinePlus,
    /// Feed override -1% (0x94)
    FeedOvrFineMinus,
    /// Spindle override reset to 100% (0x99)
    SpindleOvrReset,
    /// Spindle override +10% (0x9A)
    SpindleOvrCoarsePlus,
    /// Spindle override -10% (0x9B)
    SpindleOvrCoarseMinus,
    /// Spindle override +1% (0x9C)
    SpindleOvrFinePlus,
    /// Spindle override -1% (0x9D)
    SpindleOvrFineMinus,
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
        0x90 => RealtimeCmd::FeedOvrReset,
        0x91 => RealtimeCmd::FeedOvrCoarsePlus,
        0x92 => RealtimeCmd::FeedOvrCoarseMinus,
        0x93 => RealtimeCmd::FeedOvrFinePlus,
        0x94 => RealtimeCmd::FeedOvrFineMinus,
        0x99 => RealtimeCmd::SpindleOvrReset,
        0x9A => RealtimeCmd::SpindleOvrCoarsePlus,
        0x9B => RealtimeCmd::SpindleOvrCoarseMinus,
        0x9C => RealtimeCmd::SpindleOvrFinePlus,
        0x9D => RealtimeCmd::SpindleOvrFineMinus,
        _ => RealtimeCmd::Unknown(b),
    }
}
