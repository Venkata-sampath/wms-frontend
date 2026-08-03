import { Api } from "../../api.js";

// =========================================================================
// MODULE STATE
// =========================================================================
let pollInterval = null;
let tasksCache = [];
let expandedTaskId = null;
let activeTab = "pending";
let checkedItemsState = {}; // { [taskId]: Set(itemId) }

// =========================================================================
// ENTRY POINT
// =========================================================================
export async function render(container, user) {
  stopPolling();
  tasksCache = [];
  expandedTaskId = null;
  activeTab = "pending";
  checkedItemsState = {};

  container.innerHTML = `
    <style>
      .verify-checkbox {
        border: 2px solid #198754 !important;
        width: 1.25em;
        height: 1.25em;
        cursor: pointer;
        transition: border-color 0.15s ease-in-out, background-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
      }
      .verify-checkbox:checked {
        background-color: #198754 !important;
        border-color: #198754 !important;
      }
      .verify-checkbox:focus {
        box-shadow: 0 0 0 0.25rem rgba(25, 135, 84, 0.25) !important;
        border-color: #198754 !important;
      }
    </style>

    <div class="container-fluid p-2 p-sm-4 animate-fade-in" id="picking-root">
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 mb-md-4 pb-2 border-bottom">
        <div class="mb-2 mb-md-0">
          <h4 class="fw-bold text-dark mb-1">
            <i class="bi bi-arrow-up-right-square text-primary me-2"></i>Picking Tasks
          </h4>
          <p class="text-muted small mb-0">Fulfill committed outbound orders from allocated warehouse locations.</p>
        </div>
        <div>
          <button id="refresh-picking-btn" class="btn btn-sm btn-outline-secondary shadow-sm px-3 w-100 w-md-auto" type="button">
            <i class="bi bi-arrow-clockwise me-1"></i> Refresh
          </button>
        </div>
      </div>

      <ul class="nav nav-tabs mb-3" id="picking-tabs" role="tablist">
        <li class="nav-item" role="presentation">
          <button class="nav-link active fw-semibold text-sm" id="pending-tab" data-tab="pending" type="button" role="tab">Pending Tasks</button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link fw-semibold text-sm" id="completed-tab" data-tab="completed" type="button" role="tab">Completed Tasks</button>
        </li>
      </ul>

      <div id="picking-list">
        <div class="text-center text-muted py-5">
          <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
          <div class="small">Loading pending picking tasks...</div>
        </div>
      </div>
    </div>
  `;

  container
    .querySelector("#refresh-picking-btn")
    .addEventListener("click", refreshTasks);

  container.querySelectorAll("#picking-tabs .nav-link").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      container
        .querySelectorAll("#picking-tabs .nav-link")
        .forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      activeTab = e.target.dataset.tab;
      expandedTaskId = null;

      const listEl = document.getElementById("picking-list");
      if (listEl) {
        listEl.innerHTML = `
          <div class="text-center text-muted py-5">
            <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
            <div class="small">Loading ${activeTab} picking tasks...</div>
          </div>
        `;
      }
      refreshTasks();
    });
  });

  await refreshTasks();
  startPolling();
}

