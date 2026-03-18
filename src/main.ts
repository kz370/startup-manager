import {
  AppEntry,
  getApps,
  addApp,
  removeApp,
  updateApp,
  toggleApp,
  runApps,
  saveApps,
  runSpecificApps,
  stopSpecificApps,
  deleteSpecificApps,
  setSpecificAppsEnabled,
  getRunningStatus,
} from "./api";
import { open } from "@tauri-apps/plugin-dialog";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let apps: AppEntry[] = [];
let editIndex: number | null = null;
let formExceptionDates: string[] = [];
let selectedIndices: Set<number> = new Set();
let runningStatus: boolean[] = [];
let statusPollTimer: ReturnType<typeof setInterval> | null = null;

// ── Helpers ──────────────────────────────────────────────

function emptyApp(): AppEntry {
  return {
    Name: "",
    Process: "",
    Path: "",
    Args: "",
    Enabled: true,
    Delay: 0,
    WindowStyle: "Normal",
    Days: [],
    ExceptionDates: [],
  };
}

function daysLabel(days: number[]): string {
  if (days.length === 0) return "Every day";
  return days
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(", ");
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
  }, 3000);
}

// ── Running Status ───────────────────────────────────────

async function refreshRunningStatus() {
  try {
    const statuses = await getRunningStatus();
    runningStatus = statuses;
    // Update only the status dots and start/stop buttons without full re-render
    apps.forEach((_, i) => {
      const dot = document.getElementById(`status-dot-${i}`);
      const startStopBtn = document.getElementById(`startstop-${i}`);
      if (dot) {
        const running = runningStatus[i] ?? false;
        dot.className = `status-dot ${running ? "running" : "stopped"}`;
        dot.title = running ? "Running" : "Stopped";
      }
      if (startStopBtn) {
        const running = runningStatus[i] ?? false;
        startStopBtn.className = `btn-action ${running ? "btn-stop" : "btn-start"}`;
        startStopBtn.textContent = running ? "⏹" : "▶";
        startStopBtn.title = running ? "Stop" : "Start";
      }
    });
  } catch {
    // Silently fail polling
  }
}

function startPolling() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  statusPollTimer = setInterval(refreshRunningStatus, 5000);
}

// ── Batch Toolbar ────────────────────────────────────────

