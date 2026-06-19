# Permissions / Capabilities

Tauri 2 denies every native API unless granted. Grants live in `src-tauri/capabilities/default.json` (`permissions` array, scoped to `windows: ["main"]`).

- Currently granted: `core:default`, `opener:default`.
- Adding a plugin or fs/network/shell API → add its permission identifier here, else the call fails at runtime.
- `src-tauri/gen/schemas/*` are generated from capabilities — never edit manually; regenerated on build.