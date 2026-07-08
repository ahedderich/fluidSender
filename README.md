# FluidSender

A modern, web-based GCode sender built specifically for [FluidNC](https://github.com/bdring/FluidNC) ESP32 CNC firmware.

FluidSender is a native FluidNC client — not a generic GRBL sender. It implements the full FluidNC feature set including firmware configuration, real-time machine control, probing macros, and more. It ships with a built-in Rust-based FluidNC simulator for safe, offline development and testing.

---

## Features

- **Multi-machine management** — configure, switch, and monitor multiple FluidNC machines from a single interface
- **USB & TCP/WiFi connectivity** — USB serial (recommended) and TCP/WiFi with clear warnings when running over WiFi
- **3D toolpath preview** — interactive toolpath visualization with webcam overlay support
- **GCode file management** — upload, browse, and queue GCode jobs with real-time progress tracking
- **Planner-buffer-aware job execution** — tracks sent vs. confirmed-executed line counts separately using FluidNC's `Bf:` field; keeps a configurable number of motion commands in the firmware planner so the machine never stalls waiting for the sender, while execution progress reflects lines that have physically left the planner — not just lines dispatched over the wire
- **Job crash recovery** (hopefully never needed) — checkpoints job progress every 50 lines; if the connection drops mid-job, the server detects the interruption on reconnect and offers to resume from a safe lookback point, replaying modal state (units, WCS, spindle, coolant) and positioning the tool before re-entering the cut
- **Probing wizards** — guided workflows for edge finding, corner/center probing, and surface heightmap generation
- **Tool & magazine management** — tool library with active tool tracking and load/unload workflow
- **Spindle & coolant control** — full spindle (router/laser) and coolant (mist/flood) control with live overrides
- **Configurable macros** — one-click macro buttons sourced from machine config or defined by the user
- **Built-in terminal** — raw console access to the FluidNC serial stream
- **FluidNC simulator** — Rust-based firmware emulator with configurable machine, stock, and failure modes
- **Light/dark theme** — toggleable system-aware theming
- **Optional authentication** — protect the UI with a username/password when needed
- **Role-based access** — Viewer, Operator, and Admin roles granting different levels of access
- **Multi-user/session state sync** — every connected browser shows the same state, dialogs, and selections where it matters, kept in sync in real time by the server
- **Fully containerized** — single `docker-compose.yaml` for production deployment

---

## Architecture

```
Browser
  └─► Nuxt 3 App  (HTTP + WebSocket)
        └─► Nuxt Server Routes  (Bun)
              ├─► USB Serial ──► FluidNC ESP32   (recommended)
              └─► TCP/WiFi  ──► FluidNC ESP32   (optional)

fluid-sim/sim  (Rust TCP server)
  └─► fluid-sim/sim-ui  (Nuxt 3 + Bun)
```

The serial/TCP bridge runs entirely within the Nuxt server process — no separate backend service is needed. The FluidNC simulator exposes the same TCP protocol as real hardware, making it a drop-in target for development.

---

## Project Structure

```
/
├── docker-compose.yaml        # Development — full stack (ui + sim + sim-ui)
├── ui/                        # Main web application
│   ├── Dockerfile             # Dev image
│   ├── Dockerfile.prd         # Production image (multi-stage)
│   ├── docker-compose.yaml    # Production deployment example
│   ├── config/                # Persistent config (mounted volume)
│   └── data/                  # GCode files, job history, logs (mounted volume)
├── fluid-sim/
│   ├── sim/                   # Rust FluidNC simulator
│   │   └── Dockerfile
│   └── sim-ui/                # Simulator control UI
│       └── Dockerfile
└── .github/workflows/         # CI/CD pipelines
```

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)

### Development

Start the full stack from the repository root:

```bash
docker compose up
```

| Service | URL |
|---------|-----|
| UI | http://localhost:3000 |
| Simulator TCP | localhost:8765 |
| Simulator UI | http://localhost:3001 |

Source directories are mounted into the containers as host volumes — edits are reflected immediately without rebuilding. All `bun` and `cargo` commands run inside the containers; no local Bun or Rust installation is needed.

### Production

Copy `ui/docker-compose.yaml` to your deployment directory and adjust as needed:

```bash
mkdir -p ~/fluidsender/config ~/fluidsender/data
cp ui/docker-compose.yaml ~/fluidsender/
cd ~/fluidsender
docker compose up -d
```

The UI is available at `http://localhost:3000`. Config and data are persisted in `./config` and `./data`.

---

## Configuration

On first run, `config/app.yaml` is created with defaults. Key options:

```yaml
# Connection
connection:
  preferred: usb          # usb | tcp

# Authentication (disabled by default)
auth:
  enabled: false
  # username: admin
  # password_hash: <bcrypt hash>

# Server
server:
  port: 3000
```

See `config/app.yaml.example` for all available options.

---

## Simulator

The FluidNC simulator (`fluid-sim/sim`) is a Rust implementation of the FluidNC firmware protocol. Use it to develop and test without physical hardware.

