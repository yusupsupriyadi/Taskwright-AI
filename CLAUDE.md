# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`Taskwright AI` (crate `taskwright-ai`) is a desktop application built with **Tauri 2** using a **vanilla HTML/CSS/JS** frontend (no framework, no bundler, no Node tooling). It is an agentic Kanban board where each task card is executed by a local **Claude Code** or **Codex** CLI in headless/auto mode (board columns: Not Started → Todo → AI Running → Need Review → Done).

## Commands

There is **no `package.json`**: the frontend is served as static files and the entire toolchain is Cargo/Tauri-CLI based. Run dev/build commands from the **project root**; run plain `cargo` commands from `src-tauri/`.

- `cargo tauri dev` — run the app in development (opens the desktop window, hot-reloads frontend changes from `src/`).
- `cargo tauri build` — produce a production bundle (installers in `src-tauri/target/release/bundle/`).
- `cargo check` / `cargo build` — typecheck / compile the Rust backend only (run inside `src-tauri/`).
- `cargo test` — run Rust tests (inside `src-tauri/`). A single test: `cargo test <name>`.
- `cargo clippy` — lint the Rust code. `cargo fmt` — format it.

There is no automated lint/test step for the frontend; `src/` files are plain static assets.

## Architecture

The app has two halves that communicate over Tauri's IPC bridge:

**Frontend (`src/`)** — `index.html`, `main.js`, `styles.css`, served directly (declared via `build.frontendDist: "../src"` in `tauri.conf.json`). Because `app.withGlobalTauri` is `true`, the Tauri JS API is reachable as a global (`window.__TAURI__.core.invoke(...)`) rather than an npm import — this is why `main.js` does not `import` anything. Changing the frontend to use a framework/bundler would require adding `beforeDevCommand`/`beforeBuildCommand` to `tauri.conf.json` and pointing `frontendDist` at the build output.

**Backend (`src-tauri/`)** — Rust. `src/main.rs` is a thin entry point that calls `taskwright_lib::run()`; the real logic lives in `src/lib.rs` (the crate is split into a `taskwright_lib` library plus a `taskwright-ai` binary, per the Tauri 2 convention noted in `Cargo.toml`). `run()` builds the Tauri app and registers IPC commands via `invoke_handler(tauri::generate_handler![...])`.

**Adding a backend command** (the core extension pattern): write a function annotated `#[tauri::command]` in `src/lib.rs`, add its name to the `generate_handler![...]` list, then call it from JS with `invoke("command_name", { args })`. Argument keys in the JS object must match the Rust parameter names. Use `serde`/`serde_json` (already dependencies) for structured payloads.

**Permissions** — Tauri 2 gates every API behind capabilities. `src-tauri/capabilities/default.json` lists the permissions granted to the main window (currently `core:default` and `opener:default`). New plugin APIs or filesystem/network access must be added here or the call is denied at runtime. Files under `src-tauri/gen/` are generated — do not edit by hand.

The app identifier is `com.taskwright.desktop`.
