use std::sync::atomic::{AtomicU16, Ordering};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout};

static NEXT_PORT: AtomicU16 = AtomicU16::new(19000);

fn alloc_ports() -> (u16, u16) {
    let base = NEXT_PORT.fetch_add(2, Ordering::Relaxed);
    (base, base + 1)
}

/// Start the simulator in the background; returns (fluidnc_port, control_port).
async fn start_sim_with_speed(speed: u8) -> (u16, u16) {
    let (fluidnc_port, control_port) = alloc_ports();

    let cfg = fluidsim::config::Config {
        server: fluidsim::config::ServerConfig {
            fluidnc_port,
            control_port,
        },
        machine: fluidsim::config::MachineConfig::default(),
        probe: fluidsim::config::ProbeConfig::default(),
        sim: fluidsim::config::SimConfig {
            speed,
            tick_hz: 100,
        },
    };

    let travel = [300.0, 200.0, 80.0, 360.0, 360.0, 360.0];
    let state = fluidsim::machine::state::MachineState::new(
        cfg.machine.axis_count,
        travel,
        cfg.probe.deviations.clone(),
        cfg.sim.speed,
    );

    use std::sync::Arc;

    let (shared, broadcast) = fluidsim::machine::state::new_shared(state);
    let console = fluidsim::machine::state::new_console();
    let (move_tx, move_permits) = fluidsim::machine::motion::spawn_motion_task(
        Arc::clone(&shared),
        broadcast.clone(),
        cfg.sim.tick_hz,
    );

    let app_state = fluidsim::server::control::AppState {
        machine: Arc::clone(&shared),
        broadcast: broadcast.clone(),
        console: console.clone(),
    };

    tokio::spawn(fluidsim::server::fluidnc::run(
        fluidnc_port,
        Arc::clone(&shared),
        broadcast.clone(),
        console.clone(),
        move_tx,
        move_permits,
    ));
    tokio::spawn(fluidsim::server::control::run(control_port, app_state));

    // Give servers time to bind
    sleep(Duration::from_millis(100)).await;
    (fluidnc_port, control_port)
}

async fn start_sim() -> u16 {
    start_sim_with_speed(10).await.0
}

/// Minimal HTTP POST helper for the control API (avoids an HTTP client dependency).
async fn control_post(port: u16, path: &str, json_body: &str) {
    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
        .await
        .unwrap();
    let req = format!(
        "POST {} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        path,
        json_body.len(),
        json_body
    );
    stream.write_all(req.as_bytes()).await.unwrap();
    let mut resp = Vec::new();
    tokio::io::AsyncReadExt::read_to_end(&mut stream, &mut resp)
        .await
        .unwrap();
    let status_line = String::from_utf8_lossy(&resp);
    assert!(
        status_line.starts_with("HTTP/1.1 2"),
        "control API {} failed: {}",
        path,
        status_line.lines().next().unwrap_or("")
    );
}

/// Parse `[PRB:x,y,z:success]` → ([x, y, z], success).
fn parse_prb(line: &str) -> ([f64; 3], bool) {
    let inner = line.trim_start_matches("[PRB:").trim_end_matches(']');
    let (coords, success) = inner.rsplit_once(':').expect("malformed PRB");
    let vals: Vec<f64> = coords.split(',').map(|v| v.parse().unwrap()).collect();
    ([vals[0], vals[1], vals[2]], success == "1")
}

async fn connect(
    port: u16,
) -> (
    BufReader<tokio::net::tcp::OwnedReadHalf>,
    tokio::net::tcp::OwnedWriteHalf,
) {
    let stream = TcpStream::connect(format!("127.0.0.1:{}", port))
        .await
        .unwrap();
    let (r, w) = stream.into_split();
    (BufReader::new(r), w)
}

