# Development

Local commands, verification, and conventions for working on Taskwright AI.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable) and Cargo.
- The Tauri CLI: `cargo install tauri-cli` (invoked as `cargo tauri ...`).
- On **Linux**, the Tauri system libraries: WebKitGTK, GTK3, libayatana-appindicator,
  librsvg, and patchelf — e.g. on Debian/Ubuntu:

  ```sh
  sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
    libayatana-appindicator3-dev librsvg2-dev patchelf
  ```

There is **no `package.json`**: the frontend (`src/`) is served as static files
and the entire toolchain is Cargo / Tauri-CLI based.

## Commands

Run from the **project root**:

| Command             | What it does                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `cargo tauri dev`   | Run the app in development — opens the window, hot-reloads `src/`.  |
| `cargo tauri build` | Produce a production bundle (installers in `src-tauri/target/release/bundle/`). |

Backend-only workflows (run inside `src-tauri/`):

| Command        | What it does            |
| -------------- | ----------------------- |
| `cargo check`  | Typecheck the backend.  |
| `cargo clippy` | Lint the Rust code.     |
| `cargo fmt`    | Format the Rust code.   |
| `cargo test`   | Run Rust tests (`cargo test <name>` for a single test). |

The frontend is plain static assets — there is no lint/test step for `src/`.

## Verification before a PR

A change is considered green when, inside `src-tauri/`:

```sh
cargo fmt --all -- --check
cargo clippy --all-targets
cargo check
```

all pass. If you touched the frontend, smoke-test the affected flow in
`cargo tauri dev`.

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(scope): …`, `fix(scope): …`, `refactor(scope): …`, `chore(scope): …`,
  `docs(scope): …`, `ci(scope): …`. One commit = one focused scope.
- **Versioning** is [SemVer](https://semver.org/). Keep the version in sync
  across `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, then update
  `CHANGELOG.md`. See [Build & release](./build-and-release.md).

## Adding a backend command

The core extension pattern:

1. Write a function annotated `#[tauri::command]` in `src-tauri/src/commands.rs`.
2. Add its name to the `tauri::generate_handler![...]` list in `src-tauri/src/lib.rs`.
3. Call it from JS: `invoke("command_name", { args })`. Argument keys in the JS
   object must match the Rust parameter names. Use `serde` / `serde_json` for
   structured payloads.

New plugin APIs or filesystem/network access must also be granted in
`src-tauri/capabilities/default.json`, or the call is denied at runtime. See
[Architecture](./architecture.md).
