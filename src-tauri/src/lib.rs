mod commands;
mod models;
mod runner;
mod store;

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

use models::Store;

/// State terpersist (workspaces + tasks).
pub struct AppState {
    pub store: Mutex<Store>,
}

/// Waktu sekarang dalam epoch milidetik.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            store: Mutex::new(Store::default()),
        })
        .manage(runner::Running::default())
        .setup(|app| {
            // Muat state dari disk saat startup.
            let handle = app.handle().clone();
            let mut loaded = store::load(&handle);
            // Rekonsiliasi: proses agent tidak bertahan melewati restart app.
            // Task yang tersimpan sebagai Doing sudah pasti mati → kembalikan ke
            // Not Started agar tidak nyangkut & agar hitungan slot penjadwal akurat.
            for t in loaded.tasks.iter_mut() {
                if t.status == models::Status::Doing {
                    t.status = models::Status::NotStarted;
                    if let Some(run) = t.run.as_mut() {
                        run.pid = None;
                    }
                }
            }
            if let Ok(mut s) = app.state::<AppState>().store.lock() {
                *s = loaded;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_state,
            commands::pick_folder,
            commands::add_workspace,
            commands::remove_workspace,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::set_task_status,
            commands::set_max_concurrent,
            commands::run_task,
            commands::stop_task,
            commands::get_task_log,
            commands::get_task_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