async fn read_line(reader: &mut BufReader<tokio::net::tcp::OwnedReadHalf>) -> String {
    let mut line = String::new();
    timeout(Duration::from_secs(5), reader.read_line(&mut line))
        .await
        .expect("read timeout")
        .expect("read error");
    line.trim_end_matches("\r\n")
        .trim_end_matches('\n')
        .to_string()
}

async fn read_until(
    reader: &mut BufReader<tokio::net::tcp::OwnedReadHalf>,
    contains: &str,
) -> Vec<String> {
    let mut lines = Vec::new();
    loop {
        let line = read_line(reader).await;
        let found = line.contains(contains);
        lines.push(line);
        if found {
            break;
        }
    }
    lines
}

#[tokio::test]
async fn greeting_on_connect() {
    let port = start_sim().await;
    let (mut reader, _writer) = connect(port).await;

    let first = read_line(&mut reader).await;
    assert!(first.contains("FluidNC"), "greeting: {}", first);
}

#[tokio::test]
async fn status_query_returns_idle() {
    let port = start_sim().await;
    let (mut reader, mut writer) = connect(port).await;
    read_until(&mut reader, "ok").await; // consume greeting

    writer.write_all(b"?\n").await.unwrap();
    let status = read_line(&mut reader).await;
    assert!(status.starts_with('<'), "status: {}", status);
    assert!(status.contains("Idle"), "not idle: {}", status);
    assert!(status.contains("MPos:"), "no mpos: {}", status);
    assert!(status.contains("WCO:"), "no wco: {}", status);
}

#[tokio::test]
async fn empty_line_gets_ok() {
    let port = start_sim().await;
    let (mut reader, mut writer) = connect(port).await;
    read_until(&mut reader, "ok").await;

    writer.write_all(b"\n").await.unwrap();
    let resp = read_line(&mut reader).await;
    assert_eq!(resp, "ok", "resp: {}", resp);
}

#[tokio::test]
async fn home_transitions_and_zeroes_position() {
    let port = start_sim().await;
    let (mut reader, mut writer) = connect(port).await;
    read_until(&mut reader, "ok").await;

    writer.write_all(b"$H\n").await.unwrap();
    // $H blocks until homing completes, returns ok
    let lines = read_until(&mut reader, "ok").await;
    assert!(lines.last().unwrap().contains("ok"), "{:?}", lines);

    // Check MPos is zero
    writer.write_all(b"?\n").await.unwrap();
    let status = read_line(&mut reader).await;
    assert!(
        status.contains("MPos:0.000,0.000,0.000"),
        "after home: {}",
        status
    );
}

#[tokio::test]
async fn unlock_clears_alarm() {
    let port = start_sim().await;
    let (mut reader, mut writer) = connect(port).await;
    read_until(&mut reader, "ok").await;

    writer.write_all(b"$X\n").await.unwrap();
    let lines = read_until(&mut reader, "ok").await;
    let combined = lines.join(" ");
    assert!(combined.contains("Unlocked"), "no unlock msg: {}", combined);
}

#[tokio::test]
async fn settings_dump_returns_config() {
    let port = start_sim().await;
    let (mut reader, mut writer) = connect(port).await;
    read_until(&mut reader, "ok").await;

    writer.write_all(b"$$\n").await.unwrap();
    let lines = read_until(&mut reader, "ok").await;
    let combined = lines.join("\n");
    assert!(combined.contains("steps_per_mm"), "settings: {}", combined);
}

#[tokio::test]
async fn gcode_g0_move_updates_position() {
    let port = start_sim().await;
    let (mut reader, mut writer) = connect(port).await;
    read_until(&mut reader, "ok").await;

    // First home to get to known position
    writer.write_all(b"$H\n").await.unwrap();
    read_until(&mut reader, "ok").await;

    // Move to X-50 Y-50 (work area is in the negative quadrant)
    writer.write_all(b"G0 X-50 Y-50\n").await.unwrap();
    read_until(&mut reader, "ok").await;

    // Poll until position reaches target (motion is async)
    for _ in 0..50 {
        writer.write_all(b"?\n").await.unwrap();
        let status = read_line(&mut reader).await;
        if status.contains("MPos:-50.000,-50.000") {
            return;
        }
        sleep(Duration::from_millis(100)).await;
    }
    // Final check
    writer.write_all(b"?\n").await.unwrap();
    let status = read_line(&mut reader).await;
    assert!(
        status.contains("MPos:-50.000,-50.000"),
        "final status: {}",
        status
    );
}

