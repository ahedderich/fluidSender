# FluidSender

A modern, web-based GCode sender built specifically for [FluidNC](https://github.com/bdring/FluidNC) ESP32 CNC firmware.

FluidSender is a native FluidNC client — not a generic GRBL sender. It implements the full FluidNC feature set including firmware configuration, real-time machine control, probing macros, and more. It ships with a built-in Rust-based FluidNC simulator for safe, offline development and testing.

---

## Features

- **Multi-machine management** — configure, switch, and monitor multiple FluidNC machines from a single interface
- **USB & TCP/WiFi connectivity** — USB serial (recommended) and TCP/WiFi with clear warnings when running over WiFi
- **3D toolpath preview** — interactive toolpath visualization with webcam overlay support
- **GCode file management** — upload, browse, and queue GCode jobs with real-time progress tracking
- **Probing wizards** — guided workflows for edge finding, corner/center probing, and surface heightmap generation
- **Tool & magazine management** — tool library with active tool tracking and load/unload workflow
- **Spindle & coolant control** — full spindle (router/laser) and coolant (mist/flood) control with live overrides
- **Configurable macros** — one-click macro buttons sourced from machine config or defined by the user
- **Built-in terminal** — raw console access to the FluidNC serial stream
- **FluidNC simulator** — Rust-based firmware emulator with configurable machine, stock, and failure modes
- **Light/dark theme** — toggleable system-aware theming
- **Optional authentication** — protect the UI with a username/password when needed
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
