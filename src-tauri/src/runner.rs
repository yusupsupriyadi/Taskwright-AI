use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::models::{AutoLevel, Provider, Status, Task, Workspace};
use crate::store;
use crate::{now_ms, AppState};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Handle untuk proses yang sedang berjalan (dipakai Stop & guard double-run).
pub struct RunHandle {
    pub pid: u32,
    pub stop: Arc<AtomicBool>,
}

/// State global: peta task_id -> proses berjalan.
#[derive(Default)]
pub struct Running {
    pub map: Mutex<HashMap<String, RunHandle>>,
    /// Mengunci keputusan penjadwalan agar hanya satu `schedule()` berjalan pada
    /// satu waktu — mencegah dua slot kosong men-dispatch task antrian yang sama.
    pub sched: Mutex<()>,
}

/// Resolusi executable CLI dari PATH (hormati PATHEXT, mis. temukan codex.cmd).
fn resolve_program(provider: Provider) -> Result<PathBuf, String> {
    let bin = match provider {
        Provider::Claude => "claude",
        Provider::Codex => "codex",
    };
    which::which(bin).map_err(|e| format!("CLI '{bin}' not found in PATH: {e}"))
}

/// Argumen sesuai provider + level otonomi. Prompt dikirim via STDIN, bukan arg.
fn build_args(task: &Task, workspace: &Workspace) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    match task.provider {
        Provider::Claude => {
            args.extend(
                ["-p", "--output-format", "stream-json", "--verbose"]
                    .iter()
                    .map(|s| s.to_string()),
            );
            if !task.model.trim().is_empty() {
                args.push("--model".into());
                args.push(task.model.trim().into());
            }
            match task.auto_level {
                AutoLevel::FullBypass => args.push("--dangerously-skip-permissions".into()),
                AutoLevel::Sandboxed => {
                    args.push("--permission-mode".into());
                    args.push("acceptEdits".into());
                }
            }
        }
        Provider::Codex => {
            args.extend(
                ["exec", "--json", "--skip-git-repo-check"]
                    .iter()
                    .map(|s| s.to_string()),
            );
            args.push("-C".into());
            args.push(workspace.path.clone());
            if !task.model.trim().is_empty() {
                args.push("-m".into());
                args.push(task.model.trim().into());
            }
            match task.auto_level {
                AutoLevel::FullBypass => {
                    args.push("--dangerously-bypass-approvals-and-sandbox".into())
                }
                AutoLevel::Sandboxed => {
                    args.push("-s".into());
                    args.push("workspace-write".into());
                }
            }
            // '-' memaksa codex membaca prompt dari stdin.
            args.push("-".into());
        }
    }
    args
}

