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
};

const CUSTOM = "__custom__";

// ---------- State ----------
let store = { workspaces: [], tasks: [], settings: { max_concurrent: 2 } };
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

// Posisi task dalam antrian global (FIFO by updated_at). 0 = tidak mengantre.
function queuePosition(taskId) {
  const queued = store.tasks
    .filter((t) => t.status === "todo")
    .sort(
      (a, b) =>
        (a.updated_at || 0) - (b.updated_at || 0) || (a.created_at || 0) - (b.created_at || 0)
    );
  const idx = queued.findIndex((t) => t.id === taskId);
  return idx === -1 ? 0 : idx + 1;
}

// ---------- Pemuatan state ----------
async function refreshState() {
  store = await invoke("load_state");
  if (!store.settings) store.settings = { max_concurrent: 2 };
  if (!store.workspaces.some((w) => w.id === activeWs)) {
    activeWs = store.workspaces[0]?.id || null;
  }
  const mc = $("#max-concurrent");
  if (mc) mc.value = maxConcurrent();
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
  const provBadge = `<span class="badge badge-${t.provider}">${t.provider === "claude" ? "Claude" : "Codex"}</span>`;
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
  });

  board.addEventListener("drop", async (e) => {
    const col = e.target.closest(".column");
    clearHighlight();
    if (!col) return;
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    await moveTask(id, col.dataset.status);
  });
}

function highlight(col) {
  document.querySelectorAll(".column").forEach((c) => c.classList.toggle("drag-over", c === col));
}
function clearHighlight() {
  document.querySelectorAll(".column").forEach((c) => c.classList.remove("drag-over"));
}

async function moveTask(id, status) {
  const task = store.tasks.find((t) => t.id === id);
  if (!task || task.status === status) return;
  if (status === "doing") {
    toast("Doing is system-managed — tasks enter it automatically when the agent runs.", true);
    return;
  }
  if (task.status === "doing") {
    toast("Task is running — stop it before moving.", true);
    return;
  }
  try {
    const updated = await invoke("set_task_status", {
      taskId: id,
      status,
      order: nextOrder(status),
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
    `<span class="badge badge-${t.provider}">${t.provider}</span>` +
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

// ---------- Init ----------
async function init() {
  setupUi();
  setupDnd();
  setupEvents();
  await refreshState();
}

window.addEventListener("DOMContentLoaded", init);
