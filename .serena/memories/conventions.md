# Conventions

- `main.rs` stays a thin shim → `real_agent_lib::run()`. Put logic in `lib.rs`, not `main.rs`.
- `#[cfg_attr(mobile, tauri::mobile_entry_point)]` on `run()` — keep for mobile target compat.
- Frontend uses the GLOBAL Tauri API (`window.__TAURI__.core`), NOT npm imports — consequence of `withGlobalTauri: true`. Do not add `import ... from '@tauri-apps/api'` unless a bundler is introduced.
- Switching frontend to a framework/bundler requires: add `beforeDevCommand`/`beforeBuildCommand` to `tauri.conf.json` build section AND repoint `frontendDist` to the build output dir.
- Rust formatting/linting via rustfmt + clippy (default rules).