function updateBatchToolbar() {
  const toolbar = document.getElementById("batch-toolbar")!;
  const countLabel = document.getElementById("batch-count")!;
  const selectAll = document.getElementById("cb-select-all") as HTMLInputElement;

  if (selectedIndices.size > 0) {
    toolbar.classList.add("visible");
    countLabel.textContent = `${selectedIndices.size} selected`;
  } else {
    toolbar.classList.remove("visible");
  }

  if (apps.length > 0 && selectedIndices.size === apps.length) {
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

// ── Render Table ─────────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById("apps-tbody")!;
  updateAppCount();
  updateBatchToolbar();

  if (apps.length === 0) {
    selectedIndices.clear();
    updateBatchToolbar();
    tbody.innerHTML = `<tr class="empty-row"><td colspan="12">No apps configured. Click <strong>Add App</strong> to get started.</td></tr>`;
    return;
  }

  tbody.innerHTML = apps
    .map(
      (app, i) => {
        const running = runningStatus[i] ?? false;
        return `
    <tr class="${!app.Enabled ? "row-disabled" : ""}${selectedIndices.has(i) ? " row-selected" : ""}">
      <td class="cell-checkbox">
        <input type="checkbox" class="cb-select" data-idx="${i}" ${selectedIndices.has(i) ? "checked" : ""} />
      </td>
      <td class="cell-status">
        <span class="status-dot ${running ? "running" : "stopped"}" id="status-dot-${i}" title="${running ? "Running" : "Stopped"}"></span>
      </td>
      <td class="cell-name">${esc(app.Name)}</td>
      <td class="cell-process"><code>${esc(app.Process)}</code></td>
      <td class="cell-path" title="${esc(app.Path)}">${esc(truncPath(app.Path))}</td>
      <td class="cell-delay">${app.Delay}ms</td>
      <td class="cell-days">${daysLabel(app.Days)}</td>
      <td class="cell-exceptions">${app.ExceptionDates.length > 0 ? app.ExceptionDates.length + " date(s)" : "—"}</td>
      <td class="col-action">
        <button class="btn-action ${running ? "btn-stop" : "btn-start"}" data-idx="${i}" id="startstop-${i}" title="${running ? "Stop" : "Start"}">
          ${running ? "⏹" : "▶"}
        </button>
      </td>
      <td class="col-action">
        <button class="btn-action ${app.Enabled ? "btn-enabled" : "btn-disabled-state"}" data-idx="${i}" id="enabletoggle-${i}" title="${app.Enabled ? "Disable" : "Enable"}">
          ${app.Enabled ? "✔" : "✖"}
        </button>
      </td>
      <td class="col-action">
        <button class="btn-icon btn-edit" data-idx="${i}" id="edit-${i}" title="Edit">✏️</button>
      </td>
      <td class="col-action">
        <button class="btn-icon btn-delete" data-idx="${i}" id="delete-${i}" title="Delete">🗑️</button>
      </td>
    </tr>
  `;}
    )
    .join("");

  // Bind row checkboxes
  tbody.querySelectorAll<HTMLInputElement>(".cb-select").forEach((cb) => {
    cb.addEventListener("change", () => {
      const idx = parseInt(cb.dataset.idx!);
      if (cb.checked) {
        selectedIndices.add(idx);
      } else {
        selectedIndices.delete(idx);
      }
      updateBatchToolbar();
      const row = cb.closest("tr");
      if (row) row.classList.toggle("row-selected", cb.checked);
    });
  });

  // Bind start/stop buttons
  tbody.querySelectorAll<HTMLButtonElement>(".btn-start, .btn-stop").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.idx!);
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

  // Bind enable/disable buttons
  tbody.querySelectorAll<HTMLButtonElement>(".btn-enabled, .btn-disabled-state").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.idx!);
      try {
        apps = await toggleApp(idx);
        renderTable();
        showToast(`${apps[idx].Name} ${apps[idx].Enabled ? "enabled" : "disabled"}`, "success");
      } catch (e) {
        showToast(`Toggle failed: ${e}`, "error");
      }
    });
  });

  // Bind edit buttons
  tbody.querySelectorAll<HTMLButtonElement>(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx!);
      openForm(idx);
    });
  });

  // Bind delete buttons
  tbody.querySelectorAll<HTMLButtonElement>(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.idx!);
      if (!confirm(`Delete "${apps[idx].Name}"?`)) return;
      try {
        apps = await removeApp(idx);
        const updated = new Set<number>();
        selectedIndices.forEach((si) => {
          if (si < idx) updated.add(si);
          else if (si > idx) updated.add(si - 1);
        });
        selectedIndices = updated;
        renderTable();
        showToast("App deleted", "success");
      } catch (e) {
        showToast(`Delete failed: ${e}`, "error");
      }
    });
  });
}