/// Mulai eksekusi agent untuk sebuah task. Mengatur status -> Doing,
/// menjalankan proses, dan men-stream log lewat event.
pub fn start_task(app: &AppHandle, task_id: &str) -> Result<(), String> {
    // Ambil salinan task + workspace.
    let (task, workspace) = {
        let state = app.state::<AppState>();
        let s = state.store.lock().map_err(|_| "state locked")?;
        let task = s
            .tasks
            .iter()
            .find(|t| t.id == task_id)
            .cloned()
            .ok_or("task not found")?;
        let workspace = s
            .workspaces
            .iter()
            .find(|w| w.id == task.workspace_id)
            .cloned()
            .ok_or("task workspace not found")?;
        (task, workspace)
    };

    if !PathBuf::from(&workspace.path).is_dir() {
        return Err(format!(
            "workspace folder does not exist: {}",
            workspace.path
        ));
    }

    // Guard: sudah berjalan?
    {
        let running = app.state::<Running>();
        let map = running.map.lock().map_err(|_| "running locked")?;
        if map.contains_key(task_id) {
            return Err("task is already running".into());
        }
    }

    let program = resolve_program(task.provider)?;
    let args = build_args(&task, &workspace);

    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .current_dir(&workspace.path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to run {}: {e}", program.display()))?;

    let pid = child.id();
    let stop = Arc::new(AtomicBool::new(false));

    // Kirim prompt via stdin lalu tutup.
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(task.prompt.as_bytes());
        // drop(stdin) menutup pipe -> EOF bagi CLI.
    }

    // Bersihkan log run sebelumnya.
    if let Ok(path) = store::log_file(app, task_id) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&path, b"");
    }

    // Daftarkan ke running map.
    {
        let running = app.state::<Running>();
        let mut map = running.map.lock().map_err(|_| "running locked")?;
        map.insert(
            task_id.to_string(),
            RunHandle {
                pid,
                stop: stop.clone(),
            },
        );
    }

    // Update status -> Doing + persist + emit.
    set_status(app, task_id, Status::Doing, |t| {
        t.run = Some(crate::models::RunInfo {
            started_at: now_ms(),
            ended_at: None,
            exit_code: None,
            ok: None,
            pid: Some(pid),
        });
    });

    // Reader threads (stdout & stderr).
    if let Some(out) = child.stdout.take() {
        spawn_reader(app.clone(), task_id.to_string(), out, "stdout");
    }
    if let Some(err) = child.stderr.take() {
        spawn_reader(app.clone(), task_id.to_string(), err, "stderr");
    }

    // Waiter thread.
    let app_w = app.clone();
    let id_w = task_id.to_string();
    let title_w = task.title.clone();
    let stop_w = stop;
    std::thread::spawn(move || {
        let exit = child.wait();
        let stopped = stop_w.load(Ordering::SeqCst);
        let code = exit.ok().and_then(|s| s.code());
        let ok = !stopped && code == Some(0);

        // Lepas dari running map.
        if let Some(running) = app_w.try_state::<Running>() {
            if let Ok(mut map) = running.map.lock() {
                map.remove(&id_w);
            }
        }

        let new_status = if stopped {
            Status::NotStarted
        } else {
            Status::NeedReview
        };
        set_status(&app_w, &id_w, new_status, |t| {
            if let Some(run) = t.run.as_mut() {
                run.ended_at = Some(now_ms());
                run.exit_code = code;
                run.ok = Some(ok);
            }
        });

        // Notifikasi OS saat run selesai natural (bukan di-stop manual oleh user).
        if !stopped {
            notify_finished(&app_w, &title_w, ok, code);
        }

        // Slot baru saja kosong → angkat task antrian berikutnya bila ada.
        schedule(&app_w);
    });

    Ok(())
}

/// Penjadwal antrian: angkat task berstatus Todo menjadi Doing selama masih ada
/// slot, menghormati batas konkurensi global `settings.max_concurrent`.
/// Dipanggil tiap kali task masuk antrian, sebuah run selesai, atau batas diubah.
pub fn schedule(app: &AppHandle) {
    let running = app.state::<Running>();
    // Hanya satu penjadwal yang boleh berjalan pada satu waktu.
    let _guard = match running.sched.lock() {
        Ok(g) => g,
        Err(_) => return,
    };

    loop {
        // Batas konkurensi terkini (minimal 1).
        let max = {
            let state = app.state::<AppState>();
            let s = match state.store.lock() {
                Ok(s) => s,
                Err(_) => return,
            };
            s.settings.max_concurrent.max(1)
        };
        // Slot terpakai = jumlah proses agent yang hidup.
        let used = match running.map.lock() {
            Ok(m) => m.len(),
            Err(_) => return,
        };
        if used >= max {
            break;
        }

        // Task antrian berikutnya: FIFO global (paling lama menunggu lebih dulu).
        let next = {
            let state = app.state::<AppState>();
            let s = match state.store.lock() {
                Ok(s) => s,
                Err(_) => return,
            };
            s.tasks
                .iter()
                .filter(|t| t.status == Status::Todo)
                .min_by(|a, b| {
                    a.updated_at
                        .cmp(&b.updated_at)
                        .then(a.created_at.cmp(&b.created_at))
                })
                .map(|t| t.id.clone())
        };
        let Some(id) = next else { break };

        if let Err(e) = start_task(app, &id) {
            // Gagal start (mis. CLI tak ditemukan) → keluarkan dari antrian agar
            // tidak nyangkut, beri tahu UI, lalu coba task berikutnya.
            set_status(app, &id, Status::NotStarted, |t| {
                if let Some(run) = t.run.as_mut() {
                    run.pid = None;
                }
            });
            let _ = app.emit("task://error", json!({ "taskId": id, "message": e }));
            continue;
        }
        // start_task sukses → `used` bertambah pada iterasi berikutnya.
    }
}

