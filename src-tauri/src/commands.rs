use std::path::PathBuf;
use std::process::Command;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::models::{AutoLevel, Provider, Settings, Status, Store, Task, Workspace};
use crate::runner;
use crate::store;
use crate::{now_ms, AppState};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[tauri::command]
pub fn load_state(state: State<AppState>) -> Result<Store, String> {
    let s = state.store.lock().map_err(|_| "state locked")?;
    Ok(s.clone())
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.and_then(|p| p.as_path().map(|pp| pp.to_string_lossy().to_string())))
}

#[tauri::command]
pub fn add_workspace(app: AppHandle, path: String) -> Result<Workspace, String> {
    let pb = PathBuf::from(&path);
    if !pb.is_dir() {
        return Err(format!("not a valid folder: {path}"));
    }
    let name = pb
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let ws = Workspace {
        id: Uuid::new_v4().to_string(),
        name,
        path,
    };
    let state = app.state::<AppState>();
    {
        let mut s = state.store.lock().map_err(|_| "state locked")?;
        if s.workspaces.iter().any(|w| w.path == ws.path) {
            return Err("this folder has already been added".into());
        }
        s.workspaces.push(ws.clone());
        store::save(&app, &s)?;
    }
    Ok(ws)
}

#[tauri::command]
pub fn remove_workspace(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut s = state.store.lock().map_err(|_| "state locked")?;
    s.workspaces.retain(|w| w.id != id);
    s.tasks.retain(|t| t.workspace_id != id); // cascade: hapus task milik workspace
    store::save(&app, &s)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn create_task(
    app: AppHandle,
    workspace_id: String,
    title: String,
    prompt: String,
    provider: Provider,
    model: String,
    auto_level: AutoLevel,
) -> Result<Task, String> {
    let state = app.state::<AppState>();
    let mut s = state.store.lock().map_err(|_| "state locked")?;
    if !s.workspaces.iter().any(|w| w.id == workspace_id) {
        return Err("workspace not found".into());
    }
    let order = next_order(&s, &workspace_id, Status::NotStarted);
    let now = now_ms();
    let task = Task {
        id: Uuid::new_v4().to_string(),
        workspace_id,
        title,
        prompt,
        status: Status::NotStarted,
        provider,
        model,
        auto_level,
        order,
        created_at: now,
        updated_at: now,
        run: None,
    };
    s.tasks.push(task.clone());
    store::save(&app, &s)?;
    Ok(task)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn update_task(
    app: AppHandle,
    id: String,
    title: String,
    prompt: String,
    provider: Provider,
    model: String,
    auto_level: AutoLevel,
) -> Result<Task, String> {
    let state = app.state::<AppState>();
    let mut s = state.store.lock().map_err(|_| "state locked")?;
    let task = s
        .tasks
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or("task not found")?;
    task.title = title;
    task.prompt = prompt;
    task.provider = provider;
    task.model = model;
    task.auto_level = auto_level;
    task.updated_at = now_ms();
    let out = task.clone();
    store::save(&app, &s)?;
    Ok(out)
}

#[tauri::command]
pub fn delete_task(app: AppHandle, id: String) -> Result<(), String> {
    // Hentikan dulu bila sedang berjalan.
    let _ = runner::stop_task(&app, &id);
    let state = app.state::<AppState>();
    {
        let mut s = state.store.lock().map_err(|_| "state locked")?;
        s.tasks.retain(|t| t.id != id);
        store::save(&app, &s)?;
    }
    if let Ok(path) = store::log_file(&app, &id) {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

#[tauri::command]
pub fn set_task_status(
    app: AppHandle,
    task_id: String,
    status: Status,
    order: f64,
) -> Result<Task, String> {
    // Kolom Doing dikelola sistem: task hanya masuk Doing lewat runner saat agent
    // berjalan, bukan dari perpindahan manual. Tolak agar tidak nyangkut di Doing.
    if status == Status::Doing {
        return Err("The Doing column is system-managed and cannot be set manually.".into());
    }
    {
        let state = app.state::<AppState>();
        let mut s = state.store.lock().map_err(|_| "state locked")?;
        let task = s
            .tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or("task not found")?;
        task.status = status;
        task.order = order;
        task.updated_at = now_ms();
        store::save(&app, &s)?;
    }

    // Masuk Todo = antrian. Penjadwal yang memutuskan kapan task benar-benar
    // dijalankan (menghormati batas konkurensi global). Kegagalan start ditangani
    // di dalam penjadwal: task dikembalikan ke Not Started + event `task://error`.
    if status == Status::Todo {
        runner::schedule(&app);
    }

    // Kembalikan kondisi terkini task.
    let state = app.state::<AppState>();
    let s = state.store.lock().map_err(|_| "state locked")?;
    s.tasks
        .iter()
        .find(|t| t.id == task_id)
        .cloned()
        .ok_or_else(|| "task not found".into())
}

/// Tombol Run: masukkan task ke antrian (Todo) lalu jadwalkan. Bila ada slot
/// kosong penjadwal langsung menjalankannya; jika penuh, task menunggu giliran.
#[tauri::command]
pub fn run_task(app: AppHandle, task_id: String) -> Result<Task, String> {
    // Sudah berjalan? jangan dobel-jalankan.
    {
        let running = app.state::<runner::Running>();
        let map = running.map.lock().map_err(|_| "running locked")?;
        if map.contains_key(&task_id) {
            return Err("task is already running".into());
        }
    }
    {
        let state = app.state::<AppState>();
        let mut s = state.store.lock().map_err(|_| "state locked")?;
        let ws_id = s
            .tasks
            .iter()
            .find(|t| t.id == task_id)
            .map(|t| t.workspace_id.clone())
            .ok_or("task not found")?;
        let order = next_order(&s, &ws_id, Status::Todo);
        let t = s
            .tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or("task not found")?;
        t.status = Status::Todo;
        t.order = order;
        t.updated_at = now_ms();
        store::save(&app, &s)?;
    }
    runner::schedule(&app);

    let state = app.state::<AppState>();
    let s = state.store.lock().map_err(|_| "state locked")?;
    s.tasks
        .iter()
        .find(|t| t.id == task_id)
        .cloned()
        .ok_or_else(|| "task not found".into())
}

/// Ubah batas jumlah agent AI yang boleh berjalan bersamaan, lalu jadwalkan ulang
/// (menaikkan batas dapat membuka slot untuk task yang sedang mengantre).
#[tauri::command]
pub fn set_max_concurrent(app: AppHandle, value: usize) -> Result<Settings, String> {
    let settings = {
        let state = app.state::<AppState>();
        let mut s = state.store.lock().map_err(|_| "state locked")?;
        s.settings.max_concurrent = value.max(1);
        store::save(&app, &s)?;
        s.settings.clone()
    };
    runner::schedule(&app);
    Ok(settings)
}

/// Aktif/nonaktifkan notifikasi OS saat sebuah run AI selesai.
#[tauri::command]
pub fn set_notify_on_finish(app: AppHandle, value: bool) -> Result<Settings, String> {
    let state = app.state::<AppState>();
    let mut s = state.store.lock().map_err(|_| "state locked")?;
    s.settings.notify_on_finish = value;
    store::save(&app, &s)?;
    Ok(s.settings.clone())
}

/// Simpan seluruh objek Settings sekaligus (jalur utama panel Settings).
/// Memvalidasi `max_concurrent` minimal 1, lalu menjadwalkan ulang karena
/// perubahan batas dapat membuka slot untuk task yang mengantre.
#[tauri::command]
pub fn update_settings(app: AppHandle, mut settings: Settings) -> Result<Settings, String> {
    settings.max_concurrent = settings.max_concurrent.max(1);
    let out = {
        let state = app.state::<AppState>();
        let mut s = state.store.lock().map_err(|_| "state locked")?;
        s.settings = settings;
        store::save(&app, &s)?;
        s.settings.clone()
    };
    runner::schedule(&app);
    Ok(out)
}

/// Status deteksi sebuah CLI provider untuk panel Settings.
#[derive(serde::Serialize)]
pub struct CliStatus {
    pub provider: String,
    pub bin: String,
    pub found: bool,
    pub path: Option<String>,
}

/// Periksa ketersediaan tiap CLI provider: pakai override path dari settings bila
/// diset (found = file ada), selain itu cari executable-nya di PATH.
#[tauri::command]
pub fn check_clis(app: AppHandle) -> Result<Vec<CliStatus>, String> {
    let overrides = {
        let state = app.state::<AppState>();
        let s = state.store.lock().map_err(|_| "state locked")?;
        s.settings.cli_paths.clone()
    };
    let providers = [
        Provider::Claude,
        Provider::Codex,
        Provider::Gemini,
        Provider::Opencode,
        Provider::Cursor,
    ];
    let list = providers
        .iter()
        .map(|&p| {
            let key = runner::provider_key(p);
            let bin = runner::bin_name(p);
            let ov = overrides
                .get(key)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            let (found, path) = match ov {
                Some(custom) => {
                    let is_file = std::path::Path::new(&custom).is_file();
                    (is_file, is_file.then_some(custom))
                }
                None => match which::which(bin) {
                    Ok(p) => (true, Some(p.to_string_lossy().to_string())),
                    Err(_) => (false, None),
                },
            };
            CliStatus {
                provider: key.to_string(),
                bin: bin.to_string(),
                found,
                path,
            }
        })
        .collect();
    Ok(list)
}

/// Info aplikasi + lokasi penyimpanan untuk tab "Data & About".
#[derive(serde::Serialize)]
pub struct SystemInfo {
    pub app_name: String,
    pub version: String,
    pub identifier: String,
    pub data_dir: String,
    pub state_file: String,
    pub runs_dir: String,
}

#[tauri::command]
pub fn system_info(app: AppHandle) -> Result<SystemInfo, String> {
    let pkg = app.package_info();
    let path_str = |r: Result<PathBuf, String>| r.map(|p| p.to_string_lossy().to_string());
    Ok(SystemInfo {
        app_name: pkg.name.clone(),
        version: pkg.version.to_string(),
        identifier: app.config().identifier.clone(),
        data_dir: path_str(store::data_dir(&app))?,
        state_file: path_str(store::state_file(&app))?,
        runs_dir: path_str(store::runs_dir(&app))?,
    })
}

/// Buka folder/file lokal atau URL eksternal lewat aplikasi default OS.
#[tauri::command]
pub fn open_external(app: AppHandle, target: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let opener = app.opener();
    let res = if target.starts_with("http://") || target.starts_with("https://") {
        opener.open_url(target, None::<&str>)
    } else {
        opener.open_path(target, None::<&str>)
    };
    res.map_err(|e| format!("failed to open: {e}"))
}

/// Hapus semua file log run kecuali milik task yang sedang berjalan.
/// Mengembalikan jumlah file yang dihapus.
#[tauri::command]
pub fn clear_logs(app: AppHandle) -> Result<usize, String> {
    let running_ids: std::collections::HashSet<String> = {
        let running = app.state::<runner::Running>();
        let map = running.map.lock().map_err(|_| "running locked")?;
        map.keys().cloned().collect()
    };
    let dir = store::runs_dir(&app)?;
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(0), // folder runs belum ada = tidak ada log
    };
    let mut removed = 0usize;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("log") {
            continue;
        }
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if running_ids.contains(stem) {
            continue; // jangan hapus log task yang masih berjalan
        }
        if std::fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[tauri::command]
pub fn stop_task(app: AppHandle, task_id: String) -> Result<(), String> {
    runner::stop_task(&app, &task_id)
}

#[tauri::command]
pub fn get_task_log(app: AppHandle, task_id: String) -> Result<String, String> {
    let path = store::log_file(&app, &task_id)?;
    Ok(std::fs::read_to_string(path).unwrap_or_default())
}

#[tauri::command]
pub fn get_task_diff(app: AppHandle, task_id: String) -> Result<String, String> {
    let state = app.state::<AppState>();
    let path = {
        let s = state.store.lock().map_err(|_| "state locked")?;
        let task = s
            .tasks
            .iter()
            .find(|t| t.id == task_id)
            .ok_or("task not found")?;
        s.workspaces
            .iter()
            .find(|w| w.id == task.workspace_id)
            .map(|w| w.path.clone())
            .ok_or("workspace not found")?
    };

    let status = run_git(&path, &["status", "--short"]);
    let diff = run_git(&path, &["diff"]);

    match (status, diff) {
        (Err(e), _) => Ok(format!("Cannot read git diff (maybe not a git repo):\n{e}")),
        (Ok(st), Ok(df)) => {
            let st = st.trim();
            let df = df.trim();
            if st.is_empty() && df.is_empty() {
                Ok("No changes detected.".into())
            } else {
                Ok(format!("# git status\n{st}\n\n# git diff\n{df}"))
            }
        }
        (Ok(st), Err(_)) => Ok(format!("# git status\n{}", st.trim())),
    }
}

fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let mut c = Command::new("git");
    c.arg("-C").arg(cwd).args(args);
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    let out = c
        .output()
        .map_err(|e| format!("git is not available: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Order berikutnya (max+1) untuk sebuah kolom di workspace.
fn next_order(s: &Store, workspace_id: &str, status: Status) -> f64 {
    s.tasks
        .iter()
        .filter(|t| t.workspace_id == workspace_id && t.status == status)
        .map(|t| t.order)
        .fold(0.0_f64, f64::max)
        + 1.0
}
