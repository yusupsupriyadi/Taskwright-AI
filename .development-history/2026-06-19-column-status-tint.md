# 2026-06-19 — Tint latar kolom Kanban per status

**Scope:** Tiap kolom Kanban diberi warna latar sesuai status, halus (opacity rendah) agar kolom mudah dibedakan.

**Files affected:**
- `src/styles.css` — tambah aturan `.col-<status>` background memakai `color-mix(in srgb, <warna-status> 12%, var(--bg-elev))`, dengan deklarasi `--bg-elev` lebih dulu sebagai fallback WebView lama. Warna diambil dari token yang sudah ada (sama dengan `.column-dot`): not_started→`--text-faint`, todo→`--accent`, doing→`--amber`, need_review→`--purple`, done→`--green`.

**Key decisions:**
- Pakai `color-mix` (bukan rgba) supaya tint tetap di atas permukaan `--bg-elev` (menjaga kontras kartu), bukan menembus ke `--bg`.
- 12% = subtle tapi terlihat. Mudah disetel (8–20%) bila perlu.
- `.column.drag-over` (specificity lebih tinggi) tetap menang saat drag → highlight DnD tidak terganggu.

**Verifikasi:** Tidak ada perubahan logika/Rust. Preview visual dibuat sebagai artifact untuk konfirmasi kadar opacity.