/// Kirim notifikasi OS saat sebuah run AI selesai. Menghormati setting
/// `notify_on_finish` (dibaca terkini); best-effort — kegagalan tampil diabaikan.
fn notify_finished(app: &AppHandle, title: &str, ok: bool, code: Option<i32>) {
    let enabled = {
        let state = app.state::<AppState>();
        let s = match state.store.lock() {
            Ok(s) => s,
            Err(_) => return,
        };
        s.settings.notify_on_finish
    };
    if !enabled {
        return;
    }

    let label = if title.trim().is_empty() {
        "(untitled)"
    } else {
        title.trim()
    };
    let (heading, body) = if ok {
        (
            "Task finished".to_string(),
            format!("{label} — completed successfully"),
        )
    } else {
        let c = code
            .map(|c| c.to_string())
            .unwrap_or_else(|| "?".to_string());
        (
            "Task failed".to_string(),
            format!("{label} — exited with code {c}"),
        )
    };

    let _ = app
        .notification()
        .builder()
        .title(heading)
        .body(body)
        .show();
}

/// Hentikan proses task (kill seluruh process tree).
pub fn stop_task(app: &AppHandle, task_id: &str) -> Result<(), String> {
    let pid = {
        let running = app.state::<Running>();
        let map = running.map.lock().map_err(|_| "running locked")?;
        match map.get(task_id) {
            Some(h) => {
                h.stop.store(true, Ordering::SeqCst);
                h.pid
            }
            None => return Err("task is not running".into()),
        }
    };
    kill_tree(pid);
    Ok(())
}

fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        let mut c = Command::new("taskkill");
        c.args(["/PID", &pid.to_string(), "/T", "/F"]);
        c.creation_flags(CREATE_NO_WINDOW);
        let _ = c.output();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
    }
}

/// Spawn thread pembaca pipe: tiap baris -> tulis ke log file + emit event.
fn spawn_reader<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    task_id: String,
    reader: R,
    stream: &'static str,
) {
    std::thread::spawn(move || {
        let buf = BufReader::new(reader);
        for line in buf.lines() {
            let Ok(line) = line else { break };
            let Some(text) = prettify(&line) else {
                continue;
            };
            // Tulis ke file log.
            if let Ok(path) = store::log_file(&app, &task_id) {
                if let Ok(mut f) = std::fs::OpenOptions::new()
                    .append(true)
                    .create(true)
                    .open(&path)
                {
                    let _ = writeln!(f, "{text}");
                }
            }
            // Emit ke frontend.
            let _ = app.emit(
                "task://log",
                json!({ "taskId": task_id, "stream": stream, "line": text }),
            );
        }
    });
}

