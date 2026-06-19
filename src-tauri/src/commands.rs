use std::path::PathBuf;
use std::process::Command;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::models::{AutoLevel, Provider, Status, Store, Task, Workspace};
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

    // Aturan auto-run: masuk Todo => langsung jalankan agent.
    if status == Status::Todo {
        if let Err(e) = runner::start_task(&app, &task_id) {
            // Gagal start: kembalikan ke Not Started agar tidak nyangkut di Todo.
            let state = app.state::<AppState>();
            if let Ok(mut s) = state.store.lock() {
                if let Some(t) = s.tasks.iter_mut().find(|t| t.id == task_id) {
                    t.status = Status::NotStarted;
                }
                let _ = store::save(&app, &s);
            }
            return Err(e);
        }
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

#[tauri::command]
pub fn run_task(app: AppHandle, task_id: String) -> Result<(), String> {
    runner::start_task(&app, &task_id)
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
        (Err(e), _) => Ok(format!(
            "Cannot read git diff (maybe not a git repo):\n{e}"
        )),
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
    let out = c.output().map_err(|e| format!("git is not available: {e}"))?;
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
