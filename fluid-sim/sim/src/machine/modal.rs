/// Modal GCode state — persists between lines in a session.
#[derive(Debug, Clone)]
pub struct ModalState {
    pub units: Units,
    pub plane: Plane,
    pub distance: DistanceMode,
    pub wcs: u8,
    /// G92 coordinate offset (added on top of WCS offset)
    pub g92_offset: [f64; 6],
    /// Stored positions for G28 / G30
    pub g28_pos: Option<[f64; 6]>,
    pub g30_pos: Option<[f64; 6]>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Units {
    #[default]
    Mm,
    Inch,
}

impl Units {
    pub fn to_mm(&self, val: f64) -> f64 {
        match self {
            Units::Mm => val,
            Units::Inch => val * 25.4,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Plane {
    #[default]
    Xy,
    Xz,
    Yz,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DistanceMode {
    #[default]
    Absolute,
    Relative,
}

impl Default for ModalState {
    fn default() -> Self {
        Self {
            units: Units::Mm,
            plane: Plane::Xy,
            distance: DistanceMode::Absolute,
            wcs: 1,
            g92_offset: [0.0; 6],
            g28_pos: None,
            g30_pos: None,
        }
    }
}
