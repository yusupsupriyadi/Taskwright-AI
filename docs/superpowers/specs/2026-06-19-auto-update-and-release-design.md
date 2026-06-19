# Auto-update + Release — Design Spec

**Date:** 2026-06-19
**Status:** Approved
**Scope:** Add in-app auto-update (Tauri updater plugin) to Taskwright AI and set
up a multi-platform GitHub Release pipeline, then cut the first updater-enabled
release (`v0.2.0`).

## Goal

Let the app update itself in-app from GitHub Releases instead of users manually
re-downloading installers. Mirrors the proven pattern from the `sososo` repo,
adapted from its React frontend to Taskwright's **vanilla HTML/CSS/JS** frontend
(no bundler, no Node tooling — Tauri JS API reached via the `window.__TAURI__`
global because `app.withGlobalTauri` is `true`).

## Architecture

Frontend-driven: Rust only registers the `updater` + `process` plugins. The
frontend checks for updates and drives download/install/restart via the global
plugin APIs. No custom Rust IPC commands are added — this matches Taskwright's
existing direct `window.__TAURI__.core.invoke` usage.

Update channel: GitHub Releases. The updater endpoint resolves the latest
**published** (non-draft) release's `latest.json`:
`https://github.com/yusupsupriyadi/Taskwright-AI/releases/latest/download/latest.json`.

## Components

### Backend (Rust)

- `src-tauri/Cargo.toml`: add `tauri-plugin-updater = "2"`,
  `tauri-plugin-process = "2"`; bump `package.version` `0.1.0` → `0.2.0`.
- `src-tauri/src/lib.rs`: register
  `tauri_plugin_updater::Builder::new().build()` and
  `tauri_plugin_process::init()` alongside the existing plugins.
- `src-tauri/capabilities/default.json`: add permissions `"updater:default"`
  and `"process:allow-restart"`.

### Config (`src-tauri/tauri.conf.json`)

- `version` → `0.2.0`.
- `bundle.createUpdaterArtifacts: true`.
- `plugins.updater`: `{ pubkey: "<minisign public key>", endpoints: [ "https://github.com/yusupsupriyadi/Taskwright-AI/releases/latest/download/latest.json" ] }`.

### Frontend (vanilla JS)

- `src/index.html`: an update banner directly under `<header class="topbar">`,
  hidden by default; a small **Check for updates** button in the topbar
  (Taskwright has no Settings page).
- `src/main.js`: an updater module that
  - runs a **silent** check once at launch (stays quiet on failure — offline /
    non-Tauri),
  - exposes a **manual** check (surfaces errors via toast),
  - on an available update shows the banner: **Download & install** → progress →
    **Restart now**,
  - uses `window.__TAURI__.updater.check()`,
    `update.downloadAndInstall(onEvent)` (events `Started` / `Progress` /
    `Finished`), and `window.__TAURI__.process.relaunch()`,
  - guards against double-running the launch check.
- `src/styles.css`: banner + progress styling consistent with existing tokens.

### Release infra

- `.github/workflows/release.yml` (new): triggered by `v*` tags (and
  `workflow_dispatch`). **No Node/Bun** — Taskwright has no `package.json`; just
  the Rust toolchain + `tauri-apps/tauri-action`. Matrix:
  `windows-latest`, `macos-latest` (`--target universal-apple-darwin`),
  `ubuntu-latest` (installs WebKitGTK + appindicator + rsvg + patchelf).
  `max-parallel: 1` so the three legs share one draft release and merge into one
  `latest.json`. Passes `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`. `releaseDraft: true`,
  per-OS `assetNamePattern`, `updaterJsonPreferNsis: true`,
  `uploadUpdaterSignatures: false` + an explicit `.sig` sweep step.
  Release body composed from the matching `CHANGELOG.md` section + a download note.
- `CHANGELOG.md` (new): Keep a Changelog format, with a `[0.2.0]` section.

### Signing keys

- Generated with `cargo tauri signer generate -p <pw> -w <file> --ci` (minisign).
- Public key → `tauri.conf.json` → `plugins.updater.pubkey`.
- Private key + password → GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` /
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (set via `gh secret set`; fallback: print
  values for manual entry if the token lacks secrets-write).
- Local backup under `~/.tauri/` — **never committed**. Losing the key means no
  more updates can be shipped to installed apps.

## Error handling

- Silent launch check: swallow all errors (no banner, no toast) — covers
  offline and running outside Tauri (e.g. plain browser dev).
- Manual check: show a toast on error; show "You're up to date" when no update.
- Download/install failures: reset banner to an error state with a retry path;
  surface a toast.

## Rollout caveat

Auto-update only applies to releases published **after** the updater ships.
`0.1.0` has no updater, so `0.2.0` (the first updater build) is a one-time manual
download; `0.2.0` → `0.3.0`+ is in-app. Updatable targets: NSIS (Windows) /
`.app` (macOS) / AppImage (Linux). OS code-signing (Authenticode / notarization)
is out of scope — first run may warn (SmartScreen / Gatekeeper).

## Verification

- `cargo check` + `cargo clippy` in `src-tauri` (Rust compiles with new plugins).
- Frontend is static; no build step. Manual smoke of the launch check is a no-op
  until a newer release exists.
- True end-to-end updater verification requires two published releases — verify
  manually after `0.2.0` is published and a later release exists.

## Out of scope

- OS code signing (Authenticode / Apple notarization).
- A separate CI (lint/test) workflow — only the release workflow is added here.
- Update channels / staged rollout / changelog UI beyond the banner notes.
