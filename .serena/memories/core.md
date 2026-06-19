# Core

`Taskwright AI` (crate `taskwright-ai`): Tauri 2 desktop app. Vanilla HTML/CSS/JS frontend (no framework/bundler/Node), Rust backend. Agentic Kanban board — each task card is executed by a local Claude Code or Codex CLI (see `commands.rs`/`runner.rs`).

## Source map
- `src/` — frontend static assets (`index.html`, `main.js`, `styles.css`). Served directly, no build step.
- `src-tauri/src/main.rs` — thin entry, calls `taskwright_lib::run()`.
- `src-tauri/src/lib.rs` — actual backend: builds Tauri app, registers IPC commands.
- `src-tauri/tauri.conf.json` — app config (`frontendDist: ../src`, `withGlobalTauri: true`, identifier `com.taskwright.desktop`, productName `Taskwright AI`).
- `src-tauri/capabilities/default.json` — permission grants for main window.
- `src-tauri/gen/` — GENERATED, never hand-edit.

## Invariants
- Crate split: library `taskwright_lib` + binary `taskwright-ai` (Tauri 2 convention; do not merge).
- IPC is the only frontend↔backend channel. See `mem:ipc_pattern`.
- Every native API is gated by a capability/permission. See `mem:permissions`.

## Further reading
- Stack & versions: `mem:tech_stack`
- Commands (dev/build/test/lint): `mem:suggested_commands`
- Code conventions: `mem:conventions`
- Definition-of-done checks: `mem:task_completion`
- How to add/call IPC commands: `mem:ipc_pattern`
- How to grant native capabilities: `mem:permissions`