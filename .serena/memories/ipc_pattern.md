# IPC Pattern (add/call commands)

Add a backend command:
1. Annotate a fn in `src-tauri/src/lib.rs` with `#[tauri::command]`.
2. Add its name to `tauri::generate_handler![...]` inside `run()`'s `invoke_handler(...)`. (Omitting this = "command not found" at runtime.)
3. Call from JS: `window.__TAURI__.core.invoke("fn_name", { argName: value })`.

Invariants:
- JS object keys MUST match Rust parameter names exactly.
- Use serde-derived structs (serde/serde_json already deps) for structured args/returns.
- Existing example: `greet(name: &str) -> String`.