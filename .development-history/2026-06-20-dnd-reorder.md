# 2026-06-20 — Drag & drop reorder (atas/bawah + posisi presisi)

**Date:** 2026-06-20

**Scope:** Drag & drop kini bisa mengurutkan kartu naik/turun di dalam kolom, dan menaruh kartu pada posisi presisi (di antara dua kartu) saat dipindah antar-kolom — bukan lagi selalu jatuh ke paling bawah.

**Files affected:**
- `src/main.js` — `setupDnd` rewrite: `dragover` menghitung titik sisip dari posisi kursor dan menampilkan indikator garis (`showDropIndicator`/`cardBeforeY`/`removeDropIndicators`); `drop` menghitung `order` tujuan via `dropOrder` (pecahan: rata-rata tetangga, atau ±1 di tepi). `moveTask(id, status, order)` kini menerima `order` & mengizinkan reorder kolom yang sama (skip hanya bila posisi tak berubah). `queuePosition` diurut berdasarkan `order` (bukan `updated_at`).
- `src/styles.css` — tambah `.drop-indicator` (garis tipis warna `--accent`, `pointer-events:none`).
- `src-tauri/src/runner.rs` — scheduler `schedule()` memilih task Todo berikutnya berdasarkan `order` menaik (`partial_cmp`), bukan `updated_at`. created_at sebagai tie-breaker.

**Key decisions:**
- Field `order` (f64) jadi satu-satunya sumber posisi; backend `set_task_status` sudah menerima `order` apa adanya → tidak perlu IPC/command baru.
- Atas keputusan user: urutan eksekusi antrian Todo MENGIKUTI urutan visual (drag kartu ke atas = jalan lebih dulu), maka scheduler + badge `#n` disamakan ke basis `order`.
- Kolom AI Running (doing) tetap bukan zona drop (tidak berubah).

**Catatan multi-agent:** saat sesi ini, `src-tauri/src/models.rs` & `store.rs` termodifikasi oleh agent lain (fitur `check_updates_on_launch` / `cli_paths`) — TIDAK ikut di-commit pada scope ini.