function truncPath(p: string): string {
  return p.length > 40 ? "…" + p.slice(-38) : p;
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

// ── Modal Form ───────────────────────────────────────────

function openForm(index: number | null) {
  editIndex = index;
  const app = index !== null ? { ...apps[index] } : emptyApp();
  formExceptionDates = [...app.ExceptionDates];

  const modal = document.getElementById("modal-overlay")!;
  modal.classList.add("open");

  document.getElementById("modal-title")!.textContent =
    index !== null ? `Edit: ${app.Name}` : "Add New App";

  (document.getElementById("f-name") as HTMLInputElement).value = app.Name;
  (document.getElementById("f-process") as HTMLInputElement).value = app.Process;
  (document.getElementById("f-path") as HTMLInputElement).value = app.Path;
  (document.getElementById("f-args") as HTMLInputElement).value = app.Args;
  (document.getElementById("f-delay") as HTMLInputElement).value = String(app.Delay);
  (document.getElementById("f-winstyle") as HTMLSelectElement).value = app.WindowStyle;
  (document.getElementById("f-enabled") as HTMLInputElement).checked = app.Enabled;

  DAY_NAMES.forEach((_, i) => {
    (document.getElementById(`f-day-${i}`) as HTMLInputElement).checked =
      app.Days.includes(i);
  });

  renderExceptionDates();
  setupDayCheckboxes();
}

async function browseExe() {
  const selected = await open({
    multiple: false,
    filters: [
      { name: "Executables", extensions: ["exe", "bat", "cmd", "lnk"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (!selected) return;

  const filePath = typeof selected === "string" ? selected : selected;
  const pathParts = filePath.replace(/\\/g, "/").split("/");
  const fileName = pathParts[pathParts.length - 1];

  (document.getElementById("f-path") as HTMLInputElement).value = filePath;
  (document.getElementById("f-process") as HTMLInputElement).value = fileName;

  const nameInput = document.getElementById("f-name") as HTMLInputElement;
  if (!nameInput.value.trim()) {
    const baseName = fileName.replace(/\.[^.]+$/, "");
    nameInput.value = baseName.charAt(0).toUpperCase() + baseName.slice(1);
  }
}

function closeForm() {
  document.getElementById("modal-overlay")!.classList.remove("open");
  editIndex = null;
}

function renderExceptionDates() {
  const list = document.getElementById("exception-list")!;
  if (formExceptionDates.length === 0) {
    list.innerHTML = '<div class="no-exceptions">No exception dates</div>';
    return;
  }
  list.innerHTML = formExceptionDates
    .map(
      (d, i) =>
        `<div class="exception-item">
          <span>${d}</span>
          <button class="btn-remove-exception" data-idx="${i}" id="remove-exc-${i}">✕</button>
        </div>`
    )
    .join("");

  list.querySelectorAll<HTMLButtonElement>(".btn-remove-exception").forEach((btn) => {
    btn.addEventListener("click", () => {
      formExceptionDates.splice(parseInt(btn.dataset.idx!), 1);
      renderExceptionDates();
    });
  });
}

function readFormApp(): AppEntry {
  const days: number[] = [];
  DAY_NAMES.forEach((_, i) => {
    if ((document.getElementById(`f-day-${i}`) as HTMLInputElement).checked) {
      days.push(i);
    }
  });

  return {
    Name: (document.getElementById("f-name") as HTMLInputElement).value.trim(),
    Process: (document.getElementById("f-process") as HTMLInputElement).value.trim(),
    Path: (document.getElementById("f-path") as HTMLInputElement).value.trim(),
    Args: (document.getElementById("f-args") as HTMLInputElement).value.trim(),
    Delay: parseInt(
      (document.getElementById("f-delay") as HTMLInputElement).value || "0"
    ),
    WindowStyle: (document.getElementById("f-winstyle") as HTMLSelectElement).value,
    Enabled: (document.getElementById("f-enabled") as HTMLInputElement).checked,
    Days: days,
    ExceptionDates: [...formExceptionDates],
  };
}

// ── Init ─────────────────────────────────────────────────

async function init() {
  try {
    apps = await getApps();
  } catch (e) {
    apps = [];
    showToast(`Failed to load apps: ${e}`, "error");
  }

  // Initial status fetch
  await refreshRunningStatus();
  renderTable();
  startPolling();

  // Add App button
  document.getElementById("btn-add")!.addEventListener("click", () => {
    openForm(null);
  });

  // Run All Apps button
  document.getElementById("btn-run")!.addEventListener("click", async () => {
    if (apps.length === 0) return;
    const btn = document.getElementById("btn-run") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Running…";
    try {
      const results = await runApps();
      showToast(results.join("\n"), "success");
      await refreshRunningStatus();
    } catch (e) {
      showToast(`Run failed: ${e}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "▶ Run Apps";
    }
  });

  // Save button
  document.getElementById("btn-save")!.addEventListener("click", async () => {
    try {
      await saveApps(apps);
      showToast("Saved to apps.json", "success");
    } catch (e) {
      showToast(`Save failed: ${e}`, "error");
    }
  });

  // Select All checkbox
  const selectAll = document.getElementById("cb-select-all") as HTMLInputElement;
  selectAll.addEventListener("change", () => {
    if (selectAll.checked) {
      apps.forEach((_, i) => selectedIndices.add(i));
    } else {
      selectedIndices.clear();
    }
    renderTable();
  });

  // ── Batch Actions ───────────────────────────────────
  document.getElementById("btn-batch-run")!.addEventListener("click", async () => {
    const indices = Array.from(selectedIndices);
    if (indices.length === 0) return;
    try {
      const results = await runSpecificApps(indices);
      showToast(results.join("\n"), "success");
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
      showToast(results.join("\n"), "success");
      await refreshRunningStatus();
    } catch (e) {
      showToast(`Stop failed: ${e}`, "error");
    }
  });

  document.getElementById("btn-batch-enable")!.addEventListener("click", async () => {
    const indices = Array.from(selectedIndices);
    if (indices.length === 0) return;
    try {
      apps = await setSpecificAppsEnabled(indices, true);
      renderTable();
      showToast(`${indices.length} app(s) enabled`, "success");
    } catch (e) {
      showToast(`Enable failed: ${e}`, "error");
    }
  });

  document.getElementById("btn-batch-disable")!.addEventListener("click", async () => {
    const indices = Array.from(selectedIndices);
    if (indices.length === 0) return;
    try {
      apps = await setSpecificAppsEnabled(indices, false);
      renderTable();
      showToast(`${indices.length} app(s) disabled`, "success");
    } catch (e) {
      showToast(`Disable failed: ${e}`, "error");
    }
  });

  document.getElementById("btn-batch-delete")!.addEventListener("click", async () => {
    const count = selectedIndices.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} selected app(s)?`)) return;
    try {
      apps = await deleteSpecificApps(Array.from(selectedIndices));
      selectedIndices.clear();
      renderTable();
      showToast(`${count} app(s) deleted`, "success");
    } catch (e) {
      showToast(`Batch delete failed: ${e}`, "error");
    }
  });

  // ── Modal ───────────────────────────────────────────
  document.getElementById("btn-cancel")!.addEventListener("click", closeForm);
  document.getElementById("modal-overlay")!.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "modal-overlay") closeForm();
  });

  document.getElementById("btn-form-save")!.addEventListener("click", async () => {
    const app = readFormApp();
    if (!app.Name || !app.Path) {
      showToast("Name and Path are required. Use Browse to select an executable.", "error");
      return;
    }
    try {
      if (editIndex !== null) {
        apps = await updateApp(editIndex, app);
        showToast(`Updated: ${app.Name}`, "success");
      } else {
        apps = await addApp(app);
        showToast(`Added: ${app.Name}`, "success");
      }
      renderTable();
      closeForm();
    } catch (e) {
      showToast(`Save failed: ${e}`, "error");
    }
  });

  // Browse exe button
  document.getElementById("btn-browse")!.addEventListener("click", browseExe);

  // Exception dates
  const exceptionInput = document.getElementById("f-exception-date") as HTMLInputElement;

  document.getElementById("btn-add-exception")!.addEventListener("click", () => {
    const val = exceptionInput.value;
    if (!val) return;
    if (formExceptionDates.includes(val)) {
      showToast("Date already added", "error");
      return;
    }
    formExceptionDates.push(val);
    renderExceptionDates();
    exceptionInput.value = "";
  });

  document.getElementById("btn-calendar")!.addEventListener("click", () => {
    exceptionInput.showPicker();
  });

  exceptionInput.addEventListener("change", () => {
    const val = exceptionInput.value;
    if (!val) return;
    if (formExceptionDates.includes(val)) {
      showToast("Date already added", "error");
      exceptionInput.value = "";
      return;
    }
    formExceptionDates.push(val);
    renderExceptionDates();
    exceptionInput.value = "";
  });
}

function setupDayCheckboxes() {
  document.querySelectorAll<HTMLLabelElement>(".day-check").forEach((label) => {
    const cb = label.querySelector("input") as HTMLInputElement;
    const update = () => {
      if (cb.checked) {
        label.classList.add("checked");
      } else {
        label.classList.remove("checked");
      }
    };
    cb.addEventListener("change", update);
    update();
  });
}

function updateAppCount() {
  const el = document.getElementById("app-count");
  if (el) {
    el.textContent = `${apps.length} app${apps.length !== 1 ? "s" : ""}`;
  }
}

document.addEventListener("DOMContentLoaded", init);
