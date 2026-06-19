# Contributing to Taskwright AI

Thanks for your interest in improving Taskwright AI! This is a
[Tauri 2](https://v2.tauri.app/) app with a vanilla HTML/CSS/JS frontend and a
Rust backend.

## Getting started

1. Install the prerequisites (Rust + Cargo, Tauri CLI, and on Linux the WebKitGTK
   system libraries) — see [docs/development.md](./docs/development.md).
2. Run the app:

   ```sh
   cargo tauri dev
   ```

3. Read [docs/architecture.md](./docs/architecture.md) to understand how the
   frontend, IPC commands, and agent runner fit together.

## Making a change

- Keep changes focused — one logical scope per pull request.
- Match the surrounding code style. Frontend is dependency-free vanilla JS; the
  backend follows standard `rustfmt` formatting.
- If you add a backend command or a new plugin/permission, wire it up as
  described in [docs/development.md](./docs/development.md#adding-a-backend-command)
  (including `capabilities/default.json`).

## Before you open a PR

Make sure the backend is green — inside `src-tauri/`:

```sh
cargo fmt --all -- --check
cargo clippy --all-targets
cargo check
```

If you touched the UI, smoke-test the affected flow in `cargo tauri dev`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): …`,
`fix(scope): …`, `refactor(scope): …`, `chore(scope): …`, `docs(scope): …`,
`ci(scope): …`. Bump the version (in `Cargo.toml` **and** `tauri.conf.json`) and
update [`CHANGELOG.md`](./CHANGELOG.md) only when cutting a release — see
[docs/build-and-release.md](./docs/build-and-release.md).

## Reporting issues

Open a GitHub issue with steps to reproduce, your OS, and which agent CLI /
provider was selected. Logs from the card's detail drawer are helpful.