/// Mutasi task di store + persist + emit perubahan status.
fn set_status<F: FnOnce(&mut Task)>(app: &AppHandle, task_id: &str, status: Status, f: F) {
    let mut payload_ok: Option<bool> = None;
    let mut payload_code: Option<i32> = None;
    // Mutasi di bawah lock, lalu clone untuk disimpan setelah lock dilepas.
    let snapshot = {
        let state = app.state::<AppState>();
        let mut guard = match state.store.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if let Some(t) = guard.tasks.iter_mut().find(|t| t.id == task_id) {
            t.status = status;
            t.updated_at = now_ms();
            f(t);
            if let Some(run) = t.run.as_ref() {
                payload_ok = run.ok;
                payload_code = run.exit_code;
            }
        }
        guard.clone()
    };
    let _ = store::save(app, &snapshot);
    let status_str = serde_json::to_value(status)
        .ok()
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    let _ = app.emit(
        "task://status",
        json!({ "taskId": task_id, "status": status_str, "ok": payload_ok, "exitCode": payload_code }),
    );
}

/// Best-effort ubah baris JSONL event jadi teks ringkas. None = baris di-skip.
fn prettify(line: &str) -> Option<String> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let v: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        // Bukan JSON (mis. stderr biasa) -> tampilkan apa adanya.
        Err(_) => return Some(line.to_string()),
    };

    if let Some(t) = v.get("type").and_then(|t| t.as_str()) {
        match t {
            "system" => {
                let sub = v.get("subtype").and_then(|s| s.as_str()).unwrap_or("");
                // Hanya tampilkan 'init'; lewati hook_started/hook_response (noise).
                if sub == "init" {
                    return Some("● session started".to_string());
                }
                return None;
            }
            "assistant" => return Some(extract_claude_message(&v).unwrap_or_else(|| "·".into())),
            "user" => return extract_tool_result(&v),
            "result" => {
                let res = v.get("result").and_then(|r| r.as_str()).unwrap_or("");
                let is_err = v.get("is_error").and_then(|b| b.as_bool()).unwrap_or(false);
                let mark = if is_err { "✘" } else { "✔" };
                return Some(format!("{mark} {res}").trim().to_string());
            }
            // --- Codex (JSONL) ---
            "thread.started" | "turn.started" | "turn.completed" => return None,
            "item.completed" | "item.started" => {
                if let Some(item) = v.get("item") {
                    let itype = item.get("type").and_then(|x| x.as_str()).unwrap_or("");
                    if let Some(s) = item.get("text").and_then(|x| x.as_str()) {
                        return Some(s.to_string());
                    }
                    if let Some(s) = item.get("command").and_then(|x| x.as_str()) {
                        return Some(format!("→ {s}"));
                    }
                    if let Some(s) = item.get("message").and_then(|x| x.as_str()) {
                        let prefix = if itype == "error" { "✘ " } else { "" };
                        return Some(format!("{prefix}{s}"));
                    }
                }
                return None;
            }
            _ => {}
        }
    }

    // Codex / generic: cari field teks umum.
    for key in ["text", "message", "result", "delta"] {
        if let Some(s) = v.get(key).and_then(|x| x.as_str()) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    if let Some(s) = v
        .get("item")
        .and_then(|i| i.get("text"))
        .and_then(|x| x.as_str())
    {
        return Some(s.to_string());
    }
    if let Some(msg) = v.get("msg") {
        if let Some(s) = msg.as_str() {
            return Some(s.to_string());
        }
        return Some(msg.to_string());
    }
    // Fallback: baris mentah.
    Some(line.to_string())
}

fn extract_claude_message(v: &Value) -> Option<String> {
    let content = v.get("message")?.get("content")?.as_array()?;
    let mut parts: Vec<String> = Vec::new();
    for block in content {
        match block.get("type").and_then(|t| t.as_str()) {
            Some("text") => {
                if let Some(s) = block.get("text").and_then(|t| t.as_str()) {
                    parts.push(s.to_string());
                }
            }
            Some("tool_use") => {
                let name = block.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                parts.push(format!("→ {name}"));
            }
            _ => {}
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n"))
    }
}

fn extract_tool_result(v: &Value) -> Option<String> {
    let content = v.get("message")?.get("content")?.as_array()?;
    for block in content {
        if block.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
            return Some("← hasil tool".to_string());
        }
    }
    None
}
