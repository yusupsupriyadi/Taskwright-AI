# 2026-06-19 — Notifikasi OS saat run AI selesai

**Scope:** Tampilkan notifikasi desktop (OS native) ketika sebuah run agent AI selesai, agar user tahu hasilnya walau jendela app tidak fokus. Bisa di-toggle on/off.

**Files affected:**
- `src-tauri/Cargo.toml` — tambah dep `tauri-plugin-notification = "2"` (Cargo.lock ikut ter-update).
- `src-tauri/capabilities/default.json` — tambah permission `notification:default`.
- `src-tauri/src/lib.rs` — register `.plugin(tauri_plugin_notification::init())`; di setup minta izin notifikasi sekali (best-effort: `permission_state() != Granted → request_permission()`); register command `set_notify_on_finish`.
- `src-tauri/src/models.rs` — `Settings.notify_on_finish: bool` (default true).
- `src-tauri/src/runner.rs` — `use NotificationExt`; capture `title` task ke waiter thread; setelah run selesai panggil `notify_finished(app, title, ok, code)` HANYA bila `!stopped`; helper `notify_finished` baca setting terkini lalu kirim notifikasi (sukses: "Task finished — completed successfully"; gagal: "Task failed — exited with code N"), best-effort.
- `src-tauri/src/commands.rs` — command `set_notify_on_finish(value) -> Settings`.
- `src/index.html` — checkbox `#notify-on-finish` di topbar.
- `src/main.js` — default settings `notify_on_finish:true`; set checkbox di `refreshState`; handler change → `set_notify_on_finish`.
- `src/styles.css` — `.notify-toggle`.

**Key decisions:**
- Dipicu dari BACKEND (waiter thread di `runner.rs`), bukan frontend: andal walau window minimize/blur, dan data hasil run sudah ada di situ.
- TIDAK notify saat user men-stop manual (`stopped == true` → status NotStarted); hanya untuk penyelesaian natural (NeedReview), bedakan sukses vs gagal.
- Toggle `notify_on_finish` dibaca terkini saat run selesai (boleh diubah saat run berjalan). Teks notifikasi English, konsisten dengan UI app.
- `PermissionState::Unknown` ternyata bukan varian valid di versi plugin ini → pakai cek `!= Granted` untuk memicu request (aman & cukup).

**Verifikasi:** `cargo check` + `cargo clippy` bersih; `node --check src/main.js` OK; `cargo fmt` (revert perubahan kosmetik store.rs di luar scope). Uji tampil notifikasi nyata perlu dijalankan manual (`cargo tauri dev`) — jalankan task hingga selesai, pastikan toast OS muncul; toggle off → tidak muncul.