#[tokio::test]
async fn program_pause_m0_resumes_on_cycle_start() {
    let port = start_sim().await;
    let (mut reader, mut writer) = connect(port).await;
    read_until(&mut reader, "ok").await; // consume greeting

    // M0 is B2 — ok is withheld until cycle-start (~) resumes the machine, so
    // this must not resolve the moment it's sent.
    writer.write_all(b"M0\n").await.unwrap();

    // Poll status until Hold is reported, confirming the pause was entered
    // and no ok has arrived for the M0 line yet.
    let mut saw_hold = false;
    for _ in 0..50 {
        writer.write_all(b"?\n").await.unwrap();
        let status = read_line(&mut reader).await;
        if status.contains("Hold") {
            saw_hold = true;
            break;
        }
        sleep(Duration::from_millis(50)).await;
    }
    assert!(saw_hold, "machine never entered Hold after M0");

    // Resume — a lone `~` byte with no line framing, exactly how a real sender
    // transmits cycle-start. Regression test for a deadlock where the
    // pending-wait loop only checked whether Hold had been exited when the
    // *next* line arrived — but the client never sends a next line until this
    // M0's own ok arrives, which is exactly what that check was gating.
    writer.write_all(b"~").await.unwrap();

    // Poll until Idle is reported, tolerating (not asserting on) the exact
    // interleaving of "ok" vs status lines — a real sender ignores unsolicited
    // "ok"s the same way, so this only cares that the pause actually clears.
    // Each read_line has its own 5s timeout, so a true regression (deadlock)
    // fails the test instead of hanging the suite.
    let mut saw_idle = false;
    for _ in 0..50 {
        writer.write_all(b"?\n").await.unwrap();
        let status = read_line(&mut reader).await;
        if status.contains("Idle") {
            saw_idle = true;
            break;
        }
        sleep(Duration::from_millis(50)).await;
    }
    assert!(saw_idle, "M0 never resumed back to Idle after cycle-start");
}

