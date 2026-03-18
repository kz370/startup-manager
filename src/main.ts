import {
  AppEntry,
  getApps,
  addApp,
  removeApp,
  updateApp,
  runAllApps,
  runSpecificApps,
  stopSpecificApps,
  deleteSpecificApps,
  getRunningStatus,
  exportSettings,
  importSettings,
} from "./api";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";

let apps: AppEntry[] = [];
let editIndex: number | null = null;
let selectedIndices = new Set<number>();
let runningStatus: boolean[] = [];
let statusPollTimer: ReturnType<typeof setInterval> | null = null;

const POLL_MS = 10_000;

function emptyApp(): AppEntry {
  return { Name: "", Path: "", Process: "", Args: "" };
}

function fileNameFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "";
}

function displayProcess(app: AppEntry): string {
  const p = app.Process.trim();
  if (p) return p;
  const f = fileNameFromPath(app.Path);
  return f || "—";
}

function showToast(msg: string, type: "success" | "error" | "info" = "info") {
  const container = document.getElementById("toast-container")!;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

async function refreshRunningStatus() {
  try {
    runningStatus = await getRunningStatus();
    apps.forEach((_, i) => {
      const dot = document.getElementById(`status-dot-${i}`);
      const btn = document.getElementById(`startstop-${i}`);
      const running = runningStatus[i] ?? false;
      if (dot) {
        dot.className = `status-dot ${running ? "running" : "stopped"}`;
        dot.title = running ? "Running" : "Not running";
      }
      if (btn) {
        btn.className = `btn-tile ${running ? "btn-tile-stop" : "btn-tile-start"}`;
        btn.textContent = running ? "Stop" : "Start";
        btn.title = running ? "Stop" : "Start";
      }
    });
  } catch {
    /* ignore poll errors */
  }
}

function startPolling() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  statusPollTimer = setInterval(refreshRunningStatus, POLL_MS);
}

