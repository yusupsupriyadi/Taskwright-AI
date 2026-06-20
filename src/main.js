const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ---------- Konfigurasi ----------
const COLUMNS = [
  { key: "not_started", label: "Not Started" },
  { key: "todo", label: "Todo" },
  { key: "doing", label: "AI Running" },
  { key: "need_review", label: "Need Review" },
  { key: "done", label: "Done" },
];

const MODELS = {
  claude: ["(default)", "claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
  codex: ["(default)", "gpt-5-codex", "gpt-5", "o3", "o4-mini"],
  gemini: ["(default)", "gemini-2.5-pro", "gemini-2.5-flash"],
  // opencode pakai format model "provider/model"; cursor model name bebas — pakai Custom.
  opencode: ["(default)"],
  cursor: ["(default)"],
};

// Label tampilan tiap provider (key = nilai yang dikirim ke backend).
const PROVIDER_LABELS = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  opencode: "opencode",
  cursor: "Cursor",
};
const providerLabel = (p) => PROVIDER_LABELS[p] || p;

const CUSTOM = "__custom__";

// ---------- State ----------
let store = {
  workspaces: [],
  tasks: [],
  settings: { max_concurrent: 2, notify_on_finish: true, check_updates_on_launch: true, cli_paths: {} },
};
let activeWs = null; // id workspace aktif
let editingId = null; // id task yang sedang diedit (null = baru)
let drawerTaskId = null; // task yang terbuka di drawer
const logs = {}; // taskId -> array baris log

// ---------- Util ----------
const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 4000);
}

// Dialog konfirmasi reusable; resolve(true) bila user menyetujui, resolve(false) bila batal.
let confirmResolver = null;
function confirmDialog({ title = "Confirm", message = "", confirmLabel = "Confirm", danger = true } = {}) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;
    const okBtn = $("#confirm-ok");
    okBtn.textContent = confirmLabel;
    okBtn.classList.toggle("btn-danger", danger);
    okBtn.classList.toggle("btn-primary", !danger);
    $("#confirm-overlay").classList.remove("hidden");
    okBtn.focus();
  });
}

function closeConfirm(result) {
  if (!confirmResolver) return;
  $("#confirm-overlay").classList.add("hidden");
  const resolve = confirmResolver;
  confirmResolver = null;
  resolve(result);
}

function activeWorkspace() {
  return store.workspaces.find((w) => w.id === activeWs) || null;
}

function tasksIn(status) {
  return store.tasks
    .filter((t) => t.workspace_id === activeWs && t.status === status)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function nextOrder(status) {
  const orders = store.tasks
    .filter((t) => t.workspace_id === activeWs && t.status === status)
    .map((t) => t.order || 0);
  return (orders.length ? Math.max(...orders) : 0) + 1;
}

// Batas konkurensi global: jumlah agent AI yang boleh berjalan bersamaan.
function maxConcurrent() {
  return Math.max(1, store.settings?.max_concurrent || 1);
}

// Posisi task dalam antrian global. Mengikuti urutan visual (field order) agar
// badge #n cocok dengan urutan eksekusi penjadwal. 0 = tidak mengantre.
function queuePosition(taskId) {
  const queued = store.tasks
    .filter((t) => t.status === "todo")
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.created_at || 0) - (b.created_at || 0));
  const idx = queued.findIndex((t) => t.id === taskId);
  return idx === -1 ? 0 : idx + 1;
}

// ---------- Pemuatan state ----------
async function refreshState() {
  store = await invoke("load_state");
  if (!store.settings)
    store.settings = { max_concurrent: 2, notify_on_finish: true, check_updates_on_launch: true, cli_paths: {} };
  if (!store.settings.cli_paths) store.settings.cli_paths = {};
  if (!store.workspaces.some((w) => w.id === activeWs)) {
    activeWs = store.workspaces[0]?.id || null;
  }
  const mc = $("#max-concurrent");
  if (mc) mc.value = maxConcurrent();
  const nf = $("#notify-on-finish");
  if (nf) nf.checked = store.settings.notify_on_finish !== false;
  render();
}

// ---------- Render ----------
function render() {
  renderWorkspaces();
  renderBoard();
  const hasWs = store.workspaces.length > 0;
  $("#empty-state").classList.toggle("hidden", hasWs);
  $("#board").classList.toggle("hidden", !hasWs);
  $("#task-new").disabled = !hasWs;
  $("#ws-remove").disabled = !activeWs;
}

