# Taskwright AI

> An agentic Kanban board for your desktop — every task card is carried out by a local **Claude Code** or **Codex** CLI running in headless/auto mode.

Taskwright AI turns a simple Kanban board into an autonomous work queue. You write a task (title + prompt), pick which AI agent should do it, point it at a project folder, and drag the card into **Todo** — the agent runs in the background, streams its log live, and moves the card to **Need Review** when it's done. You review the diff and mark it **Done**.

Built with [Tauri 2](https://v2.tauri.app/) and a dependency-free vanilla HTML/CSS/JS frontend (no framework, no bundler, no Node toolchain).

## Features

- **Agentic board** with five columns: `Not Started → Todo → AI Running → Need Review → Done`.
- **Per-card configuration** — choose the provider (Claude Code or Codex), the AI model, and the autonomy level.
- **Auto-run on drag** — moving a card into **Todo** automatically launches the agent in the selected workspace; it advances to **AI Running**, then **Need Review** on completion.
- **Workspaces** — pick the project folder each agent works in.
- **Live streaming logs** — agent output is parsed and streamed into the card's detail drawer in real time.
- **Built-in review** — view `git diff` of the agent's changes before accepting.
- **Full control** — Stop a running agent (kills the whole process tree), Re-run, or mark Done.
- **Local & persistent** — state is stored on your machine; nothing is sent anywhere except to the CLIs you already use.

## Autonomy levels

Each card can run at one of two autonomy levels:

- **Full bypass** (default) — maximum autonomy. Runs Claude with `--dangerously-skip-permissions` and Codex with `--dangerously-bypass-approvals-and-sandbox`. The agent can edit files and run commands without asking.
- **Sandboxed** — auto-edit restricted to the workspace folder (Claude `--permission-mode acceptEdits`, Codex `-s workspace-write`).

> ⚠️ **Security note:** "Full bypass" lets the agent modify files and execute commands in the chosen workspace without confirmation. Only point Taskwright AI at folders you trust, and prefer **Sandboxed** when in doubt.

## Requirements

- [Rust](https://www.rust-lang.org/tools/install) (stable) and Cargo.
- The Tauri CLI: `cargo install tauri-cli` (run as `cargo tauri ...`).
- At least one agent CLI installed and authenticated locally:
  - [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude`), and/or
  - [Codex](https://github.com/openai/codex) (`codex`).
- `git` on your `PATH` (used for the diff review).

Taskwright AI does **not** manage authentication — it uses whatever credentials your `claude` / `codex` CLIs are already logged in with.

## Development

```sh
# Run the app in development (hot-reloads frontend changes from src/)
cargo tauri dev

# Produce a production bundle (installers land in src-tauri/target/release/bundle/)
cargo tauri build
```

Backend-only workflows (run inside `src-tauri/`):

```sh
cargo check     # typecheck
cargo clippy    # lint
cargo fmt       # format
cargo test      # run tests
```

## How it works

The frontend is served as static files and talks to the Rust backend over Tauri's IPC bridge. When a card runs, the backend resolves the chosen CLI, spawns it with the workspace as its working directory, and **feeds the prompt over stdin** (avoiding shell-quoting issues). Agent output is read as JSONL, condensed into readable log lines, and streamed to the UI via Tauri events. On Windows the process is spawned without a console window and stopped with a full process-tree kill.

## Project layout

```
src/            Frontend (index.html, main.js, styles.css) — static, no build step
src-tauri/      Rust backend
  src/lib.rs        App setup, state, command registration
  src/commands.rs   IPC commands (workspaces, tasks, run/stop, diff)
  src/runner.rs     Process spawning, streaming, lifecycle
  src/store.rs      JSON persistence (app data dir)
  src/models.rs     Data model
```

## License

[MIT](./LICENSE) © Yusup
