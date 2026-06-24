# FluidSender — Web-based GCode Sender for FluidNC

## Project Overview

FluidSender is a modern, web-based GCode sender designed specifically for [FluidNC](https://github.com/bdring/FluidNC) (ESP32-based CNC firmware). It is a first-class FluidNC client — no GRBL compatibility layer is needed or targeted. It implements all FluidNC-specific features including firmware configuration, restart, and real-time machine control.

Alternative projects this replaces: CNCjs, gSender, etc.

---

## Repository Structure

```
/
├── ui/                        # Main web application (Nuxt + Bun)
│   ├── config/                # Persistent config volume (mounted empty, auto-populated)
│   ├── data/                  # Persistent data volume (GCode files, logs, user data)
│   ├── docker-compose.yaml    # Production deployment example
│   └── ...
├── fluid-sim/                 # FluidNC simulator
│   ├── sim/                   # Rust firmware simulator
│   └── sim-ui/                # Bun + Nuxt simulator control UI
├── .github/
│   └── workflows/             # GitHub Actions CI/CD pipelines
└── CLAUDE.md
```

---

## Technology Stack

### UI (`ui/`)
- **Runtime / package manager / bundler:** Bun (latest stable)
- **Framework:** Nuxt 3 (latest stable) with Vue 3 Composition API (`<script setup>`)
- **Language:** TypeScript (`strict: true`)
- **Styling:** Tailwind CSS — light/dark theme support via Tailwind's `darkMode: 'class'`
- **State:** Pinia
- **Routing:** Nuxt file-based routing (built-in Vue Router)
- **Serial/TCP bridge:** Nuxt server routes + WebSocket (H3/`crossws`) — runs server-side within the same Nuxt process; no separate backend service
- **Linting / formatting:** ESLint (`@nuxt/eslint`) + Prettier
- **Tests:** Vitest + Vue Testing Library

### Simulator (`fluid-sim/sim/`)
- **Language:** Rust (latest stable toolchain via `rustup`)
- **Communication:** TCP server (FluidNC WebSocket/serial protocol emulation)
- **Machine support:** 3-axis (X/Y/Z) + optional rotary axes (A/B/C)

### Simulator UI (`fluid-sim/sim-ui/`)
- **Runtime / package manager:** Bun (latest stable)
- **Framework:** Nuxt 3 + Vue 3 Composition API
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Tests:** Vitest

---

## Architecture

### Connectivity

```
Browser
  └─► Nuxt App (HTTP + WebSocket)
        └─► Nuxt Server Routes
              ├─► USB Serial  ──► FluidNC ESP32 (recommended: always use USB for stability)
              └─► TCP/WiFi    ──► FluidNC ESP32 (optional, less stable)
```

- USB is the primary and recommended connection method.
- TCP/WiFi is an optional alternative; the UI must display a clear warning when the TCP mode is active.
- The serial/TCP bridge is implemented entirely within Nuxt server routes using Bun's native serial and net APIs; no separate service is needed.

### Volumes (Docker)

| Mount path in container | Purpose |
|---|---|
| `/app/config` | Persistent configuration (YAML). Auto-populated with defaults on first run. |
| `/app/data` | User data: uploaded GCode files, job history, logs. |

### Authentication

Authentication is **optional** and controlled by a config flag (`auth.enabled` in `config/app.yaml`). When disabled, the app operates on a local-network trust model. When enabled, a username/password credential is required (bcrypt-hashed, stored in `config/app.yaml`). Authentication must be disabled by default in the scaffold; the `docker-compose.yaml` example must document how to enable it.

### Simulator (`fluid-sim/sim/`)

- Rust binary exposing a TCP server on a configurable port.
- Emulates FluidNC firmware behaviour: GCode parsing, machine state, alarms, feed hold, door sensor, touch probe, hard stops, and failure modes.
- Machine configuration (dimensions, axis count, feed rates, probe tip diameter) is loaded from a YAML/TOML config file; it can also be updated at runtime via the sim-ui.
- Stock definition: rectangular or round, with configurable size and rotation value.
- Probe tip: configurable tip diameter; half-diameter offset is automatically applied during edge-detection probing commands.
- Jogging is simulated near-realtime (configurable speed multiplier).
- All hard stops, alarm states, and failure modes must be triggerable manually from the sim-ui.

---

## Container / Deployment

- All components are fully containerized.
- `ui/docker-compose.yaml` is the canonical production deployment example.
- Container images are published to **GitHub Container Registry** (`ghcr.io`).
- Images are versioned with **SemVer** (`MAJOR.MINOR.PATCH`).
- Image tags: `ghcr.io/<org>/fluidsender-ui:<semver>`, `ghcr.io/<org>/fluidsender-sim:<semver>`, `ghcr.io/<org>/fluidsender-sim-ui:<semver>`.
- Scan every image with Trivy before release (see org policy). CRITICAL/HIGH CVEs must be resolved before merging.

---

## Git Branching Strategy

```
main               ← current production release candidate
test               ← quality testing stage; features merged here before main
test/feature-xyz   ← individual feature branches, always cut from `test`
test/bugfix-xyz    ← bug fix branches, cut from `test` (normal release cycle)
main/hotfix-xyz    ← urgent post-release fixes, cut from `main`
```

**Rules:**
- Before starting any file changes on a new feature, Claude must prompt the user with a question to create a new `test/feature-xyz` branch.
- PRs into `test` require at least one approving review and green CI.
- PRs into `main` require green CI + passing integration tests.
- Delete feature/bugfix branches after merging.
- SemVer tagging and container image publishing begin at the **Release Cycle** phase (Phase 4).
- In Phases 1–3, the version scheme does not need to be followed strictly.

---

## CI/CD (GitHub Actions)

Pipelines live in `.github/workflows/`. Minimum required workflows:

| Workflow | Trigger | Steps |
|---|---|---|
| `ci-ui.yaml` | PR to `test` or `main` | Lint → Type-check → Unit tests → Build |
| `ci-sim.yaml` | PR to `test` or `main` | `cargo fmt --check` → `cargo clippy` → `cargo test` |
| `ci-sim-ui.yaml` | PR to `test` or `main` | Lint → Type-check → Unit tests → Build |
| `release.yaml` | Push tag `v*.*.*` to `main` | Build all images → Trivy scan → Push to ghcr.io → Create GitHub Release |

---

## Security Guidelines

- No credentials, tokens, or secrets in source code. Use environment variables or the config volume.
- Never commit `.env` files with real secrets; provide `.env.example` templates only.
- All config secrets (hashed passwords, API tokens) live in the `config/` volume — never in the image.
- USB serial and TCP connections must enforce input validation; raw bytes from the controller must never be interpolated into shell commands or SQL.
- HTTP security headers (`CSP`, `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`) must be set in the Nuxt server middleware.
- Scan images with Trivy (`trivy image --exit-code 1 --severity CRITICAL,HIGH`) in the release workflow.

---

## Development Phases

### Phase 1 — Initial Scaffolding `[x]`
- Repository structure, `.gitignore`, `CLAUDE.md`
- Nuxt 3 + Bun scaffold in `ui/` with Tailwind, Pinia, TypeScript, ESLint, Prettier, Vitest
- Nuxt scaffold in `fluid-sim/sim-ui/` with same stack
- Rust workspace init in `fluid-sim/sim/`
- `ui/docker-compose.yaml` skeleton (volumes, ports, env vars documented)
- GitHub Actions CI skeleton (lint + type-check only)
- `config/` and `data/` volume structure defined with example files

### Phase 2 — UI Design Mockups `[ ]`
- Static Vue mockup of main `ui/` interface: connection panel, GCode file manager, jog controls, terminal/console, machine status, config editor
- Static Vue mockup of `fluid-sim/sim-ui/`: machine state viewer, dimension configurator, sensor triggers, stock definition, probe tip config, reset controls
- Light/dark theme implemented and togglable in both UIs
- No real serial/TCP logic yet; all data is mocked

### Phase 3 — Rust Simulator Implementation `[ ]`
- Full GCode interpreter matching FluidNC command set
- TCP server exposing FluidNC WebSocket/serial protocol
- Simulated machine state machine: idle, run, hold, alarm, homing
- Hard stops, door sensor, touch probe, failure mode simulation
- Stock definition (rectangular / round, size, rotation)
- Probe tip diameter config + half-tip offset calculation for edge detection
- Near-realtime jog simulation
- Unit tests for all GCode handling and state transitions
- sim-ui wired to live simulator TCP connection (replaces mockups from Phase 2)

### Phase 4 — Release Cycle & Versioning `[ ]`
- SemVer versioning applied; initial release `v0.1.0`
- `release.yaml` GitHub Actions workflow: build → Trivy scan → push to ghcr.io → GitHub Release
- `ui/docker-compose.yaml` finalized with versioned image tags
- Branch protection rules on `main` and `test`
- CHANGELOG introduced

### Phase 5 — Functional UI Development `[ ]`
- Nuxt server routes: USB serial bridge (WebSerial via Bun serialport) + TCP/WiFi bridge
- Real-time WebSocket stream from server routes to browser
- FluidNC-specific features: firmware config read/write, soft-reset, unlock, homing, probing macros
- GCode file upload, queue management, job execution with progress tracking
- Replace all Phase 2 UI mockups with live-wired components
- Full Vitest unit test suite for components and composables
- Integration tests for serial/TCP bridge (using the Rust simulator as the target)

---

## Development Conventions

- **Library versions:** Always select the latest stable version. Check npm/crates.io release dates before pinning.
- **Vue:** Composition API (`<script setup>`) only. Options API is not permitted for new code.
- **Comments:** Only when the *why* is non-obvious. No docblocks or what-comments.
- **PRs:** Small and focused. One logical change per PR. Imperative commit messages ("Add jog panel", not "Added jog panel").
- **Commits:** Never add a `Co-Authored-By` trailer or any Claude/AI attribution to commit messages.
- **Tests:** ≥ 80 % coverage on business logic. Simulator Rust code: `cargo test` must pass before any PR merge.
