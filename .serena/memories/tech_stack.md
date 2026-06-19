# Tech Stack

- Tauri 2 (`tauri` v2, `tauri-build` v2, `tauri-plugin-opener` v2).
- Rust edition 2021. Toolchain present: cargo 1.96, tauri-cli 2.11.3, rustfmt, clippy.
- Serde / serde_json for IPC payload (de)serialization.
- Frontend: plain HTML/CSS/JS. NO `package.json`, NO npm/node, NO bundler at root.
- Granted permissions: `core:default`, `opener:default` (in `capabilities/default.json`).
- Platform: Windows (dev). `windows_subsystem = "windows"` set for release builds in `main.rs`.