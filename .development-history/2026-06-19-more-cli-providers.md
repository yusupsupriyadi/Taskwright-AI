# 2026-06-19 — Tambah provider CLI: Gemini, opencode, Cursor

**Scope:** Selain Claude Code & Codex, app kini bisa menjalankan task lewat tiga CLI agentic lain: **Gemini CLI** (`gemini`), **opencode** (`opencode`), dan **Cursor CLI** (`cursor-agent`). Tiap CLI punya cara invokasi headless berbeda.

**Files affected:**
- `src-tauri/src/models.rs` — `enum Provider` tambah `Gemini`, `Opencode`, `Cursor` (serde snake_case → "gemini"/"opencode"/"cursor").
- `src-tauri/src/runner.rs` — `resolve_program` map binary baru (`gemini`, `opencode`, `cursor-agent`); helper baru `prompt_via_stdin(provider)` (claude/codex/gemini = stdin, opencode/cursor = argumen); `build_args` tambah 3 arm; `start_task` hanya menulis prompt ke stdin bila `prompt_via_stdin` (tetap menutup stdin → EOF, cegah hang).
- `src/index.html` — 3 opsi `<select id="f-provider">`.
- `src/main.js` — `MODELS` untuk gemini/opencode/cursor; `PROVIDER_LABELS` + `providerLabel()`; badge kartu & drawer pakai label.
- `src/styles.css` — `.badge-gemini` (biru), `.badge-opencode` (teal), `.badge-cursor` (pink).

**Invokasi CLI (hasil riset dokumentasi resmi tiap CLI):**
- **Gemini** (stdin): prompt via STDIN (non-TTY = headless). FullBypass → `--yolo`; Sandboxed → `--approval-mode auto_edit`. Model `-m`.
- **opencode** (arg): `opencode run [--model provider/model] --dangerously-skip-permissions <prompt>`. Prompt = argumen posisional (tak baca stdin). KEDUA level otonomi pakai `--dangerously-skip-permissions` karena tanpa itu `run` bisa menggantung menunggu approval; opencode tak punya mode sandbox terpisah.
- **Cursor** (arg): `cursor-agent -p --output-format text [-m model] [--force] <prompt>`. Prompt = posisional. FullBypass → `--force` (terapkan perubahan); Sandboxed → tanpa `--force` (hanya mengusulkan). cursor-agent tak punya sandbox.

**Key decisions:**
- Arsitektur prompt jadi dua jalur: stdin (claude/codex/gemini) vs argumen CLI (opencode/cursor). `start_task` tetap selalu menutup stdin agar CLI berbasis-argumen tidak menggantung menunggu input.
- `prettify` (runner.rs) sudah punya fallback teks-mentah, jadi output non-JSON dari CLI baru tetap tampil terbaca di log.
- Model opencode/cursor pakai "(default)" + opsi Custom (format/nama model bebas; opencode = provider/model).

**Verifikasi:** `cargo check` + `cargo clippy` bersih; `node --check src/main.js` OK; `cargo fmt` (revert kosmetik store.rs di luar scope). CLI ini tidak bisa diuji end-to-end di sini → uji manual: pastikan binary (`gemini`/`opencode`/`cursor-agent`) ada di PATH, buat task dengan provider tsb, jalankan, cek log/diff. Bila binary tak ada → task otomatis kembali ke Not Started + toast error.
