mod config;
mod machine;
mod protocol;
mod server;

use clap::Parser;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use tracing_subscriber::EnvFilter;

use config::Config;
use machine::motion::spawn_motion_task;
use machine::state::{MachineState, new_shared};
use server::control::{AppState, run as run_control};
use server::fluidnc::run as run_fluidnc;

#[derive(Parser)]
#[command(name = "fluidsim", about = "FluidNC firmware simulator")]
struct Cli {
    #[arg(short, long, default_value = "config.yaml")]
    config: PathBuf,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("fluidsim=info".parse().unwrap()))
        .init();

    let cli = Cli::parse();
    let cfg = Config::load(&cli.config).unwrap_or_else(|e| {
        tracing::warn!("Could not load {}: {} — using defaults", cli.config.display(), e);
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

    let state = MachineState::new(
        cfg.machine.axis_count,
        travel,
        cfg.probe.tip_diameter,
        cfg.sim.speed,
    );

    let (shared, broadcast) = new_shared(state);
    let stock = Arc::new(RwLock::new(None));

    let move_tx = spawn_motion_task(
        Arc::clone(&shared),
        broadcast.clone(),
        cfg.sim.tick_hz,
    );

    let app_state = AppState {
        machine: Arc::clone(&shared),
        broadcast: broadcast.clone(),
        stock: Arc::clone(&stock),
    };

    let fluidnc_port = cfg.server.fluidnc_port;
    let control_port = cfg.server.control_port;

    let fluidnc_handle = tokio::spawn(run_fluidnc(
        fluidnc_port,
        Arc::clone(&shared),
        broadcast.clone(),
        move_tx,
    ));

    let control_handle = tokio::spawn(run_control(control_port, app_state));

    tokio::select! {
        _ = fluidnc_handle => tracing::error!("FluidNC server exited"),
        _ = control_handle => tracing::error!("Control API exited"),
    }
}