// =========================================================================
// POLLING & DATA FETCHING
// =========================================================================
function startPolling() {
  stopPolling();
  pollInterval = setInterval(() => {
    if (!expandedTaskId) refreshTasks();
  }, 10000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function refreshTasks() {
  const listEl = document.getElementById("picking-list");
  if (!listEl) return;

  try {
    const res =
      activeTab === "pending"
        ? await Api.picking.getPending()
        : await Api.picking.getCompleted();
    tasksCache = res.tasks || [];

    if (expandedTaskId) return;

    renderTaskList(listEl);
  } catch (err) {
    listEl.innerHTML = `
      <div class="alert alert-danger border-0 shadow-sm text-center small py-3 px-3 rounded-3">
        <i class="bi bi-exclamation-octagon-fill me-2 fs-6"></i>Failed to load picking tasks: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

// =========================================================================
// UI CARD RENDERING
// =========================================================================
function renderTaskList(listEl) {
  if (tasksCache.length === 0) {
    listEl.innerHTML = `
      <div class="card p-4 p-sm-5 shadow-sm text-center text-muted border-0 rounded-3">
        <i class="bi bi-inboxes display-6 d-block mb-2 text-secondary"></i>
        <p class="fw-bold mb-1">No picking tasks ${activeTab}</p>
        <small class="text-muted">${activeTab === "pending" ? "Commit an outbound order to generate a picking task automatically." : "Completed tasks will be archived here."}</small>
      </div>
    `;
    return;
  }

  listEl.innerHTML = tasksCache.map((task) => renderTaskCard(task)).join("");

  listEl.querySelectorAll(".task-header-toggle").forEach((el) => {
    el.addEventListener("click", () => {
      const taskId = el.dataset.taskId;
      expandedTaskId = expandedTaskId === taskId ? null : taskId;
      renderTaskList(listEl);
    });
  });

  if (expandedTaskId) {
    wireUpExpandedTask(expandedTaskId);
  }
}

function renderTaskCard(task) {
  const isExpanded = task.id === expandedTaskId;
  const createdAt = formatTimestamp(task.created_at);
  const totalItems = (task.items || []).length;
  const clientTitle = `${escapeHtml(task.client_name || "Unknown Client")} (${escapeHtml(task.client_code || "N/A")})`;

  let subHeaderHtml = "";
  if (activeTab === "pending") {
    subHeaderHtml = `
      <div class="row g-2 text-dark small mt-1">
        <div class="col-12 col-sm-6 col-md-4 col-lg-2">
          <span class="text-muted">E-Way Bill :</span> <span class="fw-semibold text-dark">${escapeHtml(task.eway_bill_number || "—")}</span>
        </div>
        <div class="col-12 col-sm-6 col-md-4 col-lg-2">
          <span class="text-muted">Vehicle No :</span> <span class="fw-semibold text-dark">${escapeHtml(task.vehicle_number || "—")}</span>
        </div>
        <div class="col-12 col-sm-6 col-md-4 col-lg-3">
          <span class="text-muted">Transporter :</span> <span class="fw-semibold text-dark">${escapeHtml(task.transporter_name || "—")}</span>
        </div>
        <div class="col-12 col-sm-6 col-md-4 col-lg-2">
          <span class="text-muted">Created By :</span> <span class="fw-semibold text-dark">${escapeHtml(task.created_by || "—")}</span>
        </div>
        <div class="col-12 col-sm-6 col-md-4 col-lg-3">
          <span class="text-muted">Created At :</span> <span class="fw-semibold text-dark">${createdAt}</span>
        </div>
      </div>
    `;
  } else {
    const completedAt = formatTimestamp(task.completed_at);
    subHeaderHtml = `
      <div class="row g-2 text-dark small mt-1">
        <div class="col-12 col-sm-6 col-md-4 col-lg-2">
          <span class="text-muted">E-Way Bill :</span> <span class="fw-semibold text-dark">${escapeHtml(task.eway_bill_number || "—")}</span>
        </div>
        <div class="col-12 col-sm-6 col-md-4 col-lg-2">
          <span class="text-muted">Vehicle No :</span> <span class="fw-semibold text-dark">${escapeHtml(task.vehicle_number || "—")}</span>
        </div>
        <div class="col-12 col-sm-6 col-md-4 col-lg-3">
          <span class="text-muted">Transporter :</span> <span class="fw-semibold text-dark">${escapeHtml(task.transporter_name || "—")}</span>
        </div>
        <div class="col-12 col-sm-6 col-md-4 col-lg-2">
          <span class="text-muted">Created By :</span> <span class="fw-semibold text-dark">${escapeHtml(task.created_by || "—")}</span>
        </div>
        <div class="col-12 col-sm-6 col-md-4 col-lg-3">
          <span class="text-muted">Created At :</span> <span class="fw-semibold text-dark">${createdAt}</span>
        </div>
        <div class="col-12 col-sm-6 col-md-4 col-lg-2">
          <span class="text-muted">Completed By :</span> <span class="fw-semibold text-dark">${escapeHtml(task.completed_by || "—")}</span>
        </div>
        <div class="col-12 col-sm-6 col-md-4 col-lg-3">
          <span class="text-muted">Completed At :</span> <span class="fw-semibold text-dark">${completedAt}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="card shadow-sm border-0 rounded-3 mb-2 mb-md-3 animate-fade-in">
      <div class="card-body p-0">
        <div class="task-header-toggle p-2.5 p-sm-3" data-task-id="${task.id}" style="cursor:pointer;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="fw-bold fs-5 text-dark">${clientTitle}</span>
              <span class="badge bg-secondary text-white rounded px-2" style="font-size:0.75rem;">${totalItems} Item${totalItems === 1 ? "" : "s"}</span>
            </div>
            <div class="flex-shrink-0 ps-2">
              <i class="bi ${isExpanded ? "bi-chevron-up" : "bi-chevron-down"} fs-6 text-muted"></i>
            </div>
          </div>
          ${subHeaderHtml}
        </div>

        ${isExpanded ? renderTaskDetail(task) : ""}
      </div>
    </div>
  `;
}

function renderTaskDetail(task) {
  if (!checkedItemsState[task.id]) {
    checkedItemsState[task.id] = new Set();
  }

  const taskCheckedSet = checkedItemsState[task.id];
  const allChecked =
    (task.items || []).length > 0 &&
    task.items.every((item) => taskCheckedSet.has(item.id));

  const rowsHtml = (task.items || [])
    .map((item) => {
      const isChecked = taskCheckedSet.has(item.id);
      return `
      <tr data-item-id="${item.id}">
        <td class="ps-1"><code class="small fw-bold font-monospace text-primary">${escapeHtml(item.item_code)}</code></td>
        <td><div class="text-secondary text-truncate" style="max-width:200px;" title="${escapeHtml(item.item_description || "")}">${escapeHtml(item.item_description || "—")}</div></td>
        <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(item.location_id)}</span></td>
        <td class="small font-monospace text-dark">${escapeHtml(item.batch_number || "—")}</td>
        <td class="small text-muted">${formatDateOnly(item.manufacturing_date)}</td>
        <td class="small text-muted">${formatDateOnly(item.expiry_date)}</td>
        <td class="fw-bold text-dark">${item.quantity_to_pick}</td>
        <td><small class="text-uppercase text-muted fw-bold">${escapeHtml(item.uom || "PCS")}</small></td>
        <td class="text-center">
          ${
            activeTab === "pending"
              ? `<input type="checkbox" class="form-check-input verify-checkbox line-item-verify-cb" data-task-id="${task.id}" data-item-id="${item.id}" ${isChecked ? "checked" : ""}>`
              : `<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle">Verified</span>`
          }
        </td>
      </tr>
    `;
    })
    .join("");

  return `
    <div class="border-top p-2 p-sm-3 bg-light bg-opacity-25">
      <div class="table-responsive mb-2 mb-md-3">
        <table class="table table-sm table-hover align-middle mb-0" style="font-size:0.85rem;">
          <thead class="table-light small text-uppercase" style="font-size:0.7rem;">
            <tr>
              <th class="ps-1" style="min-width:110px;">Item Code</th>
              <th style="min-width:160px;">Item Description</th>
              <th style="width:110px;">Location</th>
              <th style="width:110px;">Batch Number</th>
              <th style="width:110px;">Mfg Date</th>
              <th style="width:110px;">Expiry Date</th>
              <th style="width:80px;">Quantity</th>
              <th style="width:70px;">UOM</th>
              <th style="width:100px;" class="text-center">Verification</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      ${
        activeTab === "pending"
          ? `
      <div id="picking-error-${task.id}" class="alert alert-danger py-2 px-3 small border-0 shadow-sm rounded-3 mb-2 d-none"></div>
      
      <button type="button" id="complete-task-btn-${task.id}" 
              class="btn btn-success btn-sm w-100 py-2 fw-semibold shadow-sm complete-picking-btn ${allChecked ? "" : "d-none"}" 
              data-task-id="${task.id}" ${allChecked ? "" : "disabled"}>
        <i class="bi bi-check2-circle me-1"></i> Complete Picking Task
      </button>
      `
          : ""
      }
    </div>
  `;
}

// =========================================================================
// EVENT HANDLERS & COMPLETION
// =========================================================================
function wireUpExpandedTask(taskId) {
  if (activeTab !== "pending") return;

  const task = tasksCache.find((t) => t.id === taskId);
  if (!task) return;

  const checkboxes = document.querySelectorAll(
    `.line-item-verify-cb[data-task-id="${taskId}"]`,
  );
  const completeBtn = document.getElementById(`complete-task-btn-${taskId}`);

  checkboxes.forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const itemId = e.target.dataset.itemId;
      if (!checkedItemsState[taskId]) checkedItemsState[taskId] = new Set();

      if (e.target.checked) {
        checkedItemsState[taskId].add(itemId);
      } else {
        checkedItemsState[taskId].delete(itemId);
      }

      const allChecked =
        (task.items || []).length > 0 &&
        task.items.every((item) => checkedItemsState[taskId].has(item.id));

      if (completeBtn) {
        if (allChecked) {
          completeBtn.classList.remove("d-none");
          completeBtn.disabled = false;
        } else {
          completeBtn.classList.add("d-none");
          completeBtn.disabled = true;
        }
      }
    });
  });

  if (completeBtn) {
    completeBtn.addEventListener("click", () => completeTask(task));
  }
}

async function completeTask(task) {
  const taskId = task.id;
  const completeBtn = document.getElementById(`complete-task-btn-${taskId}`);
  const errorEl = document.getElementById(`picking-error-${taskId}`);

  if (errorEl) {
    errorEl.classList.add("d-none");
    errorEl.textContent = "";
  }

  completeBtn.disabled = true;
  completeBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Completing...`;

  const pickedItems = (task.items || []).map((item) => ({
    picking_task_item_id: item.id,
    picked_quantity: item.quantity_to_pick,
  }));

  try {
    const result = await Api.picking.completeTask(taskId, pickedItems);
    if (!result || result.success === false) {
      throw new Error(result?.error || "Picking completion was rejected.");
    }

    delete checkedItemsState[taskId];
    expandedTaskId = null;
    await refreshTasks();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = `Error: ${err.message}`;
      errorEl.classList.remove("d-none");
    }
    completeBtn.disabled = false;
    completeBtn.innerHTML = `<i class="bi bi-check2-circle me-1"></i> Complete Picking Task`;
  }
}

// =========================================================================
// HELPERS
// =========================================================================
function formatTimestamp(raw) {
  if (!raw) return "—";
  let isoString = String(raw).trim();
  if (isoString.includes(" ") && !isoString.includes("T")) {
    isoString = isoString.replace(" ", "T");
  }
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(isoString)) {
    isoString += "Z";
  }
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return String(raw);

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(raw) {
  if (!raw) return "—";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return String(raw);
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
}

function escapeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
