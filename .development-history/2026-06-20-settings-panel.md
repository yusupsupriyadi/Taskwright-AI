# Settings Panel (tabbed modal)

**Date:** 2026-06-20

**Scope:** Menambahkan halaman Settings berbentuk tabbed modal (General, Providers/CLI, Data & About) — fitur baru, sebelumnya hanya ada 2 setting di topbar.

## Files affected
- `src-tauri/src/models.rs` — `Settings` ditambah `check_updates_on_launch: bool` (default true) & `cli_paths: HashMap<String,String>` (serde default); update `Default`.
- `src-tauri/src/runner.rs` — helper publik `bin_name`/`provider_key`; `resolve_program(provider, override_path)` kini hormati override; `start_task` baca `settings.cli_paths`.
- `src-tauri/src/commands.rs` — 5 command baru: `update_settings` (simpan objek Settings penuh), `check_clis` (deteksi CLI per provider), `system_info` (versi/identifier/paths), `open_external` (folder/URL via opener), `clear_logs` (hapus log non-running). Struct `CliStatus`, `SystemInfo`.
- `src-tauri/src/lib.rs` — daftarkan 5 command di `generate_handler!`.
- `src/index.html` — tombol gear `#open-settings` di topbar; overlay `#settings-overlay` (nav tab + 3 panel).
- `src/main.js` — `openSettings/closeSettings/switchSettingsTab/applySettings/refreshCliList/cliRowHTML/loadAboutInfo`; wiring; Escape + click-outside; update-on-launch kini di-gate `check_updates_on_launch` di `init` (dipindah dari `setupUpdater`).
- `src/styles.css` — kelas `.settings-modal/.settings-layout/.settings-nav/.settings-tab/.settings-content/.settings-panel/.settings-row/.cli-row/.cli-status/.path-display/.about-grid` (dark-only, reuse CSS vars).

## Key decisions
- `max_concurrent`/`notify_on_finish` **di-mirror** (tetap di topbar + di Settings, disinkronkan via `applySettings`); setter lama (`set_max_concurrent`/`set_notify_on_finish`) dipertahankan untuk topbar.
- Jalur utama panel = `update_settings` (objek penuh) agar future-proof & tidak meng-clobber `cli_paths`.
- `cli_paths` disimpan di dalam `Settings`/`state.json` (konsisten dgn persistence custom, bukan plugin store).
- Tidak ada perubahan capabilities/plugin: opener dipanggil sisi-Rust (tidak ter-gate), command custom tidak ter-gate.
- Tema/appearance & manajemen API keys sengaja TIDAK dibuat (keputusan scope user).

## Verification
`cargo fmt` + `cargo clippy --all-targets` bersih (NO WARNINGS), `cargo check` OK, `node --check main.js` OK. Uji UI manual lewat `cargo tauri dev` belum otomatis (GUI).
