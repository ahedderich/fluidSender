use serde::{Deserialize, Serialize};

use crate::machine::stock::StockDefinition;

/// Per-direction probe trigger deviations (mm).
///
/// Sign convention (PROBE_DEVIATION_PLAN.md §2.1): deviation = extra distance the
/// machine travels past the ideal geometric contact point before the trigger fires.
/// Positive = triggers late (pre-travel/deflection). Negative = triggers early.
/// Effective trigger offset from surface: r_eff = tip_radius − deviation.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ProbeDeviations {
    pub x_plus: f64,
    pub x_minus: f64,
    pub y_plus: f64,
    pub y_minus: f64,
    pub z_minus: f64,
}

/// Result of a probe step check.
pub enum ProbeHit {
    /// No contact yet, continue moving.
    None,
    /// Contact detected; reported position is the actual sampled tool-centre position.
    Contact([f64; 3]),
}

/// Blend the per-direction deviations for an arbitrary contact direction
/// (PROBE_DEVIATION_PLAN.md §2.2): L1-normalized weights over |n_i|, signed
/// per-axis lookup; +Z probing has no defined deviation and contributes 0.
pub fn blend_deviation(contact_dir: [f64; 3], d: &ProbeDeviations) -> f64 {
    let [nx, ny, nz] = contact_dir;
    let l1 = nx.abs() + ny.abs() + nz.abs();
    if l1 < 1e-9 {
        return 0.0;
    }
    let dev_x = if nx > 0.0 { d.x_plus } else { d.x_minus };
    let dev_y = if ny > 0.0 { d.y_plus } else { d.y_minus };
    let dev_z = if nz < 0.0 { d.z_minus } else { 0.0 };
    (nx.abs() * dev_x + ny.abs() * dev_y + nz.abs() * dev_z) / l1
}

/// Check if the current probe position has made (or, for away probes, lost) contact.
///
/// Trigger condition (PROBE_DEVIATION_PLAN.md §2.3): the test point
/// `pos + contact_dir · r_eff` is checked against the stock volume, where
/// `r_eff = tip_radius − blend_deviation(contact_dir)`. For approach probes the
/// contact direction is the motion direction; for away probes it is the negated
/// motion direction (the surface is behind the retracting probe) and the trigger
/// fires when the test point *leaves* the stock volume.
#[allow(clippy::too_many_arguments)]
pub fn check_probe_contact(
    pos: [f64; 3],
    motion_dir: [f64; 3],
    probe_away: bool,
    tip_diameter: f64,
    deviations: &ProbeDeviations,
    manual_triggered: bool,
    stock: Option<&StockDefinition>,
) -> ProbeHit {
    if manual_triggered {
        // A manually triggered probe resolves the move at the current tool centre,
        // for both approach and away probes.
        return ProbeHit::Contact(pos);
    }

    let Some(s) = stock else {
        return ProbeHit::None;
    };

    let contact_dir = if probe_away {
        [-motion_dir[0], -motion_dir[1], -motion_dir[2]]
    } else {
        motion_dir
    };
    let r_eff = tip_diameter / 2.0 - blend_deviation(contact_dir, deviations);
    let test_point = [
        pos[0] + contact_dir[0] * r_eff,
        pos[1] + contact_dir[1] * r_eff,
        pos[2] + contact_dir[2] * r_eff,
    ];

    let inside = s.contains_point(test_point);
    let triggered = if probe_away { !inside } else { inside };
    if triggered {
        ProbeHit::Contact(pos)
    } else {
        ProbeHit::None
    }
}

