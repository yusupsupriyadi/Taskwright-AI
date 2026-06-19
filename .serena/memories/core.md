# Core

`real-agent`: Tauri 2 desktop app. Vanilla HTML/CSS/JS frontend (no framework/bundler/Node), Rust backend. Currently the default scaffold (single `greet` command wired end-to-end).

## Source map
- `src/` — frontend static assets (`index.html`, `main.js`, `styles.css`). Served directly, no build step.
- `src-tauri/src/main.rs` — thin entry, calls `real_agent_lib::run()`.
- `src-tauri/src/lib.rs` — actual backend: builds Tauri app, registers IPC commands.
- `src-tauri/tauri.conf.json` — app config (`frontendDist: ../src`, `withGlobalTauri: true`, identifier `com.yusup.real-agent`).
- `src-tauri/capabilities/default.json` — permission grants for main window.
- `src-tauri/gen/` — GENERATED, never hand-edit.

## Invariants
- Crate split: library `real_agent_lib` + binary `real-agent` (Tauri 2 convention; do not merge).
- IPC is the only frontend↔backend channel. See `mem:ipc_pattern`.
- Every native API is gated by a capability/permission. See `mem:permissions`.

## Further reading
- Stack & versions: `mem:tech_stack`
- Commands (dev/build/test/lint): `mem:suggested_commands`
- Code conventions: `mem:conventions`
- Definition-of-done checks: `mem:task_completion`
- How to add/call IPC commands: `mem:ipc_pattern`
- How to grant native capabilities: `mem:permissions`