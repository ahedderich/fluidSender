# Contributing to FluidSender

Thank you for your interest in contributing. This document covers everything you need to get started — branching, code style, testing, and the pull request process.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Branching Strategy](#branching-strategy)
4. [Development Setup](#development-setup)
5. [Code Style & Conventions](#code-style--conventions)
6. [Testing](#testing)
7. [Commit Messages](#commit-messages)
8. [Pull Request Process](#pull-request-process)
9. [Reporting Bugs](#reporting-bugs)
10. [Requesting Features](#requesting-features)
11. [Security Vulnerabilities](#security-vulnerabilities)

---

## Code of Conduct

Be respectful and constructive. Harassment, personal attacks, or discriminatory language will not be tolerated. If you experience or witness unacceptable behaviour, report it to **andreas.hedderich0@gmail.com**.

---

## Getting Started

1. **Fork** the repository and clone your fork.
2. Read [CLAUDE.md](CLAUDE.md) — it defines the architecture, technology choices, and phase plan. Contributions must stay within those decisions unless a change is explicitly discussed first.
3. Check the open issues and in-progress branches before starting work to avoid duplication.

---

## Branching Strategy

```
main               ← production release candidate (protected)
test               ← integration testing stage (protected)
test/feature-xyz   ← new features, always cut from test
test/bugfix-xyz    ← bug fixes in normal release cycle, cut from test
main/hotfix-xyz    ← urgent post-release fixes, cut from main
```

**Rules:**

- Never commit directly to `main` or `test`.
- Cut feature branches from `test`: `git checkout -b test/feature-xyz test`
- Cut hotfix branches from `main`: `git checkout -b main/hotfix-xyz main`
- Branch names use lowercase kebab-case with a short descriptive suffix (`test/feature-jog-panel`, `test/bugfix-serial-disconnect`).
- Delete your branch after the PR is merged.

---

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh/) | Latest stable | UI and sim-ui runtime, package manager |
| [Rust](https://rustup.rs/) | Latest stable (via `rustup`) | FluidNC simulator |
| [Docker](https://docs.docker.com/get-docker/) + Compose | Latest stable | Container builds and local deployment |

### UI (`ui/`)

```bash
cd ui
cp .env.example .env
bun install
bun run dev
```

### Simulator (`fluid-sim/sim/`)

```bash
cd fluid-sim/sim
cargo build
cargo run -- --config sim.example.toml
```

### Simulator UI (`fluid-sim/sim-ui/`)

```bash
cd fluid-sim/sim-ui
bun install
bun run dev
```

### Full stack via Docker

```bash
cd ui
cp .env.example .env
docker compose up
```

---

## Code Style & Conventions

### TypeScript / Vue (ui/ and fluid-sim/sim-ui/)

- **Vue 3 Composition API only** — `<script setup>` in all `.vue` files. Options API is not permitted for new code.
- **TypeScript strict mode** — `strict: true` in `tsconfig.json`. No `any` unless genuinely unavoidable and commented.
- **Tailwind CSS** for all styling. Avoid inline styles and scoped `<style>` blocks unless there is no practical alternative.
- **Pinia** for shared state. No direct component-to-component state passing beyond simple props.
- Format with Prettier and lint with ESLint before committing:
  ```bash
  bun run format
  bun run lint
  ```
- CI will reject PRs that fail linting or type-checking.

### Rust (`fluid-sim/sim/`)

- Format with `rustfmt` and lint with Clippy before committing:
  ```bash
  cargo fmt
  cargo clippy -- -D warnings
  ```
- All public items must have doc comments (`///`).
- Prefer explicit error handling (`Result`, `thiserror`) over `unwrap`/`expect` in library code. `expect` is acceptable in `main` for unrecoverable startup errors.
- CI will reject PRs where `cargo clippy -- -D warnings` fails.

### General

- **Comments:** Only when the *why* is non-obvious — a hidden constraint, a workaround for a specific bug, a subtle invariant. Do not describe *what* the code does; well-named identifiers do that.
- **No hardcoded secrets or credentials** anywhere in the codebase. Use environment variables or the `config/` volume.
- **Input validation** at all system boundaries — serial input from the controller, file uploads, config values from disk.

---

## Testing

### UI & sim-ui (Vitest)

```bash
bun run test          # run tests once
bun run test:watch    # watch mode
bun run test:coverage # with coverage report
```

- Target ≥ 80 % coverage on business logic (composables, stores, server routes).
- Tests live alongside the source file: `MyComponent.vue` → `MyComponent.test.ts`.
- Do not mock the serial/TCP transport in integration tests — use the Rust simulator as the target instead.

### Simulator (Cargo)

```bash
cargo test
```

- Unit tests live in the same file as the code under test (`#[cfg(test)]` modules).
- Integration tests live in `fluid-sim/sim/tests/`.
- All GCode handling and state machine transitions must have test coverage.

### Running the full CI suite locally

```bash
# UI
cd ui && bun run lint && bun run typecheck && bun run test && bun run build

# Sim
cd fluid-sim/sim && cargo fmt --check && cargo clippy -- -D warnings && cargo test

# Sim UI
cd fluid-sim/sim-ui && bun run lint && bun run typecheck && bun run test && bun run build
```

---

## Commit Messages

Use the **imperative mood** and keep the subject line under 72 characters.

```
Add jog panel with real-time position feedback
Fix serial port reconnect on cable unplug
Update FluidNC config parser for v3.8 syntax
Remove deprecated GRBL status polling fallback
```

- One logical change per commit.
- Reference issue numbers in the body when relevant: `Closes #42`.
- Do not include "WIP" commits in a PR — squash or rebase before opening the PR.

---

## Pull Request Process

1. **Open a draft PR early** if you want feedback on the direction before the work is complete.
2. **Fill in the PR template** — summary of the change, how to test it, and any relevant issue numbers.
3. **Ensure CI is green** — all lint, type-check, test, and build steps must pass. Do not disable or skip failing checks.
4. **Request a review** — at least one approving review is required before merging into `test` or `main`.
5. **Keep the PR small and focused** — one logical change per PR. If a change grows large, split it.
6. **Do not merge your own PR** without a review, except for trivial typo fixes.
7. After merge, **delete the source branch**.

### PR Title Format

Follow the same imperative style as commits:

```
Add touch probe simulation to Rust simulator
Fix WebSocket reconnect loop on network drop
```

---

## Reporting Bugs

Open a [GitHub Issue](../../issues) with the **bug** label and include:

- FluidSender version or commit SHA
- Operating system and browser
- Steps to reproduce
- Expected behaviour vs. actual behaviour
- Relevant logs (redact any serial output that may contain sensitive machine config)

---

## Requesting Features

Open a [GitHub Issue](../../issues) with the **enhancement** label. Describe:

- The problem you are trying to solve
- Your proposed solution or behaviour
- Any FluidNC-specific behaviour or protocol detail that is relevant

Features are triaged against the phase plan in [CLAUDE.md](CLAUDE.md). A feature may be accepted in principle but scheduled for a later phase.

---

## Security Vulnerabilities

Do **not** open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) that covers this project.