function renderWorkspaces() {
  const sel = $("#ws-select");
  sel.innerHTML = store.workspaces
    .map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`)
    .join("");
  if (activeWs) sel.value = activeWs;
  const ws = activeWorkspace();
  $("#ws-path").textContent = ws ? ws.path : "";
  $("#ws-path").title = ws ? ws.path : "";
}

function renderBoard() {
  const board = $("#board");
  board.innerHTML = COLUMNS.map((col) => {
    const items = tasksIn(col.key);
    const cards = items.map(cardHTML).join("");
    // Kolom AI Running menampilkan "terpakai / batas" agar batas konkurensi terlihat.
    const count =
      col.key === "doing" ? `${items.length} / ${maxConcurrent()}` : `${items.length}`;
    return `
      <section class="column col-${col.key}" data-status="${col.key}">
        <div class="column-head">
          <span class="column-dot"></span>
          <span>${col.label}</span>
          <span class="column-count">${count}</span>
        </div>
        <div class="column-body">${cards}</div>
      </section>`;
  }).join("");
}

function cardHTML(t) {
  const provBadge = `<span class="badge badge-${t.provider}">${esc(providerLabel(t.provider))}</span>`;
  const modelBadge = t.model ? `<span class="badge badge-model">${esc(t.model)}</span>` : "";
  const autoBadge = `<span class="badge badge-auto">${t.auto_level === "full_bypass" ? "full" : "sandbox"}</span>`;
  // Badge posisi antrian hanya untuk kartu di kolom Todo (menunggu giliran).
  const queueBadge =
    t.status === "todo"
      ? `<span class="badge badge-queue" title="Position in the run queue">#${queuePosition(t.id)}</span>`
      : "";
  const doneBtn =
    t.status === "need_review"
      ? `<button class="card-done" data-done="${esc(t.id)}" title="Mark as done">✓ Done</button>`
      : "";
  return `
    <article class="card" draggable="true" data-id="${esc(t.id)}">
      <div class="card-title">${esc(t.title) || "(untitled)"}</div>
      <div class="card-foot">
        ${queueBadge}${provBadge}${modelBadge}${autoBadge}
        <span class="card-status">${statusIcon(t)}</span>
        ${doneBtn}
      </div>
    </article>`;
}

function statusIcon(t) {
  if (t.status === "doing") return `<span class="spinner"></span>`;
  if (t.status === "need_review" && t.run) {
    if (t.run.ok === true) return `<span class="tick-ok" title="exit 0">✓</span>`;
    if (t.run.ok === false)
      return `<span class="tick-fail" title="exit ${t.run.exit_code ?? "?"}">✕</span>`;
  }
  return "";
}

// ---------- Drag & drop ----------
function setupDnd() {
  const board = $("#board");

  board.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    e.dataTransfer.setData("text/plain", card.dataset.id);
    e.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging");
  });

  board.addEventListener("dragend", (e) => {
    e.target.closest(".card")?.classList.remove("dragging");
    clearHighlight();
  });

  board.addEventListener("dragover", (e) => {
    const col = e.target.closest(".column");
    if (!col) return;
    // Kolom Doing dikelola sistem: bukan zona drop. Tanpa preventDefault, drop
    // tidak terpicu di sini dan kursor menampilkan "tidak boleh".
    if (col.dataset.status === "doing") {
      e.dataTransfer.dropEffect = "none";
      clearHighlight();
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    highlight(col);
    // Indikator garis menunjukkan posisi sisip persis dari posisi kursor, sehingga
    // drop bisa menaruh kartu di antara dua kartu (reorder atas/bawah).
    showDropIndicator(col, e.clientY);
  });

  board.addEventListener("drop", async (e) => {
    const col = e.target.closest(".column");
    if (!col || col.dataset.status === "doing") {
      clearHighlight();
      return;
    }
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    // Hitung order tujuan dari posisi kursor SEBELUM indikator dibersihkan.
    const order = dropOrder(col, e.clientY, id);
    clearHighlight();
    await moveTask(id, col.dataset.status, order);
  });
}

function highlight(col) {
  document.querySelectorAll(".column").forEach((c) => c.classList.toggle("drag-over", c === col));
}
function clearHighlight() {
  document.querySelectorAll(".column").forEach((c) => c.classList.remove("drag-over"));
  removeDropIndicators();
}

