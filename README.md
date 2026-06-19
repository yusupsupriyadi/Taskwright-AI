<div align="center">

# ◆ Taskwright AI

**An agentic Kanban board for your desktop.**
Every task card is carried out by a local AI coding CLI — Claude Code, Codex, Gemini, opencode, or Cursor — running in headless/auto mode.

[![Latest release](https://img.shields.io/github/v/release/yusupsupriyadi/Taskwright-AI?label=download&sort=semver)](https://github.com/yusupsupriyadi/Taskwright-AI/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Built with Tauri 2](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB.svg)](https://v2.tauri.app/)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-555.svg)
[![Docs site](https://img.shields.io/badge/docs-website-5b8cff.svg)](https://yusupsupriyadi.github.io/Taskwright-AI/)

**📖 [Documentation site →](https://yusupsupriyadi.github.io/Taskwright-AI/)**

</div>

Taskwright AI turns a simple Kanban board into an autonomous work queue. You
write a task (a title and a prompt), pick which AI agent should do it, point it
at a project folder, and drag the card into **Todo** — the agent runs in the
background, streams its log live, and moves the card to **Need Review** when it
finishes. You review the `git diff` and mark it **Done**.

It is built with [Tauri 2](https://v2.tauri.app/) and a dependency-free vanilla
HTML/CSS/JS frontend — no framework, no bundler, no Node toolchain.

## Download

Grab the latest installer for your OS from the
[**Releases**](https://github.com/yusupsupriyadi/Taskwright-AI/releases/latest)
page:

| OS      | File                                       |
| ------- | ------------------------------------------ |
| Windows | `Taskwright-AI_windows_x64-setup.exe`      |
| macOS   | `Taskwright-AI_macos_universal.dmg`        |
| Linux   | `Taskwright-AI_linux_amd64.AppImage` (or `.deb` / `.rpm`) |

Once installed, the app **updates itself** — see [Auto-update](#auto-update).
Builds are not OS-code-signed yet, so the first run may warn (Windows SmartScreen
→ "Run anyway"; macOS Gatekeeper → right-click → Open).

## Features

- **Agentic board** with five columns: `Not Started → Todo → AI Running → Need Review → Done`.
- **Five agent providers** — [Claude Code](https://docs.claude.com/en/docs/claude-code), [Codex](https://github.com/openai/codex), [Gemini CLI](https://github.com/google-gemini/gemini-cli), [opencode](https://opencode.ai), and [Cursor CLI](https://cursor.com) — selectable per card, each with model selection.
- **Auto-run on drag** — moving a card into **Todo** launches the agent in the selected workspace; it advances to **AI Running**, then **Need Review** on completion.
- **Concurrency queue** — cap how many agents run at once; extra cards wait their turn (configurable in the topbar).
- **Live streaming logs** — agent output is parsed and streamed into the card's detail drawer in real time.
- **Built-in diff review** — view the agent's `git diff` before accepting.
- **Desktop notifications** — get pinged when a run finishes.
- **In-app auto-update** — new versions install themselves from GitHub Releases.
- **Workspaces** — manage the project folders agents work in.
- **Local & private** — state lives on your machine; nothing leaves it except the prompts you hand to the CLIs you already use.

## Autonomy levels

Each card runs at one of two autonomy levels, mapped to each provider's native
flags:

| Provider   | CLI            | Full bypass (default)                         | Sandboxed                                  |
| ---------- | -------------- | --------------------------------------------- | ------------------------------------------ |
| Claude     | `claude`       | `--dangerously-skip-permissions`              | `--permission-mode acceptEdits`            |
| Codex      | `codex`        | `--dangerously-bypass-approvals-and-sandbox`  | `-s workspace-write`                       |
| Gemini     | `gemini`       | `--yolo`                                       | `--approval-mode` (auto-edit)              |
| opencode   | `opencode`     | skips permission prompts (no separate sandbox)| same (no sandbox mode)                     |
| Cursor     | `cursor-agent` | `--force` (applies changes)                    | proposes changes only (no `--force`)       |

> ⚠️ **Security note:** "Full bypass" lets the agent modify files and run commands
> in the chosen workspace without confirmation. Only point Taskwright AI at folders
> you trust, and prefer **Sandboxed** when in doubt.

## Auto-update

The app checks [GitHub Releases](https://github.com/yusupsupriyadi/Taskwright-AI/releases)
on launch (silently) and via the **Updates** button in the topbar. When a newer
version exists, a banner offers **Download & install** with a progress bar, then
**Restart now** to apply it. Updates are cryptographically signed (minisign) and
verified before install.

> The first updater-enabled build must be installed manually once; from then on,
> updates land in-app. Updatable installers are NSIS (Windows), `.app` (macOS),
> and AppImage (Linux). Full details: [docs/build-and-release.md](./docs/build-and-release.md#auto-update).

## Requirements

To **run** a downloaded build you only need at least one agent CLI installed and
authenticated locally (`claude`, `codex`, `gemini`, `opencode`, or `cursor-agent`)
and `git` on your `PATH` (used for diff review). Taskwright AI does **not** manage
authentication — it uses whatever credentials those CLIs are already logged in with.

To **build from source** you also need [Rust](https://www.rust-lang.org/tools/install)
(stable) + Cargo and the Tauri CLI (`cargo install tauri-cli`). See
[docs/development.md](./docs/development.md).

## Build from source

```sh
# Run the app in development (hot-reloads frontend changes from src/)
cargo tauri dev

# Produce a production bundle (installers land in src-tauri/target/release/bundle/)
cargo tauri build
```

More detail — local commands, verification, and the release process — is in the
[Documentation](#documentation).

## Project layout

```
src/            Frontend (index.html, main.js, styles.css) — static, no build step
src-tauri/      Rust backend
  src/lib.rs        App setup, state, plugin & command registration
  src/commands.rs   IPC commands (workspaces, tasks, run/stop, diff)
  src/runner.rs     Process spawning, streaming, lifecycle
  src/store.rs      JSON persistence (app data dir)
  src/models.rs     Data model
docs/           Documentation
.github/        CI / release workflows
```

## Documentation

- **[Documentation site](https://yusupsupriyadi.github.io/Taskwright-AI/)** — the hosted docs, nicely browsable.
- [Development](./docs/development.md) — local commands, verification, conventions.
- [Architecture](./docs/architecture.md) — how the frontend and Rust backend talk, and how agents are run.
- [Build & release](./docs/build-and-release.md) — building installers, the release pipeline, and auto-update.
- [Contributing](./CONTRIBUTING.md) — how to propose changes.
- [Changelog](./CHANGELOG.md) — notable changes per version.

## License

[MIT](./LICENSE) © 2026 Yusup
