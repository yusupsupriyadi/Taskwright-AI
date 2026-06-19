# 2026-06-19 — Konfirmasi sebelum remove workspace (folder)

**Scope:** Tombol Remove workspace (`#ws-remove`) kini memunculkan dialog konfirmasi kustom sebelum menjalankan `remove_workspace`, mencegah penghapusan workspace + task secara tidak sengaja.

**Files affected:**
- `src/index.html` — tambah overlay `#confirm-overlay` (reuse `.overlay`/`.modal`, varian `.modal-sm`) berisi `#confirm-title`, `#confirm-message`, tombol `#confirm-cancel` + `#confirm-ok`; `role="alertdialog"`.
- `src/main.js` — tambah helper Promise-based `confirmDialog({title,message,confirmLabel,danger})` + `closeConfirm(result)`; wiring listener (ok/cancel/close/klik-overlay) di `setupUi`; Esc menutup confirm lebih dulu (topmost), Enter mengonfirmasi; handler `#ws-remove` kini `await confirmDialog(...)` dan menghitung jumlah task yang ikut terhapus.
- `src/styles.css` — tambah `.modal-sm` (width 420px) dan `.confirm-message`.

**Key decisions:**
- Dialog kustom (bukan `window.confirm` native) supaya konsisten dengan modal/drawer app dan tidak terlihat out-of-place di WebView.
- Pesan menyebut akurat: `remove_workspace` (commands.rs) cascade menghapus semua task milik workspace TAPI tidak menghapus folder/file di disk — pesan menegaskan keduanya.
- `confirmDialog` sengaja dibuat reusable agar bisa dipakai ulang untuk konfirmasi destruktif lain (mis. delete task) nanti.

**Verifikasi:** `node --check src/main.js` lolos. Tidak ada perubahan Rust/backend.