/// Regression for the connection task blocking while acquiring a planner-slot permit
/// (`MovePermits`, exactly `MAX_PLANNER_SLOTS` — see motion.rs's `spawn_motion_task`).
/// Admission races far ahead of real execution — `ok` is returned when a line is
/// queued, not when it finishes — so a normal host sender saturates the permits almost
/// immediately on any run of several moves. Once saturated, the *next* line's `ok` is
/// withheld until a queued move actually completes and releases its permit; without
/// dispatch racing that block against continued socket reads, the connection couldn't
/// even read a `?` byte off the wire during that window, let alone answer it, making
/// the UI's toolhead position appear frozen for as long as the backlog took to drain.
#[tokio::test]
async fn status_query_stays_responsive_while_motion_queue_is_full() {
    // speed=1 (real-time): each 0.5mm move at F120 (2mm/s) takes ~250ms to actually
    // execute — generous relative to our own read-loop overhead below, so the test
    // isn't sensitive to scheduler jitter — and enough queued moves keep the queue
    // saturated for a couple of seconds, plenty of window to query mid-backlog.
    const PLANNER_SLOTS: usize = 15; // must match state::MAX_PLANNER_SLOTS
    const TOTAL_LINES: usize = PLANNER_SLOTS + 9;

    let (fluidnc_port, _control_port) = start_sim_with_speed(1).await;
    let (mut reader, mut writer) = connect(fluidnc_port).await;
    read_until(&mut reader, "ok").await; // greeting

    writer.write_all(b"G91\n").await.unwrap();
    read_until(&mut reader, "ok").await;

    let mut script = String::new();
    for i in 0..TOTAL_LINES {
        let dx = if i % 2 == 0 { 0.5 } else { -0.5 };
        script.push_str(&format!("G1 X{dx} F120\n"));
    }
    writer.write_all(script.as_bytes()).await.unwrap();

    // The internal motion queue holds exactly PLANNER_SLOTS slots — read exactly that
    // many oks. That's deterministic (no timing guesswork: the "ok" trickle for
    // backlogged lines runs at the same ~250ms move-completion cadence whether or not
    // this bug is fixed, so there's no reliable pause to detect — only a fixed count
    // works), and tells us for certain the (PLANNER_SLOTS+1)th+ line's ok is now gated
    // on a queued move actually completing, i.e. we're genuinely mid-backlog.
    let mut oks = 0;
    while oks < PLANNER_SLOTS {
        assert_eq!(read_line(&mut reader).await, "ok");
        oks += 1;
    }

    // Now genuinely mid-backlog: send `?` and see whether it jumps the queue or has
    // to wait for more backlogged lines to drain ahead of it first — wall-clock
    // timing alone is too easy to satisfy by luck (the remaining backlog drains in
    // well under a second either way), so the real signal is *order*.
    writer.write_all(b"?\n").await.unwrap();
    let mut oks_before_query_answered = 0;
    let status = timeout(Duration::from_secs(2), async {
        loop {
            let line = read_line(&mut reader).await;
            if line == "ok" {
                oks_before_query_answered += 1;
                continue;
            }
            if line.starts_with('<') {
                return line;
            }
        }
    })
    .await
    .expect("status query was never answered");
    assert!(
        status.contains("Run"),
        "expected machine still running: {}",
        status
    );
    assert!(
        oks_before_query_answered <= 2,
        "status query was only answered after {} more backlogged lines drained ahead of it — \
         the connection was stuck admitting queued moves instead of servicing the query promptly",
        oks_before_query_answered
    );

    // Drain remaining oks so the connection doesn't leave the machine mid-job.
    oks += oks_before_query_answered;
    while oks < TOTAL_LINES {
        if read_line(&mut reader).await == "ok" {
            oks += 1;
        }
    }
}

// 100×80 rect stock centred at (-150, -100) (the sim's initial XY position),
// top z = -10, depth 20 → XY footprint [-200,-100] × [-140,-60].
const STOCK_JSON: &str = r#"{"shape":{"type":"rect","width":100.0,"height":80.0,"rotation":0.0},"depth":20.0,"ox":-150.0,"oy":-100.0,"oz":-10.0}"#;

