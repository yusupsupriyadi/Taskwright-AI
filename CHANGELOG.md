# Changelog

All notable changes to Taskwright AI are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-19

First publicly released build, and the **first with in-app auto-update**.

### Added

- **In-app auto-update** via the Tauri updater plugin. The app checks GitHub
  Releases on launch (silently) and via a **Updates** button in the topbar; when
  a new version is available a banner offers **Download & install** with a
  progress bar, then **Restart now** to apply it.
- Multi-platform release pipeline (`.github/workflows/release.yml`): tagging a
  `v*` version builds signed Windows / macOS (universal) / Linux bundles and a
  merged `latest.json`, attached to a draft GitHub Release.

> **Auto-update rollout note:** this is the first updater-enabled build, so it
> must be installed manually once. From the next release onward, updates install
> in-app. Updatable installers are NSIS (Windows), `.app` (macOS) and AppImage
> (Linux). Builds are not OS-code-signed yet, so the first run may warn
> (Windows SmartScreen / macOS Gatekeeper).

## [0.1.0]

- Initial Taskwright AI build: agentic Kanban board that runs each task card with
  a local Claude Code / Codex / Gemini / opencode / Cursor CLI, with a queue
  concurrency limit and desktop notifications on run completion.

[0.2.0]: https://github.com/yusupsupriyadi/Taskwright-AI/releases/tag/v0.2.0
[0.1.0]: https://github.com/yusupsupriyadi/Taskwright-AI/releases/tag/v0.1.0