// Sisipkan/posisikan indikator garis di .column-body sesuai posisi kursor.
function showDropIndicator(col, clientY) {
  removeDropIndicators();
  const body = col.querySelector(".column-body");
  if (!body) return;
  const ind = document.createElement("div");
  ind.className = "drop-indicator";
  const before = cardBeforeY(body, clientY);
  if (before) body.insertBefore(ind, before);
  else body.appendChild(ind);
}

function removeDropIndicators() {
  document.querySelectorAll(".drop-indicator").forEach((el) => el.remove());
}

// Kartu pertama (selain yang sedang di-drag) yang titik-tengah vertikalnya berada
// di bawah kursor; null berarti kursor di bawah semua kartu (sisip di akhir).
function cardBeforeY(body, clientY) {
  const cards = [...body.querySelectorAll(".card:not(.dragging)")];
  return (
    cards.find((c) => {
      const r = c.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    }) || null
  );
}

// Nilai order baru untuk kartu yang di-drop, dihitung dari tetangga di titik sisip.
// order bertipe pecahan (f64 di backend) sehingga bisa disisipkan di antara dua nilai.
function dropOrder(col, clientY, draggedId) {
  const body = col.querySelector(".column-body");
  if (!body) return nextOrder(col.dataset.status);
  const before = cardBeforeY(body, clientY);
  const items = tasksIn(col.dataset.status).filter((t) => t.id !== draggedId);
  let idx = before ? items.findIndex((t) => t.id === before.dataset.id) : items.length;
  if (idx === -1) idx = items.length;
  const prev = items[idx - 1];
  const next = items[idx];
  if (!prev && !next) return 1; // kolom kosong
  if (!prev) return (next.order || 0) - 1; // sisip di awal
  if (!next) return (prev.order || 0) + 1; // sisip di akhir
  return ((prev.order || 0) + (next.order || 0)) / 2; // sisip di tengah
}

async function moveTask(id, status, order) {
  const task = store.tasks.find((t) => t.id === id);
  if (!task) return;
  if (status === "doing") {
    toast("Doing is system-managed — tasks enter it automatically when the agent runs.", true);
    return;
  }
  if (task.status === "doing") {
    toast("Task is running — stop it before moving.", true);
    return;
  }
  // Reorder di kolom yang sama ke posisi yang sama → tidak perlu round-trip.
  if (task.status === status && (order == null || order === task.order)) return;
  try {
    const updated = await invoke("set_task_status", {
      taskId: id,
      status,
      order: order == null ? nextOrder(status) : order,
    });
    Object.assign(task, updated);
    render();
    if (status === "todo") {
      toast(
        updated.status === "doing"
          ? `Running "${task.title}"…`
          : `Queued "${task.title}" (#${queuePosition(task.id)}) — runs when a slot frees up.`
      );
    }
  } catch (err) {
    toast(String(err), true);
    await refreshState();
  }
}

// ---------- Modal task ----------
function populateModels(provider, selected) {
  const sel = $("#f-model");
  const list = MODELS[provider] || [];
  sel.innerHTML =
    list
      .map((m) => `<option value="${m === "(default)" ? "" : esc(m)}">${esc(m)}</option>`)
      .join("") + `<option value="${CUSTOM}">Custom…</option>`;

  const known = list.map((m) => (m === "(default)" ? "" : m));
  if (selected && !known.includes(selected)) {
    sel.value = CUSTOM;
    $("#f-model-custom").value = selected;
    $("#f-model-custom-wrap").classList.remove("hidden");
  } else {
    sel.value = selected ?? "";
    $("#f-model-custom").value = "";
    $("#f-model-custom-wrap").classList.add("hidden");
  }
}

function openModal(task) {
  if (!activeWs && !task) {
    toast("Add a workspace first.", true);
    return;
  }
  editingId = task ? task.id : null;
  $("#modal-title").textContent = task ? "Edit Task" : "New Task";
  $("#f-title").value = task?.title || "";
  $("#f-prompt").value = task?.prompt || "";
  $("#f-provider").value = task?.provider || "claude";
  $("#f-auto").value = task?.auto_level || "full_bypass";
  populateModels($("#f-provider").value, task?.model || "");
  $("#f-delete").classList.toggle("hidden", !task);
  $("#modal-overlay").classList.remove("hidden");
  $("#f-title").focus();
}

