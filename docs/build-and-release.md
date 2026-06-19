# Build & release

How to produce installers, how a release is cut, and how auto-update works.

## Building locally

```sh
cargo tauri build
```

Output lands in `src-tauri/target/release/bundle/`. The bundle is configured in
[`tauri.conf.json`](../src-tauri/tauri.conf.json) (`bundle.targets: "all"`), so
you get your platform's native artifacts:

- **Windows** → NSIS `-setup.exe` and/or MSI installer.
- **macOS** → `.app` and `.dmg`.
- **Linux** → `.deb`, `.AppImage`, and/or `.rpm` (needs the WebKitGTK system
  libraries; see [Development](./development.md)).

Bundle metadata: identifier `com.taskwright.desktop`, icons from `src-tauri/icons/`.

## Cutting a release

[`.github/workflows/release.yml`](../.github/workflows/release.yml) is triggered
by pushing a **`v*` tag** (or manual `workflow_dispatch`):

```sh
git tag v0.3.0
git push origin v0.3.0
```

On a `windows-latest` + `macos-latest` + `ubuntu-latest` matrix it uses
`tauri-apps/tauri-action` to build and attach artifacts to a **draft GitHub
Release** — review it and click **Publish**.

- The matrix runs **one OS at a time** (`max-parallel: 1`): the first leg creates
  the draft release; the others find it (same tag) and add their bundles, merging
  their platform into the single updater `latest.json`. Running in parallel would
  race to create the release and split assets across duplicate drafts.
- macOS builds a **universal** binary (`--target universal-apple-darwin`) so the
  `.dmg` runs on both Apple Silicon and Intel.
- Asset names are intentionally version-less (e.g. `Taskwright-AI_windows_x64-setup.exe`)
  so `/releases/latest/download/<name>` links always track the latest release.
- `workflow_dispatch` (no tag) builds the artifacts **without** creating a release.

> **Updater signing is configured** (minisign — see [Auto-update](#auto-update)),
> so in-app updates are verified. **OS code signing is not** — builds are unsigned,
> so first run may warn (Windows SmartScreen → "Run anyway"; macOS Gatekeeper →
> right-click → Open).

## Auto-update

The app updates itself in-app via the [Tauri updater plugin] — after the first
updater-enabled release, users no longer download installers by hand.

**How it works**

- `tauri.conf.json` enables `bundle.createUpdaterArtifacts` and sets
  `plugins.updater` with the signing **public key** plus one endpoint:
  `https://github.com/yusupsupriyadi/Taskwright-AI/releases/latest/download/latest.json`.
- The frontend drives it (`src/main.js`): a silent check at launch and a manual
  **Updates** button in the topbar. An available update shows a banner —
  **Download & install** → progress → **Restart now** (`window.__TAURI__.process.relaunch()`).
  Rust only registers the `updater` + `process` plugins (`src-tauri/src/lib.rs`).
- On release, `tauri-action` builds **signed** update artifacts (NSIS `-setup.exe`,
  macOS `.app.tar.gz`, Linux `.AppImage`) and uploads a merged `latest.json`. We
  set `uploadUpdaterSignatures: false` and sweep the loose `.sig` files, since
  the signature is already inlined in `latest.json` (the only thing the updater
  reads at runtime). `updaterJsonPreferNsis: true` points the generic Windows
  entry at the NSIS installer so it upgrades in place.

**Signing keys**

- Generated with `cargo tauri signer generate` (minisign). The **public** key is
  in `tauri.conf.json` → `plugins.updater.pubkey`.
- The **private** key + password are the GitHub Actions secrets
  `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, passed to
  `tauri-action` in [`release.yml`](../.github/workflows/release.yml). Keep a
  local backup — **never commit it**.
- ⚠️ Lose the private key or password and you can no longer ship updates to
  installed apps (users would have to manually install a fresh, re-keyed build).

**Rollout caveat**

Auto-update only works for releases **published after** the updater shipped. The
first updater-enabled build (`0.2.0`) must be installed by hand once; from the
next release onward it's in-app. Only NSIS / `.app` / AppImage are updatable
(`.msi` / `.deb` / `.rpm` are not), and the endpoint resolves only to a
**published** (not draft) release.

**Verify after publishing**

- The release has a `latest.json` that lists every platform with a non-empty
  inlined `signature` and working download URLs.
- Install an older updater-enabled build, publish a newer one, and confirm the
  in-app banner appears and updates successfully.

## Versioning

[Semantic Versioning](https://semver.org/). Keep the version in sync across
[`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) → `package.version` and
[`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) → `version`, then add
a section to [`CHANGELOG.md`](../CHANGELOG.md) (Keep a Changelog format) and tag.
The release workflow pulls the matching `CHANGELOG.md` section into the release
notes.

[Tauri updater plugin]: https://v2.tauri.app/plugin/updater
