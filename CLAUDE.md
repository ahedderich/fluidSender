# FluidSender — Web-based GCode Sender for FluidNC

## Project Overview

FluidSender is a modern, web-based GCode sender designed specifically for [FluidNC](https://github.com/bdring/FluidNC) (ESP32-based CNC firmware). It is a first-class FluidNC client — no GRBL compatibility layer is needed or targeted. It implements all FluidNC-specific features including firmware configuration, restart, and real-time machine control.

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
├── FluidNC/                   # FluidNC firmware reference (gitignored — clone locally)
├── .github/
│   └── workflows/             # GitHub Actions CI/CD pipelines
└── CLAUDE.md
```

### Reference Repositories

The following repos are cloned locally for firmware/protocol research and **must not be committed** (they are gitignored). Clone them manually if needed:

```bash
git clone https://github.com/bdring/FluidNC FluidNC/
```

**When to consult these references:**
- Before classifying any GCode command as planner-buffered vs. immediate-execution — verify against `FluidNC/FluidNC/src/` source code (specifically `GCode.cpp`, `Motion/Planner.cpp`, `Protocol.cpp`)
- Before assuming `ok` ack behaviour for any command type — FluidNC sends `ok` for every non-empty, non-comment line; blank and comment-only lines are silently dropped without an ack
- When updating `fluid-sim/sim/` — the sim **must match FluidNC's exact ack and planner-buffer behaviour** for all command types; divergence here will corrupt the send loop's `execPtr` tracking

**Key FluidNC behaviours to keep in sync with the sim:**
- **Category A — Planner-buffered** (reduce `Bf:` free count; `ok` sent immediately when queued): `G0`, `G1`, `G2`, `G3`, `G28`, `G30`, `$J=` (jog). G2/G3 arcs generate many planner blocks per command.
- **Category B1 — Drain-only blocking** (`ok` delayed until planner drains, then hardware is applied): `M3`/`M4`/`M5` (spindle), `M7`/`M8`/`M9` (coolant), `M6` (tool change), `G10` (WCS offset), `G54`–`G59` (WCS select), `G92`/`G92.1` (G92 offset), `M2`/`M30` (program end) — all call `protocol_buffer_synchronize()` before applying due to `FORCE_BUFFER_SYNC_DURING_WCO_CHANGE`/`FORCE_BUFFER_SYNC_DURING_NVS_WRITE` flags or spindle/coolant safety; the sim currently applies these immediately (a known divergence)
- **Category B2 — Extended-blocking** (`ok` arrives only after the full operation completes, which can take seconds to minutes): `G4 Pn` dwell — drains planner then blocks for the full dwell time; `G38.2`/`G38.3`/`G38.4`/`G38.5` probe — drains planner then blocks in a loop until machine is Idle (probe touch or end of travel); `M0` pause — drains planner then blocks until cycle-start (`~`) is issued; `$H`/`$HX`–`$HC` homing — blocks until all homing cycles complete
- **Category C — Immediate** (do NOT touch the planner; `ok` sent right away): standalone `F` word, standalone `T` word, modal-only lines (G17/G18/G19, G20/G21, G40, G80, G90/G91, G91.1, G93/G94, G61, G43.1, G49, M1); standalone `S` word **only when spindle is OFF** — if spindle is currently ON, an `S` word calls `protocol_buffer_synchronize()` first and behaves as B1
- **Status field name**: FluidNC firmware emits `Bf:plannerFree,rxFree` (not `Buf:`); the status parser accepts both for compatibility
- `ok` is sent for every line that reaches the GCode parser; blank lines and comment-only lines (`;` or `(...)`) hit the fast path in `execute_line()` and also generate an `ok` without touching the planner

---

## Technology Stack

### UI (`ui/`)
- **Runtime / package manager / bundler:** Bun (latest stable) — **except the dev server, which runs under Node** because Bun's runtime breaks Nitro/crossws WebSocket upgrades in dev (see [State Sync Protocol](#state-sync-protocol-websocket)). Bun still handles `install`/`build`/production.
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

### State Authority Model

**This is a hard architectural rule — never violate it:**

| Layer | Authoritative For | How |
|---|---|---|
| **FluidNC firmware** | All machine state: position, status, alarms, limit switches, firmware config | Polled via `?` (status) and `$S` / read via `$Config` on connect; firmware push events override poll results |
| **Bun server (Nuxt)** | All UI/app state: job queue, preferences, connection config, active profile, auth | Stored in `config/app.yaml`; broadcast to every connected browser client via server-side WebSocket |

**Consequences that must be upheld during implementation:**
- Machine state is **never stored authoritatively in the browser or on the server** — only the firmware value is truth.
- UI state lives on the server and is **pushed to all clients simultaneously**; multiple browser tabs or remote viewers always see identical state.
- The browser holds only a **read replica** of server state and a **display cache** of firmware state — never the source of truth for either.
- On reconnect, the server re-sends full current state to the new client; the client must not persist any state between page loads.
- When writing machine config back to firmware (settings page "Write to FluidNC"), the updated values must be re-read from firmware after the write to confirm and update the local cache.

### State Sync Protocol (WebSocket)

The browser ↔ server sync runs over a single WebSocket at `/ws` (`ui/server/routes/ws.ts`, crossws `defineWebSocketHandler`). It uses a **snapshot + delta-patch** protocol — never broadcast full state on every change.

**Wire format** (all messages are `{ t, payload }`):
- `{ t: 'snapshot', payload: { config, connection, ui } }` — sent **once** when a client connects.
- `{ t: 'patch', payload: { ops: PatchOp[] } }` — every subsequent change. Each op is path-scoped and carries **only what changed**:
  - `{ path, set }` — replace a scalar slice (e.g. `nav`, `selection`, `connection`).
  - `{ path, push }` — append one array item (`modals`, `toasts`, `console`).
  - `{ path, removeId, meta? }` — remove one array item by id (`meta.result` carries a modal's resolution).
  - `{ path, clear }` — empty an array (`console`).
- Client→server intents use `t` values like `ui:nav`, `ui:selection`, `ui:modal:open` / `ui:modal:resolve`, `ui:toast:push` / `ui:toast:dismiss`, `ui:console:push` / `ui:console:clear`, `machine:connect` / `machine:disconnect`.

**Server-owned UI state** (`ui/server/utils/appState.ts`, the `ui` object) is the single source of truth and is broadcast to every client: `nav` (navMode, probingTab, route, wizard), `selection` (activeMachineId, selectedToolId, selectedFile), `modals` (stack), `toasts`, `console`. The server also owns timers (e.g. toast auto-dismiss) so they fire identically everywhere.

**Client side** (`ui/app/stores/sync.ts` + `ui/app/plugins/serverSync.client.ts`): the plugin applies `snapshot`/`patch` to the precise reactive slice so only dependent components re-render; patches routed by `path` (`connection`→machine store, `config`→settings store, else→sync store). Helper composables: `useNav`, `useSelection`, `useToast`, `useModals` (+ `useConfirm`). Console is a server-owned stream — components read `machine.consoleLog` (a computed alias over the sync store); `addConsole` sends `ui:console:push` (single origin, no per-client duplication).

**Synced modals:** all dialogs (confirm, stock, heightmap, goto-pos, tool, export, probing wizard) open/close on every browser via the modal stack. `useModals().open(kind, props)` returns a Promise that resolves when **any** browser closes it. Depth = open/close + result only; in-modal form fields stay local per browser.

**Hard rules when extending sync:**
- **Never reassign the sync store's array refs** (`modals`/`toasts`/`console`) — mutate in place (`push`/`splice`). `useModals`/`useToast` capture the array reference; reassigning (e.g. `.filter()`) stale-ifies it and silently breaks reactivity.
- Avoid circular imports between `stores/sync.ts` and `composables/useModals.ts` — the store must not import the composable (it crashes SSR). `ModalEntry` lives in the store; the plugin (not the store) calls `settleModal`.
- Generate one console entry / modal / toast at a **single** authority (the acting client or the server), never inside `applyServerStatus`-style code that runs on every client.

> **Dev runtime caveat:** Nitro/crossws WebSocket upgrades **do not work when `nuxt dev` runs under Bun's runtime** ([nitro#2721](https://github.com/nitrojs/nitro/issues/2721)) — the handshake hangs (client stuck CONNECTING) even though the server `open()` fires. The dev image (`ui/Dockerfile`) therefore runs the dev server on **Node** (`npm run dev`) while keeping Bun for `bun install`. Production (`Dockerfile.prd`) stays on Bun, where WS works after `nuxt build`.

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
feat/xyz           ← individual feature branches, always cut from `test`
fix/xyz            ← bug fix branches, cut from `test` (normal release cycle)
hotfix/xyz         ← urgent post-release fixes, cut from `main`
```

**Rules:**
- Before starting any file changes on a new feature, Claude must prompt the user with a question to create a new `feat/xyz` branch.
- PRs into `test` require at least one approving review and green CI.
- PRs into `main` require green CI + passing integration tests.
- Delete feature/bugfix branches after merging.
- SemVer tagging and container image publishing begin at the **Release Cycle** phase (Phase 5).
- In Phases 1–4, the version scheme does not need to be followed strictly.

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

### Phase 2 — UI Design Mockups `[x]`
- [x] Static Vue mockup of main `ui/` interface: 3D toolpath viewport, DRO, jog controls, job panel, file browser, probing wizards, tool management, spindle/coolant, macros, console, settings page
- [x] Light/dark theme implemented and togglable in `ui/`
- [x] Static Vue mockup of `fluid-sim/sim-ui/`: machine state viewer, dimension configurator, sensor triggers, stock definition, probe tip config, reset controls
- [x] Light/dark theme in `sim-ui/`
- No real serial/TCP logic yet; all data is mocked

### Phase 3 — Rust Simulator Implementation `[x]`
- Full GCode interpreter matching FluidNC command set
- TCP server exposing FluidNC WebSocket/serial protocol
- Simulated machine state machine: idle, run, hold, alarm, homing
- Hard stops, door sensor, touch probe, failure mode simulation
- Stock definition (rectangular / round, size, rotation)
- Probe tip diameter config + half-tip offset calculation for edge detection
- Near-realtime jog simulation
- Unit tests for all GCode handling and state transitions
- sim-ui wired to live simulator TCP connection (replaces mockups from Phase 2)

### Phase 4 — Functional UI Development `[x]`
- [x] Nuxt server routes: USB serial bridge (WebSerial via Bun serialport) + TCP/WiFi bridge
- [x] Real-time WebSocket stream from server routes to browser
- [x] FluidNC-specific features: firmware config read/write, soft-reset, unlock, homing, probing macros
- [x] GCode file upload, queue management, job execution with progress tracking
- [x] Replace all Phase 2 UI mockups with live-wired components
- [x] Full Vitest unit test suite for components and composables
- [x] Integration tests for serial/TCP bridge (using the Rust simulator as the target)

### Phase 5 — Release Cycle & Versioning `[ ]`
- SemVer versioning applied; initial release `v0.1.0`
- `release.yaml` GitHub Actions workflow: build → Trivy scan → push to ghcr.io → GitHub Release
- `ui/docker-compose.yaml` finalized with versioned image tags
- Branch protection rules on `main` and `test`
- CHANGELOG introduced

---

## UI — TopBar Layout

`TopBar.vue` has four fixed horizontal sections, left to right:

| # | Name | Flex behaviour | Contents |
|---|------|---------------|----------|
| 1 | **Connect area** | `shrink-0`, left-bound | Machine select, connect button, firmware version badge, restart button; also WS-offline and connection-error badges |
| 2 | **Cycle area** | `flex-[65]`, content centered | Machine state badge, Unlock (Alarm only), job-status hints (Pausing/Paused/Recovering), Cycle Start / Resume, Pause, Stop |
| 3 | **Emergency area** | `flex-[35]`, content centered | E-Stop button only |
| 4 | **Menu area** | `shrink-0`, right-bound | Sensors panel, dark/light toggle, user icon (auth only), settings / back link |

Cycle area and Emergency area share the remaining width after the two fixed sections in a 75/25 ratio via Tailwind `flex-[75]` / `flex-[25]` (sets `flex-grow` proportionally; `flex-basis: 0`).

---

## Development Conventions

- **Library versions:** Always select the latest stable version. Check npm/crates.io release dates before pinning.
- **Vue:** Composition API (`<script setup>`) only. Options API is not permitted for new code.
- **Comments:** Only when the *why* is non-obvious. No docblocks or what-comments.
- **PRs:** Small and focused. One logical change per PR. Imperative commit messages ("Add jog panel", not "Added jog panel").
- **Commits:** Never add a `Co-Authored-By` trailer or any Claude/AI attribution to commit messages.
- **Tests:** ≥ 80 % coverage on business logic. Simulator Rust code: `cargo test` must pass before any PR merge.