Features:
- Full GCode interpreter matching FluidNC behaviour
- 3-axis (X/Y/Z) + optional rotary axes (A/B/C)
- Configurable machine dimensions and feed rates
- Stock definition: rectangular or round, with size and rotation
- Touch probe simulation with configurable tip diameter (half-diameter offset applied automatically for edge detection)
- Manual trigger of door sensor, hard stops, alarms, and failure modes
- Near-realtime jog simulation
- Reset to defined home position

Connect the main UI to the simulator by setting the connection type to TCP and pointing it at `localhost:<sim-port>`.

---

## Development Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Initial scaffolding | Complete |
| 2 | UI design mockups | Complete |
| 3 | Rust simulator implementation | Planned |
| 4 | Release cycle & versioning | Planned |
| 5 | Functional UI development | Planned |

See [CLAUDE.md](CLAUDE.md) for detailed phase specifications.

---

## GRBL Compatibility

FluidSender is purpose-built for FluidNC and there are no current plans to pursue broader GRBL-family compatibility.

The original [grbl](https://github.com/gnea/grbl) project is discontinued (no commits since August 2019); its own wiki points to [grblHAL](https://github.com/grblHAL), [µCNC](https://github.com/Paciente8159/uCNC), [FluidNC](https://github.com/bdring/FluidNC), and [RabbitGRBL](https://github.com/SourceRabbit/RabbitGRBL) as the active successor projects. FluidSender's job execution engine tracks planner state via the GRBL v1.1 `Bf:` status field (planner-free / RX-free block counts) to determine which commands have physically left the planner, not merely which lines have been sent — this is what backs crash detection and pause/resume recovery. That mechanism is inherited GRBL v1.1 protocol, not a FluidNC-specific feature: grblHAL reports an identical `Bf:` field under the same `$10` status-mask bit, and µCNC reports the equivalent data under a `Buf:` field name. So the buffer-tracking approach itself is likely portable to other GRBL-successor firmware with modest changes, not a fundamental blocker.

The real blocker is firmware configuration handling. FluidSender's settings UI reads and writes FluidNC's hierarchical `$Config` YAML document as a single structured payload. None of the other successor projects expose an equivalent: grblHAL's closest analog (`$EG`/`$ESG`/`$ESH`) is a hierarchical *enumeration* delivered as many flat, prefixed lines that would need to be reassembled into a tree client-side, and µCNC/RabbitGRBL expose only flat, numbered `$`-style settings with no structured readback at all. Supporting any of them would mean a genuinely different settings data model, not just a parser tweak.

None of this has been tested against real hardware other than FluidNC. It's plausible that core connectivity, jogging, and job execution would work against grblHAL or µCNC with limited changes — but until it's actually tried on real hardware, that's an informed guess, not a claim of compatibility.

---

## Roadmap

Planned features and areas of future development, roughly in order of priority:

- **Stock definition via STEP file** — import a STEP model as the stock definition instead of defining a simple rectangular or round shape manually
- **Extended probing wizards** — guided probing workflows for more complex stock geometry, building on the existing edge-finding and corner-probing primitives
- **Firmware update check** — automatic check for newer FluidNC firmware releases on connect, with a visible indicator when an update is available
- **Firmware OTA update** — over-the-air firmware flashing via the FluidNC web server upload mechanism (or the web UI routes), similar to what the FluidNC web UI already supports — requires coordination with bdring before implementation
- **3+1 and 5-axis extended support** — dedicated probing wizards and extended testing for machines with rotary axes; blocked on upgrading personal hardware first

---

## ATC Support

FluidSender includes an ATC (Automatic Tool Changer) mode with magazine slot management, tool-aware job execution, and toolsetter-based length probing. However, I do not personally own an ATC spindle, so all ATC-specific features have been developed and tested in simulation only.

My personal toolchange setup uses the **manual with toolsetter** strategy on physical hardware. I hope to upgrade at some point, but until then, ATC mode remains simulation-tested only.

If you have an ATC-equipped machine and run into issues, have recommendations, or want to request a specific feature, please open an issue on this repository.

---

## Disclaimer

Use FluidSender at your own risk. No liability is accepted for any damage to hardware, workpieces, or property, or for any injuries that may result from its use. This applies especially to non-stable or pre-release versions and to any features marked as experimental.

CNC machines are powerful and potentially dangerous. Always apply appropriate safety measures, keep the emergency stop within reach, and verify machine behaviour in a safe context before running unattended or in production.

---

## Contributing

1. Check [CLAUDE.md](CLAUDE.md) for architecture decisions and coding conventions.
2. New features are developed on `test/feature-xyz` branches cut from `test`.
3. PRs require at least one approving review and green CI.
4. Commit messages use the imperative mood: "Add jog panel", not "Added jog panel".
5. Keep PRs small and focused — one logical change per PR.

For bug reports and feature requests, open a GitHub Issue.

---

## Security

CNC machines are physical hardware — please read the [Security Policy](SECURITY.md) before exposing FluidSender to a network. To report a vulnerability, see [SECURITY.md](SECURITY.md).

---

## License

MIT — see [LICENSE](LICENSE).
