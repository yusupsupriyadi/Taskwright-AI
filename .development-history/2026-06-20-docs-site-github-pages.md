# Documentation site on GitHub Pages (static HTML, no Node)

**Date:** 2026-06-20
**Scope:** Added a hosted documentation/landing site for Taskwright AI and
deployed it to GitHub Pages. Implemented as **plain static HTML/CSS** (no Node /
no build step) — the user explicitly declined adding a Node toolchain
(Docusaurus was considered then dropped). Live at
`https://yusupsupriyadi.github.io/Taskwright-AI/`.

## Files affected

- `website/index.html` — single-page docs site: hero + CSS-only board preview,
  features grid, download cards, getting started, providers/autonomy table,
  auto-update, under-the-hood, footer. Content mirrors the README.
- `website/styles.css` — on-brand dark theme reusing the app's design tokens
  (`--bg #0e1117`, `--accent #5b8cff`, etc.); responsive, reduced-motion aware.
- `website/.nojekyll` — skip Jekyll processing.
- `.github/workflows/docs.yml` — deploy `website/` to Pages via
  `upload-pages-artifact` + `deploy-pages` (no build). Triggers on push to
  master touching `website/**` or the workflow, plus `workflow_dispatch`.
- `README.md` — add docs-site badge + links.

## Non-file changes

- GitHub **Pages enabled** via API with `build_type=workflow` (source = GitHub
  Actions). Repo **homepage** set to the Pages URL.

## Key decisions

- Static HTML over a generator: matches the project's deliberate no-Node-tooling
  stance; GitHub Pages serves the folder as-is, deploy is a plain artifact upload.
- Site lives in `website/` (Pages "deploy from branch" only allows `/` or
  `/docs`, and `/docs` already holds the repo's markdown), so the Actions-based
  deploy is used.
- Single page with anchor nav — simplest professional shape; no client JS needed
  (smooth scroll via CSS, responsive nav via media queries).

## Notes for the next session

- Keep `website/` content in sync with the README / `docs/` if features change
  (especially the providers/autonomy table, sourced from `runner.rs`).
- The release badge / `latest` download links resolve only once the `v0.2.0`
  GitHub Release is **published** (still a draft as of writing).
