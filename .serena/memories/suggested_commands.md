# Suggested Commands

Run `cargo tauri *` from project ROOT; run plain `cargo *` from `src-tauri/`.

- `cargo tauri dev` — run app in dev (desktop window; frontend hot-reload from `src/`).
- `cargo tauri build` — production bundle → `src-tauri/target/release/bundle/`.
- `cargo check` — fast typecheck of Rust backend (cwd `src-tauri/`).
- `cargo build` — compile backend.
- `cargo test` — run Rust tests; single test: `cargo test <name>`.
- `cargo clippy` — lint Rust.
- `cargo fmt` — format Rust.

No frontend lint/test tooling exists (static assets only).

## Windows shell notes
- Default shell is PowerShell; a Bash tool is also available (POSIX syntax). `&&`/`||` chaining unavailable in PowerShell 5.1 — use `;` + `if ($?)`.