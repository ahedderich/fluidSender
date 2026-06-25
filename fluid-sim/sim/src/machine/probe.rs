use crate::machine::stock::StockDefinition;

/// Result of a probe step check.
pub enum ProbeHit {
    /// No contact yet, continue moving.
    None,
    /// Contact detected; reported position (with tip offset applied).
    Contact([f64; 3]),
}

/// Check if the current probe position has made contact.
/// Checks manual trigger first, then stock surface collision.
pub fn check_probe_contact(
    pos: [f64; 3],
    direction: [f64; 3],
    tip_diameter: f64,
    manual_triggered: bool,
    stock: Option<&StockDefinition>,
) -> ProbeHit {
    let tip_r = tip_diameter / 2.0;

    if manual_triggered {
        // For a manually triggered probe, report the current tool centre position.
        return ProbeHit::Contact(pos);
    }

    if let Some(s) = stock {
        if let Some(surface) = s.probe_contact(pos, direction, tip_r) {
            let reported = apply_tip_offset(surface, direction, tip_r);
            return ProbeHit::Contact(reported);
        }
    }

    ProbeHit::None
}

/// Convert a surface contact point to the tool-centre reported position.
/// The tool centre is tip_r behind the surface in the probe direction.
/// reported = surface_contact - direction * tip_r
fn apply_tip_offset(surface: [f64; 3], direction: [f64; 3], tip_r: f64) -> [f64; 3] {
    [
        surface[0] - direction[0] * tip_r,
        surface[1] - direction[1] * tip_r,
        surface[2] - direction[2] * tip_r,
    ]
}

/// Normalise a direction vector; returns None if zero-length.
pub fn normalise(v: [f64; 3]) -> Option<[f64; 3]> {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if len < 1e-9 { return None; }
    Some([v[0] / len, v[1] / len, v[2] / len])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::machine::stock::{StockDefinition, StockShape};

    fn make_stock() -> StockDefinition {
        StockDefinition {
            shape: StockShape::Rect { width: 100.0, height: 80.0, rotation: 0.0 },
            depth: 20.0,
            ox: 100.0, oy: 60.0, oz: 5.0,
            hole: None, point: None,
        }
    }

    #[test]
    fn tip_offset_along_z() {
        // Surface contact point is at z=5.0, probe moved downward (dir=[0,0,-1])
        // Reported tool centre = surface - dir * tip_r = 5.0 - (-1.0)*1.0 = 6.0
        let surface = [100.0, 60.0, 5.0];
        let dir = [0.0, 0.0, -1.0];
        let tip_r = 1.0;
        let result = apply_tip_offset(surface, dir, tip_r);
        assert!((result[2] - 6.0).abs() < 1e-9, "reported z={}", result[2]);
    }

    #[test]
    fn manual_trigger_returns_contact() {
        let pos = [50.0, 50.0, 10.0];
        let dir = [0.0, 0.0, -1.0];
        let hit = check_probe_contact(pos, dir, 2.0, true, None);
        assert!(matches!(hit, ProbeHit::Contact(_)));
    }

    #[test]
    fn no_contact_without_trigger_or_stock() {
        let pos = [50.0, 50.0, 10.0];
        let dir = [0.0, 0.0, -1.0];
        let hit = check_probe_contact(pos, dir, 2.0, false, None);
        assert!(matches!(hit, ProbeHit::None));
    }

    #[test]
    fn half_tip_offset_value() {
        // Probe centre at z=6.0, moving downward into stock whose top is at z=5.0.
        // Front of sphere: 6.0 + (-1)*1 = 5.0 — exactly at stock top → contact.
        // Reported position = surface - dir * tip_r = 5.0 - (-1)*1 = 6.0 (tool centre at contact).
        let stock = make_stock();
        let pos = [100.0, 60.0, 6.0];
        let dir = [0.0, 0.0, -1.0];
        let hit = check_probe_contact(pos, dir, 2.0, false, Some(&stock));
        if let ProbeHit::Contact(reported) = hit {
            assert!((reported[2] - 6.0).abs() < 0.1, "reported z={}", reported[2]);
        } else {
            panic!("expected contact");
        }
    }

    #[test]
    fn normalise_unit_vector() {
        let v = normalise([3.0, 0.0, 4.0]).unwrap();
        let len = (v[0]*v[0] + v[1]*v[1] + v[2]*v[2]).sqrt();
        assert!((len - 1.0).abs() < 1e-9);
    }

    #[test]
    fn normalise_zero_returns_none() {
        assert!(normalise([0.0, 0.0, 0.0]).is_none());
    }
}
