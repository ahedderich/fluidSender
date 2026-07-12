use clap::Parser;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::info;
use tracing_subscriber::EnvFilter;

use fluidsim::config::Config;
use fluidsim::machine::motion::spawn_motion_task;
use fluidsim::machine::state::{new_console, new_shared, MachineState};
use fluidsim::server::control::{run as run_control, AppState};
use fluidsim::server::fluidnc::run as run_fluidnc;

#[derive(Parser)]
#[command(name = "fluidsim", about = "FluidNC firmware simulator")]
struct Cli {
    #[arg(short, long, default_value = "config.yaml")]
    config: PathBuf,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("fluidsim=info".parse().unwrap())
                .add_directive("tower_http=debug".parse().unwrap()),
        )
        .init();

    let cli = Cli::parse();
    let cfg = Config::load(&cli.config).unwrap_or_else(|e| {
        tracing::warn!(
            "Could not load {}: {} — using defaults",
            cli.config.display(),
            e
        );
        Config::default()
    });

    info!("FluidNC Simulator starting");
    info!("  FluidNC TCP port : {}", cfg.server.fluidnc_port);
    info!("  Control API port : {}", cfg.server.control_port);
    info!("  Axis count       : {}", cfg.machine.axis_count);

    let travel = [
        cfg.machine.travel.x,
        cfg.machine.travel.y,
        cfg.machine.travel.z,
        cfg.machine.travel.a,
        cfg.machine.travel.b,
        cfg.machine.travel.c,
    ];

    let mut state = MachineState::new(
        cfg.machine.axis_count,
        travel,
        cfg.probe.deviations.clone(),
        cfg.sim.speed,
    );
    state.max_rate = [
        cfg.machine.max_rate.x,
        cfg.machine.max_rate.y,
        cfg.machine.max_rate.z,
        cfg.machine.max_rate.a,
        cfg.machine.max_rate.b,
        cfg.machine.max_rate.c,
    ];
    state.acceleration = [
        cfg.machine.acceleration.x,
        cfg.machine.acceleration.y,
        cfg.machine.acceleration.z,
        cfg.machine.acceleration.a,
        cfg.machine.acceleration.b,
        cfg.machine.acceleration.c,
    ];
    state.steps_per_mm = [
        cfg.machine.steps_per_mm.x,
        cfg.machine.steps_per_mm.y,
        cfg.machine.steps_per_mm.z,
        cfg.machine.steps_per_mm.a,
        cfg.machine.steps_per_mm.b,
        cfg.machine.steps_per_mm.c,
    ];

    let (shared, broadcast) = new_shared(state);
    let console = new_console();

    let move_tx = spawn_motion_task(Arc::clone(&shared), broadcast.clone(), cfg.sim.tick_hz);

    let app_state = AppState {
        machine: Arc::clone(&shared),
        broadcast: broadcast.clone(),
        console: console.clone(),
    };

    let fluidnc_port = cfg.server.fluidnc_port;
    let control_port = cfg.server.control_port;

    let fluidnc_handle = tokio::spawn(run_fluidnc(
        fluidnc_port,
        Arc::clone(&shared),
        broadcast.clone(),
        console.clone(),
        move_tx,
    ));

    let control_handle = tokio::spawn(run_control(control_port, app_state));

    tokio::select! {
        _ = fluidnc_handle => tracing::error!("FluidNC server exited"),
        _ = control_handle => tracing::error!("Control API exited"),
    }
}
