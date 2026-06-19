# 2026-06-19 — Antrian + batas konkurensi (max AI running)

**Scope:** Kolom Todo jadi antrian sebenarnya. Task tidak lagi langsung jalan saat masuk Todo; sebuah penjadwal (scheduler) mengangkatnya ke Doing hanya bila slot tersedia, menghormati batas konkurensi global yang bisa diatur user (default 2).

**Perubahan inti — alur lama vs baru:**
- Lama: `set_task_status("todo")` → langsung `runner::start_task` → Doing.
- Baru: `set_task_status("todo")` hanya set status + panggil `runner::schedule`. Penjadwal yang memutuskan kapan benar-benar start.

**Files affected:**
- `src-tauri/src/models.rs` — `Settings { max_concurrent: usize }` (default 2) + field `settings` di `Store` (serde default → kompatibel state.json lama).
- `src-tauri/src/runner.rs` — `Running.sched: Mutex<()>` (serialisasi penjadwalan); `pub fn schedule(app)` loop FIFO global (min `updated_at`→`created_at`) selama `running.map.len() < settings.max_concurrent`; gagal start → revert NotStarted + emit `task://error`. Waiter thread memanggil `schedule` setelah run selesai (auto-dispatch slot kosong).
- `src-tauri/src/commands.rs` — `set_task_status` Todo→`schedule` (rollback lama dihapus, ditangani penjadwal); `run_task` kini enqueue (set Todo)+`schedule`, return `Task`; `set_max_concurrent(value)` baru → simpan + `schedule`.
- `src-tauri/src/lib.rs` — rekonsiliasi startup: persisted Doing→NotStarted (proses tak bertahan restart, jaga hitungan slot akurat); register `set_max_concurrent`.
- `src/index.html` — input `#max-concurrent` di topbar.
- `src/main.js` — `maxConcurrent()`/`queuePosition()`; set input di `refreshState`; handler `#max-concurrent`; badge `#N` di kartu Todo; count `n / max` di kolom AI Running; toast queued-vs-running di `moveTask` & `d-run`; listener `task://error`.
- `src/styles.css` — `.queue-area`, `.num-input`, `.badge-queue`.

**Key decisions:**
- Batas bersifat GLOBAL (lintas workspace) = total proses CLI hidup ≤ N; antrian FIFO global by `updated_at`. Tombol Run = enqueue (tak ada bypass) agar batas tak bisa dilanggar.
- Locking: `schedule` menahan `sched`; lock `store`/`map` selalu dilepas sebelum `start_task` (yang juga me-lock keduanya) → bebas deadlock. Pola `let s = match lock {…}` (bukan match di tail block) menghindari E0597.
- Startup TIDAK auto-schedule (hindari spawn agent tak terduga saat app dibuka); antrian terkuras pada pemicu schedule berikutnya (enqueue/selesai/naikkan limit), karena loop mengisi semua slot kosong.

**Verifikasi:** `cargo check` + `cargo clippy` bersih; `cargo fmt` (revert perubahan kosmetik store.rs di luar scope); `node --check src/main.js` OK. Uji end-to-end (mengantre >N task, slot terisi bertahap) perlu dijalankan manual di app (`cargo tauri dev`).
