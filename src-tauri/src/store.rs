use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::models::Store;

/// Direktori data aplikasi (per-identifier, mis. %APPDATA%\com.yusup.real-agent).
pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app_data_dir: {e}"))
}

pub fn state_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("state.json"))
}

pub fn runs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("runs"))
}

pub fn log_file(app: &AppHandle, task_id: &str) -> Result<PathBuf, String> {
    Ok(runs_dir(app)?.join(format!("{task_id}.log")))
}

/// Muat Store dari disk; kembalikan default bila belum ada / korup.
pub fn load(app: &AppHandle) -> Store {
    let path = match state_file(app) {
        Ok(p) => p,
        Err(_) => return Store::default(),
    };
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
            eprintln!("[store] state.json corrupt ({e}), starting empty");
            Store::default()
        }),
        Err(_) => Store::default(),
    }
}

/// Simpan Store ke disk (membuat direktori bila perlu).
pub fn save(app: &AppHandle, store: &Store) -> Result<(), String> {
    let dir = data_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create data dir: {e}"))?;
    let path = state_file(app)?;
    let json = serde_json::to_string_pretty(store).map_err(|e| format!("failed to serialize: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("failed to write state.json: {e}"))
}
