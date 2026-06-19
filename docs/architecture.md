# Architecture

How Taskwright AI is put together.

The app has two halves that communicate over Tauri's IPC bridge.

## Frontend (`src/`)

`index.html`, `main.js`, and `styles.css`, served directly as static files
(`build.frontendDist: "../src"` in `tauri.conf.json`). Because
`app.withGlobalTauri` is `true`, the Tauri JS API is reachable as a global
(`window.__TAURI__.core.invoke(...)`, `window.__TAURI__.event`, and plugin
namespaces like `window.__TAURI__.updater` / `.process`) rather than an npm
import — which is why `main.js` does not `import` anything.

Changing the frontend to a framework/bundler would require adding
`beforeDevCommand` / `beforeBuildCommand` to `tauri.conf.json` and pointing
`frontendDist` at the build output.

## Backend (`src-tauri/`)

Rust. `src/main.rs` is a thin entry point that calls `taskwright_lib::run()`;
the real logic lives in `src/lib.rs`. `run()` builds the Tauri app, registers
plugins, manages shared state, reconciles persisted state on startup, and
registers IPC commands via `invoke_handler(tauri::generate_handler![...])`.

| Module        | Responsibility                                                    |
| ------------- | ----------------------------------------------------------------- |
| `lib.rs`      | App setup, plugin & command registration, startup reconciliation. |
| `commands.rs` | `#[tauri::command]` IPC entry points (workspaces, tasks, run/stop, diff, settings). |
| `runner.rs`   | Resolving the CLI, spawning the process, streaming output, lifecycle (stop = process-tree kill). |
| `store.rs`    | JSON persistence in the OS app-data dir.                          |
| `models.rs`   | Data model (`Store`, `Task`, `Status`, `Provider`, `AutoLevel`, …). |

State (workspaces + tasks + settings) is held in an `AppState { store: Mutex<Store> }`
and persisted to disk. On startup, any task left in the `Doing` state from a
previous run is reset to `Not Started`, since agent processes do not survive an
app restart.

## Running an agent

When a card runs, the backend:

1. **Resolves the CLI** from `PATH` (honoring `PATHEXT` on Windows, e.g. finding
   `codex.cmd`). The executables are `claude`, `codex`, `gemini`, `opencode`,
   and `cursor-agent`.
2. **Builds provider-specific arguments** for the selected model and autonomy
   level (see the table in the [README](../README.md#autonomy-levels)).
3. **Feeds the prompt** — `claude` / `codex` / `gemini` read it over **stdin**
   (avoiding shell-quoting issues); `opencode` / `cursor-agent` take it as a
   positional argument.
4. **Streams output** — agent output is read as JSONL, condensed into readable
   log lines, and pushed to the UI via Tauri events. On Windows the process is
   spawned without a console window.
5. **Stops cleanly** — stopping a run kills the whole process tree.

A concurrency limit (configurable in the topbar) caps how many agents run
simultaneously; additional `Todo` cards queue until a slot frees up.

## Permissions

Tauri 2 gates every API behind capabilities. `src-tauri/capabilities/default.json`
lists the permissions granted to the main window — currently `core:default`,
`opener:default`, `dialog:default`, `notification:default`, `updater:default`,
and `process:allow-restart`. New plugin APIs or filesystem/network access must
be added there or the call is denied at runtime.

Files under `src-tauri/gen/` are generated — do not edit by hand.

The app identifier is `com.taskwright.desktop`.
