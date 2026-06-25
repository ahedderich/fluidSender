use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StockShape {
    Rect { width: f64, height: f64, rotation: f64 },
    Round { diameter: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HoleDefinition {
    pub x: f64,
    pub y: f64,
    pub diameter: f64,
    pub depth: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferencePoint {
    pub x: f64,
    pub y: f64,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockDefinition {
    pub shape: StockShape,
    /// Z thickness (depth into material, positive value)
    pub depth: f64,
    /// Stock origin in machine coordinates
    pub ox: f64,
    pub oy: f64,
    /// Top surface Z in machine coordinates
    pub oz: f64,
    pub hole: Option<HoleDefinition>,
    pub point: Option<ReferencePoint>,
}

impl StockDefinition {
    /// Returns the Z coordinate of the stock top surface in machine coords.
    pub fn top_z(&self) -> f64 { self.oz }
    pub fn bottom_z(&self) -> f64 { self.oz - self.depth }

    /// Test whether a point (machine coords) is inside the stock XY footprint.
    pub fn contains_xy(&self, x: f64, y: f64) -> bool {
        match &self.shape {
            StockShape::Rect { width, height, rotation } => {
                // Rotate point into stock frame
                let dx = x - self.ox;
                let dy = y - self.oy;
                let angle = -rotation.to_radians();
                let lx = dx * angle.cos() - dy * angle.sin();
                let ly = dx * angle.sin() + dy * angle.cos();
                lx.abs() <= width / 2.0 && ly.abs() <= height / 2.0
            }
            StockShape::Round { diameter } => {
                let dx = x - self.ox;
                let dy = y - self.oy;
                dx * dx + dy * dy <= (diameter / 2.0) * (diameter / 2.0)
            }
        }
    }

    /// Returns true if the point is inside a hole (so probe would NOT contact stock there).
    pub fn in_hole(&self, x: f64, y: f64, z: f64) -> bool {
        let Some(hole) = &self.hole else { return false };
        let cx = self.ox + hole.x;
        let cy = self.oy + hole.y;
        let dx = x - cx;
        let dy = y - cy;
        let r = hole.diameter / 2.0;
        let in_xy = dx * dx + dy * dy <= r * r;
        let hole_bottom = self.oz - hole.depth;
        let in_z = z <= self.oz && z >= hole_bottom;
        in_xy && in_z
    }

    /// Check if a probe tip (centre at pos, radius tip_r) contacts the stock surface.
    /// Returns the contact point in machine coords if hit, else None.
    /// This is a simplified surface-hit check: tests the probe centre approaching from outside.
    pub fn probe_contact(
        &self,
        pos: [f64; 3],
        direction: [f64; 3],
        tip_r: f64,
    ) -> Option<[f64; 3]> {
        let [px, py, pz] = pos;

        // The front of the probe sphere in the direction of motion
        // For a probe moving downward (dir=[0,0,-1]): front_z = pz + (-1)*tip_r = pz - tip_r
        let front_x = px + direction[0] * tip_r;
        let front_y = py + direction[1] * tip_r;
        let front_z = pz + direction[2] * tip_r;

        // Check if the front of the sphere has entered the stock volume
        if front_z > self.top_z() + 0.001 { return None; } // still above stock
        if front_z < self.bottom_z() - 0.001 { return None; } // below stock entirely

        if !self.contains_xy(front_x, front_y) { return None; }
        if self.in_hole(front_x, front_y, front_z) { return None; }

        // Return the stock surface contact point (on the top face for Z probing)
        let contact_z = self.top_z();
        Some([front_x, front_y, contact_z])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect_stock() -> StockDefinition {
        StockDefinition {
            shape: StockShape::Rect { width: 100.0, height: 80.0, rotation: 0.0 },
            depth: 20.0,
            ox: 100.0, oy: 60.0, oz: 5.0,
            hole: None, point: None,
        }
    }

    fn round_stock() -> StockDefinition {
        StockDefinition {
            shape: StockShape::Round { diameter: 80.0 },
            depth: 20.0,
            ox: 100.0, oy: 60.0, oz: 5.0,
            hole: None, point: None,
        }
    }

    #[test]
    fn rect_contains_center() {
        let s = rect_stock();
        assert!(s.contains_xy(100.0, 60.0));
    }

    #[test]
    fn rect_misses_outside() {
        let s = rect_stock();
        assert!(!s.contains_xy(10.0, 10.0));
    }

    #[test]
    fn rect_edge() {
        let s = rect_stock();
        // exactly on edge of 100×80 centred at (100,60) → corners at (50,20) and (150,100)
        assert!(s.contains_xy(150.0, 60.0));  // right edge midpoint
        assert!(!s.contains_xy(150.1, 60.0)); // just outside
    }

    #[test]
    fn rect_rotated_45() {
        let s = StockDefinition {
            shape: StockShape::Rect { width: 100.0, height: 100.0, rotation: 45.0 },
            depth: 20.0,
            ox: 0.0, oy: 0.0, oz: 5.0,
            hole: None, point: None,
        };
        // Point along X axis at 40 mm — inside the 100×100 square rotated 45°
        assert!(s.contains_xy(40.0, 0.0));
        // 75 mm along X axis — beyond the 45° corner which extends to ~70.7 mm
        assert!(!s.contains_xy(75.0, 0.0));
    }

    #[test]
    fn round_contains_center() {
        let s = round_stock();
        assert!(s.contains_xy(100.0, 60.0));
    }

    #[test]
    fn round_edge() {
        let s = round_stock();
        assert!(s.contains_xy(140.0, 60.0));  // exactly on edge (r=40)
        assert!(!s.contains_xy(140.1, 60.0));
    }

    #[test]
    fn hole_exclusion() {
        let mut s = rect_stock();
        s.hole = Some(HoleDefinition { x: 0.0, y: 0.0, diameter: 20.0, depth: 20.0 });
        // Point at stock centre inside hole
        assert!(s.in_hole(100.0, 60.0, 0.0));
        // Point outside hole
        assert!(!s.in_hole(120.0, 60.0, 0.0));
    }

    #[test]
    fn probe_contact_top_surface() {
        let s = rect_stock();
        // Probe descending from above, tip at stock surface z
        let contact = s.probe_contact([100.0, 60.0, 5.1], [0.0, 0.0, -1.0], 1.0);
        assert!(contact.is_some());
    }

    #[test]
    fn probe_no_contact_above() {
        let s = rect_stock();
        // Probe far above, tip not yet at surface
        let contact = s.probe_contact([100.0, 60.0, 20.0], [0.0, 0.0, -1.0], 1.0);
        assert!(contact.is_none());
    }

    #[test]
    fn probe_no_contact_outside_xy() {
        let s = rect_stock();
        let contact = s.probe_contact([5.0, 5.0, 5.0], [0.0, 0.0, -1.0], 1.0);
        assert!(contact.is_none());
    }
}