/// Normalise a direction vector; returns None if zero-length.
pub fn normalise(v: [f64; 3]) -> Option<[f64; 3]> {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if len < 1e-9 {
        return None;
    }
    Some([v[0] / len, v[1] / len, v[2] / len])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::machine::stock::{StockDefinition, StockShape};

    fn make_stock() -> StockDefinition {
        // 100×80 rect centred at (100, 60), top z=5, bottom z=-15
        // → faces at x=50/150, y=20/100
        StockDefinition {
            shape: StockShape::Rect {
                width: 100.0,
                height: 80.0,
                rotation: 0.0,
            },
            depth: 20.0,
            ox: 100.0,
            oy: 60.0,
            oz: 5.0,
            hole: None,
            point: None,
        }
    }

    fn devs(x_plus: f64, x_minus: f64, y_plus: f64, y_minus: f64, z_minus: f64) -> ProbeDeviations {
        ProbeDeviations {
            x_plus,
            x_minus,
            y_plus,
            y_minus,
            z_minus,
        }
    }

    #[test]
    fn blend_axis_aligned_returns_exact_values() {
        let d = devs(0.1, -0.2, 0.3, 0.4, 0.5);
        assert!((blend_deviation([1.0, 0.0, 0.0], &d) - 0.1).abs() < 1e-12);
        assert!((blend_deviation([-1.0, 0.0, 0.0], &d) - (-0.2)).abs() < 1e-12);
        assert!((blend_deviation([0.0, 1.0, 0.0], &d) - 0.3).abs() < 1e-12);
        assert!((blend_deviation([0.0, -1.0, 0.0], &d) - 0.4).abs() < 1e-12);
        assert!((blend_deviation([0.0, 0.0, -1.0], &d) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn blend_plus_z_returns_zero() {
        let d = devs(0.1, 0.2, 0.3, 0.4, 0.5);
        assert_eq!(blend_deviation([0.0, 0.0, 1.0], &d), 0.0);
    }

    #[test]
    fn blend_45_degrees_xy_returns_average() {
        let d = devs(0.2, 0.0, 0.4, 0.0, 0.0);
        let s = std::f64::consts::FRAC_1_SQRT_2;
        let b = blend_deviation([s, s, 0.0], &d);
        assert!((b - 0.3).abs() < 1e-12, "blend={}", b);
    }

    #[test]
    fn blend_diagonal_xyz_weights_sum_to_one() {
        // Equal-magnitude direction components → equal thirds of each deviation.
        let d = devs(0.3, 0.0, 0.6, 0.0, 0.9);
        let c = 1.0 / 3.0_f64.sqrt();
        let b = blend_deviation([c, c, -c], &d);
        assert!((b - (0.3 + 0.6 + 0.9) / 3.0).abs() < 1e-12, "blend={}", b);
    }

    #[test]
    fn blend_zero_vector_returns_zero() {
        let d = devs(0.1, 0.2, 0.3, 0.4, 0.5);
        assert_eq!(blend_deviation([0.0, 0.0, 0.0], &d), 0.0);
    }

    #[test]
    fn manual_trigger_returns_contact() {
        let pos = [50.0, 50.0, 10.0];
        let dir = [0.0, 0.0, -1.0];
        let hit = check_probe_contact(
            pos,
            dir,
            false,
            2.0,
            &ProbeDeviations::default(),
            true,
            None,
        );
        assert!(matches!(hit, ProbeHit::Contact(p) if p == pos));
    }

    #[test]
    fn no_contact_without_trigger_or_stock() {
        let pos = [50.0, 50.0, 10.0];
        let dir = [0.0, 0.0, -1.0];
        let hit = check_probe_contact(
            pos,
            dir,
            false,
            2.0,
            &ProbeDeviations::default(),
            false,
            None,
        );
        assert!(matches!(hit, ProbeHit::None));
    }

    #[test]
    fn approach_z_zero_deviation_triggers_at_top_plus_radius() {
        // Stock top z=5, tip Ø2 (r=1), no deviation → trigger when centre z ≤ 6.0.
        let stock = make_stock();
        let d = ProbeDeviations::default();
        let dir = [0.0, 0.0, -1.0];
        let hit = check_probe_contact(
            [100.0, 60.0, 6.05],
            dir,
            false,
            2.0,
            &d,
            false,
            Some(&stock),
        );
        assert!(
            matches!(hit, ProbeHit::None),
            "should not trigger above 6.0"
        );
        let hit = check_probe_contact([100.0, 60.0, 6.0], dir, false, 2.0, &d, false, Some(&stock));
        assert!(matches!(hit, ProbeHit::Contact(_)), "should trigger at 6.0");
    }

    #[test]
    fn approach_z_with_deviation_triggers_late() {
        // zMinus = +0.2 → r_eff = 0.8 → trigger when centre z ≤ 5.8.
        let stock = make_stock();
        let d = devs(0.0, 0.0, 0.0, 0.0, 0.2);
        let dir = [0.0, 0.0, -1.0];
        let hit = check_probe_contact([100.0, 60.0, 5.9], dir, false, 2.0, &d, false, Some(&stock));
        assert!(matches!(hit, ProbeHit::None), "should not trigger at 5.9");
        let hit = check_probe_contact([100.0, 60.0, 5.8], dir, false, 2.0, &d, false, Some(&stock));
        assert!(matches!(hit, ProbeHit::Contact(_)), "should trigger at 5.8");
    }

    #[test]
    fn approach_x_side_with_negative_deviation_triggers_early() {
        // +X into stock left face at x=50, xPlus = −0.1 → r_eff = 1.1
        // → trigger when centre x ≥ 50 − 1.1 = 48.9.
        let stock = make_stock();
        let d = devs(-0.1, 0.0, 0.0, 0.0, 0.0);
        let dir = [1.0, 0.0, 0.0];
        let hit = check_probe_contact([48.8, 60.0, 0.0], dir, false, 2.0, &d, false, Some(&stock));
        assert!(
            matches!(hit, ProbeHit::None),
            "should not trigger at x=48.8"
        );
        let hit = check_probe_contact([48.9, 60.0, 0.0], dir, false, 2.0, &d, false, Some(&stock));
        assert!(
            matches!(hit, ProbeHit::Contact(_)),
            "should trigger at x=48.9"
        );
    }

    #[test]
    fn away_probe_triggers_on_exit() {
        // Retracting in +Z after a −Z approach: contact_dir = −motion_dir = −Z.
        // r_eff = 1 → test point stays inside while centre z ≤ 6.0, exits above.
        let stock = make_stock();
        let d = ProbeDeviations::default();
        let dir = [0.0, 0.0, 1.0];
        let hit = check_probe_contact([100.0, 60.0, 5.9], dir, true, 2.0, &d, false, Some(&stock));
        assert!(
            matches!(hit, ProbeHit::None),
            "test point still inside at 5.9"
        );
        let hit = check_probe_contact([100.0, 60.0, 6.1], dir, true, 2.0, &d, false, Some(&stock));
        assert!(matches!(hit, ProbeHit::Contact(_)), "test point out at 6.1");
    }

    #[test]
    fn away_probe_already_outside_triggers_immediately() {
        let stock = make_stock();
        let d = ProbeDeviations::default();
        let dir = [0.0, 0.0, 1.0];
        let pos = [100.0, 60.0, 20.0];
        let hit = check_probe_contact(pos, dir, true, 2.0, &d, false, Some(&stock));
        assert!(matches!(hit, ProbeHit::Contact(p) if p == pos));
    }

    #[test]
    fn normalise_unit_vector() {
        let v = normalise([3.0, 0.0, 4.0]).unwrap();
        let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
        assert!((len - 1.0).abs() < 1e-9);
    }

    #[test]
    fn normalise_zero_returns_none() {
        assert!(normalise([0.0, 0.0, 0.0]).is_none());
    }
}
