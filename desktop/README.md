# FluidSender Desktop (Electron)

A secondary, one-click distribution channel for people who don't want to set up Docker. The
containerized deployment (`ui/docker-compose.yaml`) remains the recommended way to run
FluidSender — this wraps the exact same Nuxt/Nitro server. Builds for Linux, macOS, and
Windows are unsigned for now (no notarization/code-signing yet).

## Build and run

```bash
bun install
bun run prepare:vendor   # builds ui/, vendors its .output/, rebuilds serialport for Electron's ABI
bun run start             # compiles src/ and launches the app
```

`prepare:vendor` needs to be re-run whenever `ui/` changes. If the native `@serialport/bindings-cpp`
addon has no matching prebuild for your platform, rebuilding it from source needs `python3`, `make`,
and `g++` (the same toolchain `ui/Dockerfile.prd`'s builder stage installs for the container image).

## Package

```bash
bun run package
```

Produces a zip under `dist/` for whichever platform you're running this on (electron-builder
defaults to the host OS when no target is given) — plus an AppImage too, on Linux. macOS always
builds both `x64` and `arm64` zips regardless of which Mac you're building on (electron-builder
just downloads both prebuilt Electron variants; `@serialport/bindings-cpp`'s darwin prebuild is
already a universal x64+arm64 binary, so no per-arch rebuild step is needed).

macOS builds get a free, local **ad-hoc** signature (`scripts/sign-mac-adhoc.cjs`, an electron-builder
`afterPack` hook) — without it, the arm64 build fails to launch at all ("...is damaged and can't be
opened"), since Apple Silicon's kernel refuses to run any unsigned code, unlike x64/Rosetta which only
shows a bypassable warning. Ad-hoc signing only clears that hard block; it isn't real notarization, so
the "unidentified developer" prompt (right-click → Open once) is still expected on every platform. Full
notarization (needs a paid Apple Developer account) is deferred to a later stage, same as auto-update.

CI (`.github/workflows/build-desktop.yaml`, `.github/workflows/release-desktop.yaml`) builds all
three platforms natively on GitHub-hosted `ubuntu-latest`/`windows-latest`/`macos-latest` runners —
that's the only way to get a Windows build, since it can't be cross-compiled from Linux or macOS.
Pushes to `test` produce downloadable workflow artifacts; version tags attach every built file
(zips for all platforms, plus the Linux AppImage) to the GitHub Release.

## Where data lives

Config and GCode/job data live under Electron's `app.getPath('userData')` (not the Docker deployment's
`/app/config`/`/app/data` volumes) — `<userData>/config/app.yaml` and `<userData>/data/`.
