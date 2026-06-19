use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    NotStarted,
    Todo,
    Doing,
    NeedReview,
    Done,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Claude,
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutoLevel {
    /// Bypass total approval & sandbox (paling otonom).
    FullBypass,
    /// Auto-edit dibatasi ke folder workspace.
    Sandboxed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RunInfo {
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub exit_code: Option<i32>,
    pub ok: Option<bool>,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    /// Instruksi/prompt yang dikirim ke agent.
    pub prompt: String,
    pub status: Status,
    pub provider: Provider,
    /// Model AI. String kosong = pakai default CLI.
    #[serde(default)]
    pub model: String,
    pub auto_level: AutoLevel,
    /// Urutan dalam kolom (pecahan agar mudah disisipkan di antara dua kartu).
    #[serde(default)]
    pub order: f64,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default)]
    pub run: Option<RunInfo>,
}

/// Bagian state yang dipersist ke disk.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Store {
    #[serde(default)]
    pub workspaces: Vec<Workspace>,
    #[serde(default)]
    pub tasks: Vec<Task>,
}
