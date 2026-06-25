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

/// Start the simulator in the background and return the FluidNC TCP port.
async fn start_sim() -> u16 {
    let (fluidnc_port, control_port) = alloc_ports();

    let cfg = fluidsim::config::Config {
        server: fluidsim::config::ServerConfig {
            fluidnc_port,
            control_port,
        },
        machine: fluidsim::config::MachineConfig::default(),
        probe: fluidsim::config::ProbeConfig::default(),
        sim: fluidsim::config::SimConfig { speed: 10, tick_hz: 100 },
    };

    let travel = [300.0, 200.0, 80.0, 360.0, 360.0, 360.0];
    let state = fluidsim::machine::state::MachineState::new(
        cfg.machine.axis_count,
        travel,
        cfg.probe.tip_diameter,
        cfg.sim.speed,
    );

    use std::sync::Arc;
    use tokio::sync::RwLock;

    let (shared, broadcast) = fluidsim::machine::state::new_shared(state);
    let stock = Arc::new(RwLock::new(None));
    let move_tx = fluidsim::machine::motion::spawn_motion_task(
        Arc::clone(&shared),
        broadcast.clone(),
        cfg.sim.tick_hz,
    );

    let app_state = fluidsim::server::control::AppState {
        machine: Arc::clone(&shared),
        broadcast: broadcast.clone(),
        stock,
    };

    tokio::spawn(fluidsim::server::fluidnc::run(
        fluidnc_port,
        Arc::clone(&shared),
        broadcast.clone(),
        move_tx,
    ));
    tokio::spawn(fluidsim::server::control::run(control_port, app_state));

    // Give servers time to bind
    sleep(Duration::from_millis(100)).await;
    fluidnc_port
}

async fn connect(port: u16) -> (
    BufReader<tokio::net::tcp::OwnedReadHalf>,
    tokio::net::tcp::OwnedWriteHalf,
) {
    let stream = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let (r, w) = stream.into_split();
    (BufReader::new(r), w)
}

async fn read_line(reader: &mut BufReader<tokio::net::tcp::OwnedReadHalf>) -> String {
    let mut line = String::new();
    timeout(Duration::from_secs(5), reader.read_line(&mut line))
        .await
        .expect("read timeout")
        .expect("read error");
    line.trim_end_matches("\r\n").trim_end_matches('\n').to_string()
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
        if found { break; }
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
    assert!(status.contains("MPos:0.000,0.000,0.000"), "after home: {}", status);
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

    // Move to X50 Y50
    writer.write_all(b"G0 X50 Y50\n").await.unwrap();
    read_until(&mut reader, "ok").await;

    // Poll until position reaches target (motion is async)
    for _ in 0..50 {
        writer.write_all(b"?\n").await.unwrap();
        let status = read_line(&mut reader).await;
        if status.contains("MPos:50.000,50.000") {
            return;
        }
        sleep(Duration::from_millis(100)).await;
    }
    // Final check
    writer.write_all(b"?\n").await.unwrap();
    let status = read_line(&mut reader).await;
    assert!(status.contains("MPos:50.000,50.000"), "final status: {}", status);
}