function updateBatchToolbar() {
  const toolbar = document.getElementById("batch-toolbar")!;
  const countLabel = document.getElementById("batch-count")!;
  const selectAll = document.getElementById("cb-select-all") as HTMLInputElement | null;

  if (selectedIndices.size > 0) {
    toolbar.classList.add("visible");
    countLabel.textContent = `${selectedIndices.size} selected`;
  } else {
    toolbar.classList.remove("visible");
  }

  if (selectAll && apps.length > 0) {
    if (selectedIndices.size === apps.length) {
      selectAll.checked = true;
      selectAll.indeterminate = false;
    } else if (selectedIndices.size > 0) {
      selectAll.checked = false;
      selectAll.indeterminate = true;
    } else {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
  }
}

function truncPath(p: string, max = 56): string {
  if (p.length <= max) return p;
  return "…" + p.slice(-(max - 1));
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

function renderList() {
  const list = document.getElementById("app-list")!;
  const countEl = document.getElementById("app-count")!;
  countEl.textContent = `${apps.length} app${apps.length !== 1 ? "s" : ""}`;

  if (apps.length === 0) {
    selectedIndices.clear();
    list.innerHTML = `<li class="empty-state">
      <p>No apps yet.</p>
      <p class="empty-hint">Add an executable to build your list, then start or stop it anytime.</p>
    </li>`;
    updateBatchToolbar();
    return;
  }

  const selectAllHtml = `<li class="list-toolbar" role="presentation">
    <label class="select-all-label">
      <input type="checkbox" id="cb-select-all" title="Select all" />
      <span>Select all</span>
    </label>
  </li>`;

  const items = apps
    .map((app, i) => {
      const running = runningStatus[i] ?? false;
      const proc = displayProcess(app);
      const procNote = app.Process.trim() ? "" : ' <span class="proc-default">(from path)</span>';
      return `<li class="app-card ${selectedIndices.has(i) ? "app-card-selected" : ""}" data-idx="${i}">
        <label class="card-check">
          <input type="checkbox" class="cb-select" data-idx="${i}" ${selectedIndices.has(i) ? "checked" : ""} />
        </label>
        <span class="status-dot ${running ? "running" : "stopped"}" id="status-dot-${i}" title="${running ? "Running" : "Not running"}"></span>
        <div class="card-body">
          <div class="card-title">${esc(app.Name)}</div>
          <div class="card-meta">
            <code>${esc(proc)}</code>${procNote}
            <span class="meta-sep">·</span>
            <span class="card-path" title="${esc(app.Path)}">${esc(truncPath(app.Path))}</span>
          </div>
        </div>
        <div class="card-actions">
          <button type="button" class="btn-tile ${running ? "btn-tile-stop" : "btn-tile-start"}" data-idx="${i}" id="startstop-${i}" title="${running ? "Stop" : "Start"}">${running ? "Stop" : "Start"}</button>
          <button type="button" class="btn-tile btn-tile-ghost" data-idx="${i}" id="edit-${i}" title="Edit">Edit</button>
          <button type="button" class="btn-tile btn-tile-danger" data-idx="${i}" id="delete-${i}" title="Remove from list">Remove</button>
        </div>
      </li>`;
    })
    .join("");

  list.innerHTML = selectAllHtml + items;

  const selectAll = document.getElementById("cb-select-all") as HTMLInputElement;
  selectAll.addEventListener("change", () => {
    if (selectAll.checked) {
      apps.forEach((_, i) => selectedIndices.add(i));
    } else {
      selectedIndices.clear();
    }
    renderList();
  });

  list.querySelectorAll<HTMLInputElement>(".cb-select").forEach((cb) => {
    cb.addEventListener("change", () => {
      const idx = parseInt(cb.dataset.idx!, 10);
      if (cb.checked) selectedIndices.add(idx);
      else selectedIndices.delete(idx);
      updateBatchToolbar();
      const card = cb.closest(".app-card");
      if (card) card.classList.toggle("app-card-selected", cb.checked);
    });
  });

  list.querySelectorAll<HTMLButtonElement>(".btn-tile-start, .btn-tile-stop").forEach((btn) => {
    if (!btn.id.startsWith("startstop")) return;
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.idx!, 10);
      const isRunning = runningStatus[idx] ?? false;
      try {
        if (isRunning) {
          const results = await stopSpecificApps([idx]);
          showToast(results.join("\n"), "success");
        } else {
          const results = await runSpecificApps([idx]);
          showToast(results.join("\n"), "success");
        }
        await refreshRunningStatus();
      } catch (e) {
        showToast(`${isRunning ? "Stop" : "Start"} failed: ${e}`, "error");
      }
    });
  });

  list.querySelectorAll<HTMLButtonElement>(".btn-tile-ghost").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx!, 10);
      openForm(idx);
    });
  });

  list.querySelectorAll<HTMLButtonElement>(".btn-tile-danger").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.idx!, 10);
      if (!confirm(`Remove "${apps[idx].Name}" from the list?`)) return;
      try {
        apps = await removeApp(idx);
        const next = new Set<number>();
        selectedIndices.forEach((si) => {
          if (si < idx) next.add(si);
          else if (si > idx) next.add(si - 1);
        });
        selectedIndices = next;
        renderList();
        showToast("Removed from list", "success");
      } catch (e) {
        showToast(`Remove failed: ${e}`, "error");
      }
    });
  });

  updateBatchToolbar();
}

function openForm(index: number | null) {
  editIndex = index;
  const app = index !== null ? { ...apps[index] } : emptyApp();

  const modal = document.getElementById("modal-overlay")!;
  modal.classList.add("open");

  document.getElementById("modal-title")!.textContent = index !== null ? `Edit: ${app.Name}` : "Add app";

  (document.getElementById("f-name") as HTMLInputElement).value = app.Name;
  (document.getElementById("f-path") as HTMLInputElement).value = app.Path;
  (document.getElementById("f-process") as HTMLInputElement).value = app.Process;
  (document.getElementById("f-args") as HTMLInputElement).value = app.Args;
}

function closeForm() {
  document.getElementById("modal-overlay")!.classList.remove("open");
  editIndex = null;
}