function closeModal() {
  $("#modal-overlay").classList.add("hidden");
  editingId = null;
}

function chosenModel() {
  const v = $("#f-model").value;
  if (v === CUSTOM) return $("#f-model-custom").value.trim();
  return v; // "" untuk default
}

async function saveModal() {
  const title = $("#f-title").value.trim();
  if (!title) {
    toast("Title is required.", true);
    $("#f-title").focus();
    return;
  }
  const prompt = $("#f-prompt").value.trim();
  if (!prompt) {
    toast("Prompt is required — describe the task for the agent.", true);
    $("#f-prompt").focus();
    return;
  }
  const payload = {
    title,
    prompt,
    provider: $("#f-provider").value,
    model: chosenModel(),
    autoLevel: $("#f-auto").value,
  };
  try {
    if (editingId) {
      await invoke("update_task", { id: editingId, ...payload });
    } else {
      await invoke("create_task", { workspaceId: activeWs, ...payload });
    }
    closeModal();
    await refreshState();
    if (drawerTaskId) openDrawer(drawerTaskId); // segarkan drawer bila terbuka
  } catch (err) {
    toast(String(err), true);
  }
}

// ---------- Drawer detail/log ----------
async function openDrawer(id) {
  const t = store.tasks.find((x) => x.id === id);
  if (!t) return;
  drawerTaskId = id;
  $("#d-title").textContent = t.title || "(untitled)";
  $("#d-meta").innerHTML =
    `<span class="badge badge-${t.provider}">${esc(providerLabel(t.provider))}</span>` +
    (t.model ? `<span class="badge badge-model">${esc(t.model)}</span>` : "") +
    `<span class="badge badge-auto">${t.auto_level === "full_bypass" ? "full bypass" : "sandboxed"}</span>` +
    `<span class="badge badge-model">${t.status}</span>`;
  $("#d-prompt").textContent = t.prompt || "(empty)";
  updateDrawerButtons(t);

  // Tab default: log.
  switchTab("log");
  $("#d-diffbox").textContent = "";
  try {
    const text = await invoke("get_task_log", { taskId: id });
    logs[id] = text ? text.split("\n") : [];
  } catch {
    logs[id] = logs[id] || [];
  }
  renderLog(id);

  $("#drawer-overlay").classList.remove("hidden");
}

function updateDrawerButtons(t) {
  const running = t.status === "doing";
  $("#d-run").disabled = running;
  $("#d-run").textContent = t.run ? "▶ Re-run" : "▶ Run";
  $("#d-stop").disabled = !running;
  $("#d-done").classList.toggle("hidden", t.status !== "need_review");
  const badge = $("#d-meta").querySelector(".badge:last-child");
  if (badge) badge.textContent = t.status;
}

async function markDone(id) {
  const t = store.tasks.find((x) => x.id === id);
  if (!t) return;
  try {
    const updated = await invoke("set_task_status", {
      taskId: id,
      status: "done",
      order: nextOrder("done"),
    });
    Object.assign(t, updated);
    render();
    if (drawerTaskId === id) updateDrawerButtons(t);
    toast("Task marked as done.");
  } catch (err) {
    toast(String(err), true);
  }
}

function renderLog(id) {
  const box = $("#d-log");
  box.textContent = (logs[id] || []).join("\n");
  box.scrollTop = box.scrollHeight;
}

function closeDrawer() {
  $("#drawer-overlay").classList.add("hidden");
  drawerTaskId = null;
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $("#d-log").classList.toggle("hidden", name !== "log");
  $("#d-diffbox").classList.toggle("hidden", name !== "diff");
}

async function showDiff() {
  if (!drawerTaskId) return;
  switchTab("diff");
  $("#d-diffbox").textContent = "loading diff…";
  try {
    const diff = await invoke("get_task_diff", { taskId: drawerTaskId });
    $("#d-diffbox").textContent = diff || "(empty)";
  } catch (err) {
    $("#d-diffbox").textContent = String(err);
  }
}

