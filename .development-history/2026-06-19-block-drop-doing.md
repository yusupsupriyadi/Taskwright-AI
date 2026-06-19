# 2026-06-19 — Blokir drop manual ke kolom Doing

**Scope:** Kartu task tidak boleh bisa di-drop manual ke kolom "Doing" (kolom ini dikelola sistem/agent). Sebelumnya drop ke Doing diterima dan membuat kartu nyangkut di Doing tanpa agent berjalan.

**Root cause:** `moveTask` (`src/main.js`) hanya menjaga *source* (`task.status === "doing"`), tidak menjaga *target* (`status === "doing"`). Backend `set_task_status` (`commands.rs`) juga menerima target apa pun. Transisi sah ke Doing hanya lewat `runner::set_status` saat agent start (`runner.rs:173`), bukan lewat command `set_task_status` — jadi command itu aman menolak Doing.

**Fix (defense-in-depth, 3 lapis):**
- `src-tauri/src/commands.rs` — `set_task_status` menolak `Status::Doing` dengan `Err` (backstop terakhir).
- `src/main.js` `moveTask` — guard `status === "doing"` → toast + return.
- `src/main.js` `dragover` — kolom Doing jadi non-droppable (tanpa `preventDefault`, kursor "tidak boleh"), tidak di-highlight.

**Multi-agent note:** Saat mengerjakan ini ada agent lain yang memigrasi string user-facing ke bahasa Inggris (toast & error backend kini Inggris; komentar tetap Indonesia). String baru saya selaraskan ke Inggris agar konsisten; komentar tetap Indonesia.

**Verifikasi:** `cargo check` sukses; `node --check src/main.js` syntax OK. Uji drag end-to-end perlu dijalankan manual di app (`cargo tauri dev`).