async function browseExe() {
  const selected = await open({
    multiple: false,
    filters: [
      { name: "Programs", extensions: ["exe", "bat", "cmd", "lnk"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (selected == null) return;

  const filePath = Array.isArray(selected) ? selected[0] : selected;
  const fileName = fileNameFromPath(filePath);

  (document.getElementById("f-path") as HTMLInputElement).value = filePath;

  const procInput = document.getElementById("f-process") as HTMLInputElement;
  if (!procInput.value.trim() && fileName) {
    procInput.placeholder = `Default: ${fileName}`;
  }

  const nameInput = document.getElementById("f-name") as HTMLInputElement;
  if (!nameInput.value.trim() && fileName) {
    const base = fileName.replace(/\.[^.]+$/, "");
    nameInput.value = base.charAt(0).toUpperCase() + base.slice(1);
  }
}

function readFormApp(): AppEntry {
  return {
    Name: (document.getElementById("f-name") as HTMLInputElement).value.trim(),
    Path: (document.getElementById("f-path") as HTMLInputElement).value.trim(),
    Process: (document.getElementById("f-process") as HTMLInputElement).value.trim(),
    Args: (document.getElementById("f-args") as HTMLInputElement).value.trim(),
  };
}

async function init() {
  try {
    apps = await getApps();
  } catch (e) {
    apps = [];
    showToast(`Failed to load apps: ${e}`, "error");
  }

  await refreshRunningStatus();
  renderList();
  startPolling();

  document.getElementById("btn-export")!.addEventListener("click", async () => {
    const path = await save({
      title: "Export app list",
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: "app-launcher-apps.json",
    });
    if (!path) return;
    try {
      await exportSettings(path);
      showToast("Settings exported.", "success");
    } catch (e) {
      showToast(`Export failed: ${e}`, "error");
    }
  });

  document.getElementById("btn-import")!.addEventListener("click", async () => {
    if (apps.length > 0) {
      const ok = await confirm(
        "Replace your current app list with the contents of the selected file? This cannot be undone.",
        { title: "Import settings", kind: "warning" }
      );
      if (!ok) return;
    }
    const picked = await open({
      title: "Import app list",
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });
    const path = picked == null ? null : Array.isArray(picked) ? picked[0] : picked;
    if (!path) return;
    try {
      apps = await importSettings(path);
      selectedIndices.clear();
      await refreshRunningStatus();
      renderList();
      showToast("Settings imported.", "success");
    } catch (e) {
      showToast(`Import failed: ${e}`, "error");
    }
  });

  document.getElementById("btn-add")!.addEventListener("click", () => openForm(null));

  document.getElementById("btn-run-all")!.addEventListener("click", async () => {
    if (apps.length === 0) return;
    const btn = document.getElementById("btn-run-all") as HTMLButtonElement;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Starting…";
    try {
      const results = await runAllApps();
      showToast(results.join("\n"), "info");
      await refreshRunningStatus();
    } catch (e) {
      showToast(`Start all failed: ${e}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = prev || "Start all";
    }
  });

  document.getElementById("btn-batch-run")!.addEventListener("click", async () => {
    const indices = Array.from(selectedIndices);
    if (indices.length === 0) return;
    try {
      const results = await runSpecificApps(indices);
      showToast(results.join("\n"), "info");
      await refreshRunningStatus();
    } catch (e) {
      showToast(`Start failed: ${e}`, "error");
    }
  });

  document.getElementById("btn-batch-stop")!.addEventListener("click", async () => {
    const indices = Array.from(selectedIndices);
    if (indices.length === 0) return;
    try {
      const results = await stopSpecificApps(indices);
      showToast(results.join("\n"), "info");
      await refreshRunningStatus();
    } catch (e) {
      showToast(`Stop failed: ${e}`, "error");
    }
  });

  document.getElementById("btn-batch-delete")!.addEventListener("click", async () => {
    const count = selectedIndices.size;
    if (count === 0) return;
    if (!confirm(`Remove ${count} app(s) from the list?`)) return;
    try {
      apps = await deleteSpecificApps(Array.from(selectedIndices));
      selectedIndices.clear();
      renderList();
      showToast(`${count} app(s) removed`, "success");
    } catch (e) {
      showToast(`Remove failed: ${e}`, "error");
    }
  });

  document.getElementById("btn-cancel")!.addEventListener("click", closeForm);
  document.getElementById("modal-overlay")!.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "modal-overlay") closeForm();
  });

  document.getElementById("btn-form-save")!.addEventListener("click", async () => {
    const app = readFormApp();
    if (!app.Name || !app.Path) {
      showToast("Display name and executable path are required.", "error");
      return;
    }
    try {
      if (editIndex !== null) {
        apps = await updateApp(editIndex, app);
        showToast(`Updated “${app.Name}”`, "success");
      } else {
        apps = await addApp(app);
        showToast(`Added “${app.Name}”`, "success");
      }
      renderList();
      closeForm();
    } catch (e) {
      showToast(`Save failed: ${e}`, "error");
    }
  });

  document.getElementById("btn-browse")!.addEventListener("click", browseExe);
}

document.addEventListener("DOMContentLoaded", init);
