# Topbar "+ Folder" button → icon-only

**Date:** 2026-06-20
**Scope:** Replaced the textual "+ Folder" workspace button in the topbar with a
compact icon-only button (folder + plus glyph), keeping the same action and id.

## Files affected

- `src/index.html` — `#ws-add` button: removed the `+ Folder` text label, swapped
  in an inline monochrome SVG folder-plus icon (`stroke="currentColor"`). Added
  `btn-icon` class and `aria-label="Add project folder"` (kept `title` too) so the
  icon-only control stays accessible.
- `src/styles.css` — new `.btn-icon` rule (square 7px padding, inline-flex centered)
  + `.btn-icon svg { display: block }`, placed right after `.btn-ghost`.

## Key decisions

- Used an inline SVG instead of a unicode/emoji folder glyph: the rest of the UI
  uses thin monochrome glyphs, and SVG renders crisply + monochrome on Windows
  (Tauri's primary target) without font-fallback surprises. It inherits the ghost
  button's `currentColor`, so hover/focus states keep working unchanged.
- Only the topbar `#ws-add` button was changed. The empty-state `#empty-add`
  "+ Choose Folder" button keeps its descriptive label (it's a primary CTA where
  text is appropriate).

## Notes for the next session

- `main.js` only binds a click handler to `#ws-add` (no text read/write), so the
  markup swap is logic-safe.
