# 2026-06-19 — Fix drag & drop antar kolom Kanban

**Scope:** Drag manual kartu task antar kolom (mis. Not Started→Todo, Need Review→Done) tidak berfungsi. Root cause bukan di kode frontend, tapi di konfigurasi Tauri.

**Root cause:** Di Tauri v2, opsi window `dragDropEnabled` default `true`. Di Windows (WebView2), handler file-drop OS-level ini meng-intercept event HTML5 drag-and-drop di frontend, sehingga `dragover`/`drop` di `main.js` (`setupDnd()`) tidak terpicu. Dikonfirmasi dokumentasi resmi Tauri v2: "Disabling this option is necessary on Windows to utilize HTML5 drag and drop features on the frontend."

**Files affected:**
- `src-tauri/tauri.conf.json` — tambah `"dragDropEnabled": false` pada `app.windows[0]`.

**Catatan:**
- Kode DnD di `src/main.js` (`setupDnd`, `moveTask`) sudah benar/standar — tidak diubah.
- Backend `set_task_status(task_id, status, order: f64)` di `commands.rs` sudah mendukung order presisi; reorder dalam kolom yang sama belum diimplementasi (di luar scope bug ini).
- Konsekuensi: drop file dari OS ke dalam window kini nonaktif. Bila kelak ingin fitur "seret folder/file dari OS", perlu pendekatan lain (mis. listener `onDragDropEvent` Tauri) karena keduanya saling eksklusif di Windows.

**Verifikasi:** `cargo check` (src-tauri) sukses — `tauri_build` memvalidasi config. Uji drag end-to-end perlu dijalankan di app (`cargo tauri dev`) secara manual.

**Next steps (opsional):** Reorder kartu dalam kolom yang sama + drop di posisi presisi (manfaatkan `order` f64).
