# Repo polish: README, docs, About + untrack CLAUDE.md

**Date:** 2026-06-20
**Scope:** Made the repository look professional — rewrote the README, added a
`docs/` set, a CONTRIBUTING guide, and set the GitHub About metadata. Also
stopped tracking `CLAUDE.md` in git while keeping it on disk.

## Files affected

- `.gitignore` — add `/CLAUDE.md`.
- `CLAUDE.md` — `git rm --cached` (untracked; **local file intentionally kept**).
- `README.md` — full rewrite: badges (release/license/Tauri/platforms), Download
  table, all 5 providers, auto-update section, accurate autonomy table, docs links.
- `docs/development.md` — new: prerequisites, commands, verification, conventions,
  add-a-command pattern.
- `docs/architecture.md` — new: frontend/backend split, module table, agent run
  flow, permissions.
- `docs/build-and-release.md` — new: local build, release workflow, signing,
  auto-update, versioning.
- `CONTRIBUTING.md` — new: concise contributor guide.

## Non-file changes

- GitHub repo **About** set via `gh repo edit`: description, homepage
  (`releases/latest`), and 12 topics (tauri, rust, kanban, ai-agent, agentic,
  claude-code, codex, gemini, desktop-app, productivity, llm, automation).

## Notes for the next session

- `CLAUDE.md` is no longer in git but still lives on disk and is still read by the
  assistant — do not re-add it to git (it's gitignored).
- Docs reflect the real provider/flag mapping from `runner.rs` and the actual
  `release.yml`; keep them in sync if those change.
