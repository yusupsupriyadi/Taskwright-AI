# 2026-06-19 — Rebrand to Taskwright AI + open-source scaffolding

**Scope:** Renamed the project/app to **Taskwright AI** end-to-end and added the open-source baseline (README + MIT LICENSE).

**Files affected:**
- `src-tauri/tauri.conf.json` — `productName` → "Taskwright AI", `identifier` → `com.taskwright.desktop`, window title.
- `src-tauri/Cargo.toml` — package `real-agent` → `taskwright-ai`, lib `real_agent_lib` → `taskwright_lib`, real description/authors, `license = "MIT"`. `Cargo.lock` regenerated.
- `src-tauri/src/main.rs` — entry now calls `taskwright_lib::run()`.
- `src/index.html` — `<title>` + topbar brand → "Taskwright AI".
- `src-tauri/src/store.rs` — data-dir comment updated to new identifier.
- `README.md` — rewritten (was Tauri template): features, requirements, dev/build, how-it-works, security note, license.
- `LICENSE` — new, MIT © 2026 Yusup.
- `CLAUDE.md`, `.serena/memories/{core,conventions}.md` — naming/identifier references refreshed.

**Key decisions:**
- Identifier `com.taskwright.desktop` (avoided `.app` suffix). Consequence: app data dir moved from `com.yusup.real-agent` → fresh state; acceptable pre-release.
- README in English for OSS reach (UI is already English).

**Next steps:** Optional — replace default Tauri icons in `src-tauri/icons/` with Taskwright branding; check domain availability.