// ---------- Event dari backend ----------
function setupEvents() {
  listen("task://log", (e) => {
    const { taskId, line } = e.payload;
    (logs[taskId] ||= []).push(line);
    if (drawerTaskId === taskId && !$("#d-log").classList.contains("hidden")) {
      renderLog(taskId);
    }
  });

  listen("task://status", (e) => {
    const { taskId, status, ok, exitCode } = e.payload;
    const t = store.tasks.find((x) => x.id === taskId);
    if (!t) return;
    t.status = status;
    if (ok !== null && ok !== undefined) {
      t.run = t.run || {};
      t.run.ok = ok;
      t.run.exit_code = exitCode;
    }
    render();
    if (drawerTaskId === taskId) updateDrawerButtons(t);
  });

  // Penjadwal gagal menjalankan task (mis. CLI tak ditemukan) → task kembali ke
  // Not Started, beri tahu user lewat toast.
  listen("task://error", (e) => {
    const { message } = e.payload || {};
    toast(String(message || "Failed to start task."), true);
  });
}

// ---------- Wiring UI ----------
function setupUi() {
  $("#ws-select").addEventListener("change", (e) => {
    activeWs = e.target.value;
    render();
  });

  // Setting batas konkurensi: simpan ke backend lalu jadwalkan ulang antrian.
  $("#max-concurrent").addEventListener("change", async (e) => {
    const v = Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1));
    e.target.value = v;
    try {
      const settings = await invoke("set_max_concurrent", { value: v });
      store.settings = settings;
      render();
      toast(`Max concurrent AI set to ${settings.max_concurrent}.`);
    } catch (err) {
      toast(String(err), true);
      await refreshState();
    }
  });

  // Setting notifikasi: simpan preferensi tampil notifikasi saat run selesai.
  $("#notify-on-finish").addEventListener("change", async (e) => {
    const value = e.target.checked;
    try {
      const settings = await invoke("set_notify_on_finish", { value });
      store.settings = settings;
      toast(value ? "Finish notifications enabled." : "Finish notifications disabled.");
    } catch (err) {
      toast(String(err), true);
      await refreshState();
    }
  });

  const addWs = async () => {
    try {
      const path = await invoke("pick_folder");
      if (!path) return;
      const ws = await invoke("add_workspace", { path });
      activeWs = ws.id;
      await refreshState();
      toast(`Workspace "${ws.name}" added.`);
    } catch (err) {
      toast(String(err), true);
    }
  };
  $("#ws-add").addEventListener("click", addWs);
  $("#empty-add").addEventListener("click", addWs);

  $("#ws-remove").addEventListener("click", async () => {
    if (!activeWs) return;
    const ws = activeWorkspace();
    const taskCount = store.tasks.filter((t) => t.workspace_id === activeWs).length;
    const taskNote =
      taskCount > 0
        ? ` Its ${taskCount} task${taskCount === 1 ? "" : "s"} will also be removed.`
        : "";
    const ok = await confirmDialog({
      title: "Remove workspace",
      message:
        `Remove "${ws?.name}" from Taskwright?${taskNote}` +
        " The folder and its files on disk are not deleted.",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await invoke("remove_workspace", { id: activeWs });
      await refreshState();
      toast(`Workspace "${ws?.name}" removed.`);
    } catch (err) {
      toast(String(err), true);
    }
  });

  $("#task-new").addEventListener("click", () => openModal(null));

  // ----- Settings panel -----
  $("#open-settings").addEventListener("click", openSettings);
  $("#settings-close").addEventListener("click", closeSettings);
  $("#settings-done").addEventListener("click", closeSettings);
  $("#settings-overlay").addEventListener("click", (e) => {
    if (e.target.id === "settings-overlay") closeSettings();
  });
  document
    .querySelectorAll(".settings-tab")
    .forEach((tab) => tab.addEventListener("click", () => switchSettingsTab(tab.dataset.stab)));

  // General: tiap kontrol simpan seluruh objek settings (menjaga cli_paths).
  $("#set-max-concurrent").addEventListener("change", async (e) => {
    const v = Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1));
    e.target.value = v;
    store.settings.max_concurrent = v;
    if (await applySettings()) toast(`Max concurrent AI set to ${store.settings.max_concurrent}.`);
  });
  $("#set-notify-on-finish").addEventListener("change", async (e) => {
    store.settings.notify_on_finish = e.target.checked;
    if (await applySettings())
      toast(e.target.checked ? "Finish notifications enabled." : "Finish notifications disabled.");
  });
  $("#set-check-updates").addEventListener("change", async (e) => {
    store.settings.check_updates_on_launch = e.target.checked;
    if (await applySettings())
      toast(e.target.checked ? "Update check on launch enabled." : "Update check on launch disabled.");
  });

  // Providers / CLI
  $("#cli-recheck").addEventListener("click", refreshCliList);
  $("#cli-list").addEventListener("change", async (e) => {
    const input = e.target.closest(".cli-path-input");
    if (!input) return;
    const prov = input.dataset.prov;
    const val = input.value.trim();
    store.settings.cli_paths = store.settings.cli_paths || {};
    if (val) store.settings.cli_paths[prov] = val;
    else delete store.settings.cli_paths[prov];
    if (await applySettings()) {
      await refreshCliList();
      toast(
        val
          ? `Custom path set for ${providerLabel(prov)}.`
          : `Custom path cleared for ${providerLabel(prov)}.`
      );
    }
  });

  // Data & About
  $("#open-data-dir").addEventListener("click", async () => {
    const path = $("#about-data-dir").dataset.path;
    if (!path) return;
    try {
      await invoke("open_external", { target: path });
    } catch (err) {
      toast(String(err), true);
    }
  });
  $("#clear-logs").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Clear all logs",
      message:
        "Delete all saved agent run logs? Logs of currently running tasks are kept. This cannot be undone.",
      confirmLabel: "Clear logs",
    });
    if (!ok) return;
    try {
      const n = await invoke("clear_logs");
      toast(`Cleared ${n} log file${n === 1 ? "" : "s"}.`);
    } catch (err) {
      toast(String(err), true);
    }
  });
  $(".settings-links").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-link]");
    if (!btn) return;
    try {
      await invoke("open_external", { target: btn.dataset.link });
    } catch (err) {
      toast(String(err), true);
    }
  });

  // Confirmation dialog
  $("#confirm-ok").addEventListener("click", () => closeConfirm(true));
  $("#confirm-cancel").addEventListener("click", () => closeConfirm(false));
  $("#confirm-close").addEventListener("click", () => closeConfirm(false));
  $("#confirm-overlay").addEventListener("click", (e) => {
    if (e.target.id === "confirm-overlay") closeConfirm(false);
  });

  // Modal
  $("#modal-close").addEventListener("click", closeModal);
  $("#f-cancel").addEventListener("click", closeModal);
  $("#f-save").addEventListener("click", saveModal);
  $("#modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  $("#f-provider").addEventListener("change", (e) => populateModels(e.target.value, ""));
  $("#f-model").addEventListener("change", (e) => {
    $("#f-model-custom-wrap").classList.toggle("hidden", e.target.value !== CUSTOM);
  });
  $("#f-delete").addEventListener("click", async () => {
    if (!editingId) return;
    await deleteTask(editingId);
    closeModal();
  });

  // Board: klik tombol Done di kartu, atau buka drawer
  $("#board").addEventListener("click", (e) => {
    const done = e.target.closest("[data-done]");
    if (done) {
      e.stopPropagation();
      markDone(done.dataset.done);
      return;
    }
    const card = e.target.closest(".card");
    if (card) openDrawer(card.dataset.id);
  });

  // Drawer
  $("#d-close").addEventListener("click", closeDrawer);
  $("#drawer-overlay").addEventListener("click", (e) => {
    if (e.target.id === "drawer-overlay") closeDrawer();
  });
  $("#d-run").addEventListener("click", async () => {
    if (!drawerTaskId) return;
    try {
      const updated = await invoke("run_task", { taskId: drawerTaskId });
      const t = store.tasks.find((x) => x.id === drawerTaskId);
      if (t) Object.assign(t, updated);
      logs[drawerTaskId] = [];
      renderLog(drawerTaskId);
      render();
      if (t) updateDrawerButtons(t);
      toast(
        updated.status === "doing"
          ? `Running "${updated.title}"…`
          : `Queued "${updated.title}" (#${queuePosition(updated.id)}) — runs when a slot frees up.`
      );
    } catch (err) {
      toast(String(err), true);
    }
  });
  $("#d-stop").addEventListener("click", async () => {
    if (!drawerTaskId) return;
    try {
      await invoke("stop_task", { taskId: drawerTaskId });
    } catch (err) {
      toast(String(err), true);
    }
  });
  $("#d-done").addEventListener("click", () => {
    if (drawerTaskId) markDone(drawerTaskId);
  });
  $("#d-diff").addEventListener("click", showDiff);
  $("#d-edit").addEventListener("click", () => {
    const t = store.tasks.find((x) => x.id === drawerTaskId);
    if (t) openModal(t);
  });
  $("#d-delete").addEventListener("click", async () => {
    if (drawerTaskId) {
      await deleteTask(drawerTaskId);
      closeDrawer();
    }
  });
  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
      if (tab.dataset.tab === "diff") showDiff();
    })
  );

  // Esc menutup confirm/modal/drawer; Enter mengonfirmasi dialog yang terbuka
  document.addEventListener("keydown", (e) => {
    const confirmOpen = !$("#confirm-overlay").classList.contains("hidden");
    if (e.key === "Escape") {
      if (confirmOpen) closeConfirm(false);
      else if (!$("#settings-overlay").classList.contains("hidden")) closeSettings();
      else if (!$("#modal-overlay").classList.contains("hidden")) closeModal();
      else if (!$("#drawer-overlay").classList.contains("hidden")) closeDrawer();
    } else if (e.key === "Enter" && confirmOpen) {
      e.preventDefault();
      closeConfirm(true);
    }
  });
}

