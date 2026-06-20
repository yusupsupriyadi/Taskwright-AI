# Topbar "Remove" workspace button → icon-only

**Date:** 2026-06-20
**Scope:** Replaced the textual "Remove" workspace button in the topbar with a
compact icon-only button (folder-minus glyph), keeping the same action and id.

## Files affected

- `src/index.html` — `#ws-remove` button: removed the `Remove` text label, swapped
  in an inline monochrome SVG folder-minus icon (`stroke="currentColor"`). Added
  the `btn-icon` class and `aria-label="Remove active workspace"` (kept `title`)
  so the icon-only control stays accessible.

## Key decisions

- Used a folder-minus icon (same folder path as the `#ws-add` folder-plus icon,
  with a single horizontal "minus" line) instead of a trash glyph, so the
  add/remove pair reads as a consistent visual set. The button keeps
  `btn-danger-ghost`, so the icon inherits the red danger color via `currentColor`.
- No CSS change needed: `.btn-icon` already exists (added in 77cf9a9) and is reused.

## Notes for the next session

- `main.js` only toggles `#ws-remove.disabled` and binds a click handler (no text
  read/write), so the markup swap is logic-safe.
