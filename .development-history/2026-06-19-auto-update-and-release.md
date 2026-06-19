# Auto-update (Tauri updater) + release pipeline

**Date:** 2026-06-19
**Scope:** Added in-app auto-update via GitHub Releases (Tauri updater + process
plugins), a multi-platform release workflow, and cut the first updater-enabled
release `v0.2.0`. Pattern mirrors the `sososo` repo, adapted from React to
Taskwright's vanilla JS frontend.

## Files affected

- `src-tauri/Cargo.toml` — add `tauri-plugin-updater`/`tauri-plugin-process`; bump version 0.1.0 → 0.2.0.
- `src-tauri/src/lib.rs` — register the `updater` (Builder) + `process` plugins.
- `src-tauri/capabilities/default.json` — add `updater:default`, `process:allow-restart`.
- `src-tauri/tauri.conf.json` — version 0.2.0, `bundle.createUpdaterArtifacts`, `plugins.updater` (pubkey + GitHub `latest.json` endpoint).
- `src/index.html` — topbar **Updates** button + update banner (Download & install / progress / Restart).
- `src/main.js` — updater module: silent launch check + manual check, `downloadAndInstall` progress, `relaunch`. Accessed via `window.__TAURI__.updater` / `.process` (withGlobalTauri).
- `src/styles.css` — `.update-banner`, `.update-progress`, `.btn-sm`.
- `.github/workflows/release.yml` — new. Rust + `tauri-action` (no Node/Bun), matrix Win/mac(universal)/Linux, `max-parallel: 1`, signing secrets, draft release, CHANGELOG-derived notes, `.sig` sweep.
- `CHANGELOG.md` — new (Keep a Changelog); `[0.2.0]` section is the release body source.
- `docs/superpowers/specs/2026-06-19-auto-update-and-release-design.md` — design spec.

## Key decisions

- Frontend-driven (Rust only registers plugins) — matches existing direct
  `window.__TAURI__` usage; no new IPC commands.
- Silent launch check swallows all errors (offline / non-Tauri) so it never
  surfaces a spurious banner/toast; manual check reports errors + "up to date".
- Minisign keypair generated locally (`cargo tauri signer generate`). Public key
  committed in `tauri.conf.json`; private key + password stored as repo secrets
  `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`. Local backup at `~/.tauri/taskwright.key*`
  — never committed. Lose them → cannot ship updates to installed apps.

## Rollout caveat

Auto-update only applies to releases published **after** this. `0.2.0` is the
first updater build → one-time manual download; `0.2.0` → `0.3.0`+ is in-app.
Updatable targets: NSIS / `.app` / AppImage. OS code signing still out of scope.

## Next steps

- After CI finishes, **Publish** the draft GitHub Release for `v0.2.0`.
- E2E updater verification needs a second published release — confirm the in-app
  banner appears and updates after publishing a later version.
