# 2026-06-19 — UI polish layer (hilangkan kesan "kaku")

**Scope:** Naikkan kualitas tampilan keseluruhan agar tidak kaku — motion, kedalaman, dan feedback interaktif. Tanpa mengubah struktur/markup atau logika.

**Pendekatan:** Karena ada agent paralel yang juga memoles `styles.css` (treatment kolom Doing, migrasi string ke Inggris, rename "Taskwright AI"), saya TIDAK menulis ulang file. Sebagai gantinya satu blok "UI POLISH LAYER" aditif di akhir `styles.css` — rule belakangan menang pada specificity sama, jadi meng-override tanpa menyentuh rule lain dan tanpa merusak hook class JS (`.hidden`, `.drag-over`, `.dragging`, `.badge-*`, `.tab.active`, `.toast.error`).

**Files affected:**
- `src/styles.css` — append polish layer:
  - Atmosfer latar `body` (dua radial glow lembut).
  - Transisi global konsisten (easing pegas) untuk btn/card/tab/badge/input/column.
  - Tombol: hover lift + active press; primary dapat sheen + glow + focus-visible ring.
  - Kartu: radius 11px, sheen halus, bayangan dasar, hover lift, drag miring + bayangan kuat.
  - Kolom non-Doing: hover lift (Doing dikecualikan agar glow-nya utuh).
  - Overlay: dim + `backdrop-filter: blur(4px)`; animasi masuk modal/drawer/toast.
  - `@media (prefers-reduced-motion: reduce)` untuk aksesibilitas.

**Key decisions:**
- Tidak menambah animasi entrance pada `.card` karena `render()` mem-rebuild board pada banyak event (log/status) → akan flicker. Cukup hover/drag.
- Font tetap system stack (app desktop offline-first); peningkatan via spacing/motion/depth, bukan web font.

**Verifikasi:** CSS-only, tidak ada perubahan Rust/logika. Preview interaktif dibuat sebagai artifact untuk konfirmasi rasa motion & kedalaman.

**Next (opsional bila diminta):** arah lebih berani — display font khusus (bundled), skala tipografi, atau radii lebih besar.