#[tokio::test]
async fn probe_hits_stock_and_reports_trigger_position() {
    // sim_speed = 1: PRB accuracy asserts require unscaled tick quantization.
    let (fluidnc_port, control_port) = start_sim_with_speed(1).await;
    let (mut reader, mut writer) = connect(fluidnc_port).await;
    read_until(&mut reader, "ok").await; // greeting

    control_post(control_port, "/api/stock", STOCK_JSON).await;

    // Probe down from z=5. Zero deviations → r_eff=0, trigger at centre z = stock top = -10.
    // Tick step at F600 / 100 Hz / speed 1 = 0.1 mm.
    writer.write_all(b"G38.2 Z-40 F600\n").await.unwrap();
    let lines = read_until(&mut reader, "PRB").await;
    // B2: no ok may precede the PRB report — the single ok follows it.
    assert!(
        lines.iter().all(|l| l != "ok"),
        "ok before PRB (queue-time ack): {:?}",
        lines
    );
    let prb = lines.last().unwrap();
    let (pos, success) = parse_prb(prb);
    assert!(success, "probe should trigger: {}", prb);
    assert!(
        (pos[2] - (-10.0)).abs() <= 0.11,
        "trigger z={} expected ≈ -10.0",
        pos[2]
    );
    let ok = read_line(&mut reader).await;
    assert_eq!(ok, "ok");

    // Retract with G38.5: trigger (contact loss) fires within one tick of leaving
    // the trigger plane, and must emit a PRB line (the UI wiggle retract needs it).
    writer.write_all(b"G38.5 Z5 F600\n").await.unwrap();
    let lines = read_until(&mut reader, "PRB").await;
    let (rpos, rsuccess) = parse_prb(lines.last().unwrap());
    assert!(rsuccess, "retract should report contact loss");
    assert!(
        (rpos[2] - (-10.0)).abs() <= 0.21,
        "retract z={} expected ≈ -10.0",
        rpos[2]
    );
    let ok = read_line(&mut reader).await;
    assert_eq!(ok, "ok");

    // With zMinus deviation +0.2 the trigger fires early: centre z = top + 0.2 = -9.8.
    control_post(
        control_port,
        "/api/machine/config",
        r#"{"probeDeviations":{"xPlus":0,"xMinus":0,"yPlus":0,"yMinus":0,"zMinus":0.2}}"#,
    )
    .await;
    writer.write_all(b"G38.2 Z-40 F600\n").await.unwrap();
    let lines = read_until(&mut reader, "PRB").await;
    let (dpos, dsuccess) = parse_prb(lines.last().unwrap());
    assert!(dsuccess);
    assert!(
        (dpos[2] - (-9.8)).abs() <= 0.11,
        "trigger z={} expected ≈ -9.8",
        dpos[2]
    );
    read_line(&mut reader).await;
}

#[tokio::test]
async fn probe_miss_g38_2_raises_alarm_5() {
    let (fluidnc_port, control_port) = start_sim_with_speed(10).await;
    let (mut reader, mut writer) = connect(fluidnc_port).await;
    read_until(&mut reader, "ok").await;

    control_post(control_port, "/api/stock", STOCK_JSON).await;

    // Move outside the stock XY footprint, then probe down past its top.
    writer.write_all(b"G0 X-50\n").await.unwrap();
    read_until(&mut reader, "ok").await;
    writer.write_all(b"G38.2 Z-20 F600\n").await.unwrap();
    // FluidNC order on a G38.2 miss: ALARM:5, then [PRB:...:0], then the line's ok.
    let lines = read_until(&mut reader, "PRB").await;
    assert!(
        lines.iter().any(|l| l.contains("ALARM:5")),
        "expected ALARM:5 before PRB: {:?}",
        lines
    );
    let (_pos, success) = parse_prb(lines.last().unwrap());
    assert!(!success, "probe should miss: {:?}", lines);
    let ok = read_line(&mut reader).await;
    assert_eq!(ok, "ok", "line must still be acked after the alarm");

    // Machine is locked in Alarm until $X.
    writer.write_all(b"?\n").await.unwrap();
    let status = read_line(&mut reader).await;
    assert!(status.contains("Alarm"), "status: {}", status);
    writer.write_all(b"$X\n").await.unwrap();
    read_until(&mut reader, "ok").await;
}

#[tokio::test]
async fn probe_miss_g38_3_reports_prb_and_ok() {
    let (fluidnc_port, control_port) = start_sim_with_speed(10).await;
    let (mut reader, mut writer) = connect(fluidnc_port).await;
    read_until(&mut reader, "ok").await;

    control_post(control_port, "/api/stock", STOCK_JSON).await;

    writer.write_all(b"G0 X-50\n").await.unwrap();
    read_until(&mut reader, "ok").await;
    // G38.3: a miss is not an error — [PRB:...:0] + ok, machine stays operational.
    writer.write_all(b"G38.3 Z-20 F600\n").await.unwrap();
    let lines = read_until(&mut reader, "PRB").await;
    assert!(
        lines
            .iter()
            .all(|l| !l.contains("ALARM") && !l.contains("error")),
        "no alarm/error expected: {:?}",
        lines
    );
    let (pos, success) = parse_prb(lines.last().unwrap());
    assert!(!success, "probe should miss: {:?}", lines);
    // Full travel: absolute target z = -20 reached without contact.
    assert!((pos[2] - (-20.0)).abs() < 0.01, "z={}", pos[2]);
    let ok = read_line(&mut reader).await;
    assert_eq!(ok, "ok");

    writer.write_all(b"?\n").await.unwrap();
    let status = read_line(&mut reader).await;
    assert!(status.contains("Idle"), "status: {}", status);
}