async function deleteTask(id) {
  try {
    await invoke("delete_task", { id });
    await refreshState();
    toast("Task removed.");
  } catch (err) {
    toast(String(err), true);
  }
}

// ---------- Settings panel ----------
function openSettings() {
  // Isi kontrol General dari state terkini.
  $("#set-max-concurrent").value = maxConcurrent();
  $("#set-notify-on-finish").checked = store.settings.notify_on_finish !== false;
  $("#set-check-updates").checked = store.settings.check_updates_on_launch !== false;
  switchSettingsTab("general");
  loadAboutInfo();
  refreshCliList();
  $("#settings-overlay").classList.remove("hidden");
}

function closeSettings() {
  $("#settings-overlay").classList.add("hidden");
}

function switchSettingsTab(name) {
  document
    .querySelectorAll(".settings-tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.stab === name));
  document
    .querySelectorAll(".settings-panel")
    .forEach((p) => p.classList.toggle("hidden", p.dataset.spanel !== name));
}

// Kirim seluruh objek settings ke backend (menjaga field yang tak diubah, mis.
// cli_paths) lalu sinkronkan kontrol cepat di topbar + render ulang board.
async function applySettings() {
  try {
    const settings = await invoke("update_settings", { settings: store.settings });
    store.settings = settings;
    const mc = $("#max-concurrent");
    if (mc) mc.value = maxConcurrent();
    const nf = $("#notify-on-finish");
    if (nf) nf.checked = store.settings.notify_on_finish !== false;
    render();
    return true;
  } catch (err) {
    toast(String(err), true);
    await refreshState();
    return false;
  }
}

// Render daftar deteksi CLI di tab Providers.
async function refreshCliList() {
  const box = $("#cli-list");
  if (!box) return;
  box.innerHTML = `<div class="settings-hint">Checking…</div>`;
  let list = [];
  try {
    list = await invoke("check_clis");
  } catch (err) {
    box.innerHTML = `<div class="cli-status cli-bad">${esc(String(err))}</div>`;
    return;
  }
  box.innerHTML = list.map(cliRowHTML).join("");
}

function cliRowHTML(c) {
  const label = providerLabel(c.provider);
  const custom = store.settings.cli_paths?.[c.provider] || "";
  const status = c.found
    ? `<span class="cli-status cli-ok" title="${esc(c.path || "")}">✓ ${esc(c.path || "found")}</span>`
    : `<span class="cli-status cli-bad">✕ not found (${esc(c.bin)})</span>`;
  return `
    <div class="cli-row">
      <div class="cli-row-head">
        <span class="cli-name">${esc(label)}</span>
        ${status}
      </div>
      <input
        class="cli-path-input"
        type="text"
        data-prov="${esc(c.provider)}"
        value="${esc(custom)}"
        placeholder="Custom path to ${esc(c.bin)} (optional)"
      />
    </div>`;
}

// Isi tab Data & About dari backend.
async function loadAboutInfo() {
  try {
    const info = await invoke("system_info");
    $("#about-name").textContent = info.app_name || "Taskwright AI";
    $("#about-version").textContent = info.version || "—";
    $("#about-id").textContent = info.identifier || "—";
    const dd = $("#about-data-dir");
    dd.textContent = info.data_dir || "—";
    dd.title = info.data_dir || "";
    dd.dataset.path = info.data_dir || "";
  } catch (err) {
    toast(String(err), true);
  }
}

// ---------- Auto-update ----------
// Frontend-driven via Tauri updater + process plugins (akses lewat global
// window.__TAURI__ karena withGlobalTauri=true). Cek senyap sekali saat launch,
// plus tombol "Updates" manual di topbar.
let pendingUpdate = null; // objek Update dari check()
let launchCheckDone = false;
let updateBusy = false;

function updateEls() {
  return {
    banner: $("#update-banner"),
    text: $("#update-banner-text"),
    progress: $("#update-progress"),
    bar: $("#update-progress-bar"),
    install: $("#update-install"),
    restart: $("#update-restart"),
  };
}

function showUpdateBanner(update) {
  pendingUpdate = update;
  const e = updateEls();
  e.text.textContent = `Versi ${update.version} tersedia (saat ini ${update.currentVersion}).`;
  e.progress.classList.add("hidden");
  e.bar.style.width = "0%";
  e.install.classList.remove("hidden");
  e.install.disabled = false;
  e.restart.classList.add("hidden");
  e.banner.classList.remove("hidden");
}

function hideUpdateBanner() {
  updateEls().banner.classList.add("hidden");
}

// Cek update. silent=true → diam total bila gagal/tidak ada (dipakai saat launch,
// agar offline / dijalankan di luar Tauri tidak memunculkan error).
async function checkForUpdates(silent = false) {
  const updater = window.__TAURI__?.updater;
  if (!updater || typeof updater.check !== "function") {
    if (!silent) toast("Updater tidak tersedia di lingkungan ini.", true);
    return;
  }
  try {
    const update = await updater.check();
    if (update) {
      showUpdateBanner(update);
    } else if (!silent) {
      toast("Kamu sudah memakai versi terbaru.");
    }
  } catch (err) {
    if (!silent) toast(`Gagal memeriksa update: ${err}`, true);
  }
}

async function downloadAndInstallUpdate() {
  if (!pendingUpdate || updateBusy) return;
  updateBusy = true;
  const e = updateEls();
  e.install.disabled = true;
  e.progress.classList.remove("hidden");
  let total = 0;
  let downloaded = 0;
  try {
    await pendingUpdate.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data?.contentLength || 0;
          e.text.textContent = "Mengunduh update…";
          break;
        case "Progress":
          downloaded += event.data?.chunkLength || 0;
          if (total > 0) {
            const pct = Math.min(100, Math.round((downloaded / total) * 100));
            e.bar.style.width = `${pct}%`;
            e.text.textContent = `Mengunduh update… ${pct}%`;
          }
          break;
        case "Finished":
          e.bar.style.width = "100%";
          break;
      }
    });
    e.progress.classList.add("hidden");
    e.text.textContent = "Update terpasang. Restart untuk menerapkannya.";
    e.restart.classList.remove("hidden");
  } catch (err) {
    e.progress.classList.add("hidden");
    e.install.disabled = false;
    e.text.textContent = `Gagal memasang update: ${err}`;
    toast(`Gagal memasang update: ${err}`, true);
  } finally {
    updateBusy = false;
  }
}

async function restartForUpdate() {
  const proc = window.__TAURI__?.process;
  if (!proc || typeof proc.relaunch !== "function") return;
  try {
    await proc.relaunch();
  } catch (err) {
    toast(`Gagal me-restart aplikasi: ${err}`, true);
  }
}

function setupUpdater() {
  $("#check-updates")?.addEventListener("click", () => checkForUpdates(false));
  $("#update-install")?.addEventListener("click", downloadAndInstallUpdate);
  $("#update-restart")?.addEventListener("click", restartForUpdate);
  $("#update-dismiss")?.addEventListener("click", hideUpdateBanner);
}

// ---------- Init ----------
async function init() {
  setupUi();
  setupDnd();
  setupEvents();
  setupUpdater();
  await refreshState();
  // Cek update senyap sekali saat launch, hanya bila diizinkan oleh setting.
  if (!launchCheckDone && store.settings.check_updates_on_launch !== false) {
    launchCheckDone = true;
    checkForUpdates(true);
  }
}

window.addEventListener("DOMContentLoaded", init);
