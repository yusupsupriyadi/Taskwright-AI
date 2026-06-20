# Fix: AI Running spinner frozen under reduced-motion

**Date:** 2026-06-20
**Scope:** The circular `.spinner` in the "AI Running" column (and the column's
pulsing live dot) did not animate on systems with OS animation effects disabled.

## Root cause

`.spinner` CSS is correct on its own (it's a flex item inside `.card-status`, so
its box + `transform` rotation apply). The blanket
`@media (prefers-reduced-motion: reduce)` rule set
`animation-duration: 0.001ms !important` on `*`, freezing every animation —
including the functional loading spinner — whenever Windows "Animation effects"
is off (WebView2 then reports `prefers-reduced-motion: reduce`).

## Fix

- `src/styles.css` — inside the reduced-motion media query, re-enable the two
  functional "AI is running" indicators by restoring their `animation-duration`
  with `!important`: `.spinner` → `0.7s`, `.col-doing .column-dot` → `1.6s`.
  Specificity (0,1,0 / 0,2,0) beats the universal `*` (0,0,0) among `!important`
  declarations, so they win the cascade. Decorative motion stays suppressed.

## Notes for the next session

- This is the accessibility-correct pattern: essential progress/status indicators
  are exempt from reduced-motion suppression; decorative motion is not.
- To verify: enable Windows reduced-motion (Settings → Accessibility → Visual
  effects → Animation effects = Off) and confirm a `doing`-status card's spinner
  still rotates.