/// Regression for the wiggle-probe failure: the exact sequence the UI's single-edge
/// Z-down probe sends, written in one burst. Verifies (a) every line is acked exactly
/// once (lines deferred during a blocking probe are executed, not dropped), (b) all six
/// probes report contact near the trigger plane (relative targets chain off the actual
/// contact position, not the never-reached full-travel target), and (c) the final
/// `G91 G0 Z5` backoff ends ~5 mm above the contact plane at rapid rate.
#[tokio::test]
async fn wiggle_probe_sequence_acks_every_line_and_backs_off_upward() {
    let (fluidnc_port, control_port) = start_sim_with_speed(10).await;
    let (mut reader, mut writer) = connect(fluidnc_port).await;
    read_until(&mut reader, "ok").await;

    control_post(control_port, "/api/stock", STOCK_JSON).await;

    // Machine starts at z=5; stock top -10, zero deviations → trigger plane z ≈ -10.
    let script = "G90\nG21\nG91\nG38.3 F500 Z-20.0000\nG90\nG91\nG38.5 F401 Z4.0100\nG90\n\
                  G91\nG38.3 F302 Z-4.6115\nG90\nG91\nG38.5 F203 Z2.0300\nG90\n\
                  G91\nG38.3 F104 Z-2.3345\nG90\nG91\nG38.5 F5 Z0.3000\nG90\n\
                  G91\nG0 Z5\nG90\n";
    let n_lines = script.trim_end().lines().count();
    writer.write_all(script.as_bytes()).await.unwrap();

    let mut oks = 0;
    let mut prbs = Vec::new();
    while oks < n_lines {
        let line = read_line(&mut reader).await;
        if line == "ok" {
            oks += 1;
        } else if line.starts_with("[PRB:") {
            prbs.push(parse_prb(&line));
        } else {
            panic!("unexpected response: {}", line);
        }
    }

    assert_eq!(prbs.len(), 6, "one PRB per G38 line: {:?}", prbs);
    for (pos, success) in &prbs {
        assert!(success, "every probe should trigger: {:?}", prbs);
        assert!(
            (-11.0..=-9.0).contains(&pos[2]),
            "contact z={} not near trigger plane -10",
            pos[2]
        );
    }

    // Backoff ran upward from the contact position at rapid rate — poll briefly
    // in case the G0 is still finishing.
    let mut final_z = f64::NAN;
    for _ in 0..30 {
        writer.write_all(b"?\n").await.unwrap();
        let status = read_line(&mut reader).await;
        let mpos = status
            .split("MPos:")
            .nth(1)
            .unwrap()
            .split('|')
            .next()
            .unwrap();
        final_z = mpos.split(',').nth(2).unwrap().parse().unwrap();
        if status.contains("Idle") {
            break;
        }
        sleep(Duration::from_millis(100)).await;
    }
    assert!(
        (-6.5..=-3.5).contains(&final_z),
        "final z={} — expected ≈ contact + 5",
        final_z
    );

    // The deferred G90s actually executed: modal state is absolute again.
    writer.write_all(b"$G\n").await.unwrap();
    let lines = read_until(&mut reader, "ok").await;
    let gc = lines.join(" ");
    assert!(gc.contains("G90"), "modal state: {}", gc);
}
