# Task Completion

After Rust backend changes (run in `src-tauri/`):
1. `cargo fmt`
2. `cargo clippy` — resolve warnings.
3. `cargo check` (or `cargo build`).
4. `cargo test` if tests exist.

For behavior verification: `cargo tauri dev` from project root and exercise the UI.

Frontend-only changes (`src/`): no build/lint pipeline; verify via `cargo tauri dev`.