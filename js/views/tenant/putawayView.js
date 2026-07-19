import { Api } from "../../api.js";

// =========================================================================
// MODULE STATE
// =========================================================================
let pollInterval = null;
let tasksCache = [];
let expandedTaskId = null;
let activeTab = "pending"; // Default tab selection context tracker
// allocationsState[taskId][item_code] = [{ location_id, quantity }, ...]
let allocationsState = {};
let availableLocations = []; // [{ id, calculated_status }]
let openComboboxKey = null; // tracks which search dropdown is currently open

// =========================================================================
// ENTRY POINT
// =========================================================================
export async function render(container, user) {
  stopPolling();
  tasksCache = [];
  expandedTaskId = null;
  allocationsState = {};
  availableLocations = [];
  openComboboxKey = null;
  activeTab = "pending";

  container.innerHTML = `
    <div class="container-fluid p-2 p-sm-4 animate-fade-in" id="putaway-root">
      
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 mb-md-4 pb-2 border-bottom">
        <div class="mb-2 mb-md-0">
          <h4 class="fw-bold text-dark mb-1">
            <i class="bi bi-box-arrow-down text-primary me-2"></i>Putaway Tasks
          </h4>
          <p class="text-muted small mb-0">Assign verified inbound stock to warehouse bin locations.</p>
        </div>
        <div>
          <button id="refresh-putaway-btn" class="btn btn-sm btn-outline-secondary shadow-sm px-3 w-100 w-md-auto" type="button">
            <i class="bi bi-arrow-clockwise me-1"></i> Refresh
          </button>
        </div>
      </div>

      <!-- Tab Switcher Navigation Bar -->
      <ul class="nav nav-tabs mb-3" id="putaway-tabs" role="tablist">
        <li class="nav-item" role="presentation">
          <button class="nav-link active fw-semibold text-sm" id="pending-tab" data-tab="pending" type="button" role="tab">Pending Tasks</button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link fw-semibold text-sm" id="completed-tab" data-tab="completed" type="button" role="tab">Completed Tasks</button>
        </li>
      </ul>

      <div id="putaway-list">
        <div class="text-center text-muted py-5">
          <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
          <div class="small">Loading pending putaway tasks...</div>
        </div>
      </div>
    </div>
  `;

  container
    .querySelector("#refresh-putaway-btn")
    .addEventListener("click", () => {
      fetchAvailableLocations();
      refreshTasks();
    });

  // Wiring up Tab Toggle Event Actions
  container.querySelectorAll("#putaway-tabs .nav-link").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      container
        .querySelectorAll("#putaway-tabs .nav-link")
        .forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      activeTab = e.target.dataset.tab;
      expandedTaskId = null; // Automatically reset expand view tracking frame

      const listEl = document.getElementById("putaway-list");
      if (listEl) {
        listEl.innerHTML = `
          <div class="text-center text-muted py-5">
            <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
            <div class="small">Loading ${activeTab} putaway tasks...</div>
          </div>
        `;
      }
      refreshTasks();
    });
  });

  document.addEventListener("click", handleGlobalClickForCombobox);

  fetchAvailableLocations();
  startPolling();
}

async function fetchAvailableLocations() {
  try {
    const result = await Api.locations.list();
    const all = result.locations || [];
    availableLocations = all.filter(
      (l) => l.calculated_status !== "Unavailable",
    );
  } catch (err) {
    console.warn("[Putaway] Failed to load locations list:", err);
    availableLocations = [];
  }
}

function handleGlobalClickForCombobox(e) {
  if (!openComboboxKey) return;
  if (e.target.closest(".location-combobox-wrapper")) return;
  closeAllComboboxDropdowns();
}

function closeAllComboboxDropdowns() {
  openComboboxKey = null;
  document.querySelectorAll(".location-dropdown-menu").forEach((el) => {
    el.classList.add("d-none");
  });
}

// =========================================================================
// LOADING & LIST RENDERING
// =========================================================================
function startPolling() {
  refreshTasks();
  pollInterval = setInterval(refreshTasks, 10000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function refreshTasks() {
  const listEl = document.getElementById("putaway-list");
  if (!listEl) return;

  try {
    let result;
    if (activeTab === "pending") {
      result = await Api.putaway.getPending();
    } else {
      // Dynamic routing mapped safely over the new runtime endpoint mapping structure
      if (typeof Api.putaway.getCompleted === "function") {
        result = await Api.putaway.getCompleted();
      } else {
        const res = await fetch("/api/putaway/completed");
        if (!res.ok) throw new Error("Could not parse data stream.");
        result = await res.json();
      }
    }
    tasksCache = result.tasks || [];

    if (expandedTaskId) {
      return;
    }

    renderTaskList(listEl);
  } catch (err) {
    listEl.innerHTML = `
      <div class="alert alert-danger border-0 shadow-sm text-center small py-3 px-3 rounded-3">
        <i class="bi bi-exclamation-octagon-fill me-2 fs-6"></i>Failed to load putaway tasks: ${err.message}
      </div>
    `;
  }
}

function renderTaskList(listEl) {
  if (tasksCache.length === 0) {
    listEl.innerHTML = `
      <div class="card p-4 p-sm-5 shadow-sm text-center text-muted border-0 rounded-3">
        <i class="bi bi-inboxes display-6 d-block mb-2 text-secondary"></i>
        <p class="fw-bold mb-1">No putaway tasks ${activeTab}</p>
        <small class="text-muted">${activeTab === "pending" ? "Commit a verified shipment layout ledger to generate a processing entry sequence automatically." : "Completed tasks will be archived here for record keeping."}</small>
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
  const totalItems = task.items.length;

  let subHeaderHtml = "";
  if (activeTab === "pending") {
    subHeaderHtml = `
      <div class="text-muted mt-0.5 text-truncate" style="font-size:0.75rem;">
        Shipment ID: <span class="fw-semibold text-secondary">${escapeHtml(task.shipment_id || "")}</span> · 
        Created: ${createdAt} · 
        Verified By: <span class="fw-semibold text-dark">${escapeHtml(task.verified_by || "—")}</span>
      </div>
    `;
  } else {
    const completedAt = formatTimestamp(task.completed_date_time);
    subHeaderHtml = `
      <div class="text-muted mt-0.5 text-truncate" style="font-size:0.75rem;">
        Shipment ID: <span class="fw-semibold text-secondary">${escapeHtml(task.shipment_id || "")}</span> · 
        Created: ${createdAt} · 
        Verified By: <span class="fw-semibold text-dark">${escapeHtml(task.verified_by || "—")}</span> · 
        Completed By: <span class="fw-semibold text-dark">${escapeHtml(task.completed_by || "—")}</span> · 
        Completed Date & Time: <span class="fw-semibold text-dark">${completedAt}</span>
      </div>
    `;
  }

  return `
    <div class="card shadow-sm border-0 rounded-3 mb-2 mb-md-3 animate-fade-in">
      <div class="card-body p-0">
        <div class="task-header-toggle d-flex justify-content-between align-items-center p-2 p-sm-3" data-task-id="${task.id}" style="cursor:pointer;">
          <div class="pe-2 text-truncate">
            <div class="fw-bold text-dark text-truncate small-mobile-title" style="font-size:0.95rem;">
              Invoice Number: ${task.invoice_number ? escapeHtml(task.invoice_number) : "—"}
              <span class="badge bg-secondary text-white ms-1 rounded px-2" style="font-size:0.7rem;">${totalItems} SKU${totalItems === 1 ? "" : "s"}</span>
            </div>
            ${subHeaderHtml}
          </div>
          <div class="flex-shrink-0 ps-1">
            <i class="bi ${isExpanded ? "bi-chevron-up" : "bi-chevron-down"} fs-6 text-muted"></i>
          </div>
        </div>

        ${isExpanded ? renderTaskDetail(task) : ""}
      </div>
    </div>
  `;
}

function renderTaskDetail(task) {
  if (activeTab === "pending" && !allocationsState[task.id]) {
    allocationsState[task.id] = {};
    task.items.forEach((item) => {
      allocationsState[task.id][item.item_code] = [
        { location_id: "", quantity: item.quantity_to_place },
      ];
    });
  }

  const rows = task.items
    .map((item) => renderItemAllocationRow(task.id, item))
    .join("");

  return `
    <div class="border-top p-2 p-sm-3 bg-light bg-opacity-25">
      <div class="table-responsive mb-2 mb-md-3">
        <table class="table table-sm table-hover align-middle mb-0" style="font-size:0.85rem;">
          <thead class="table-light small text-uppercase" style="font-size:0.7rem;">
            <tr>
              <th class="ps-1" style="min-width:100px;">SKU / Code</th>
              <th style="min-width:130px;">Description Title</th>
              <th style="width:90px;" class="text-center">Category</th>
              <th style="width:100px;">Mfg Date</th>
              <th style="width:100px;">Expiry</th>
              <th style="width:70px;">Quantity</th>
              <th style="width:70px;">UOM</th>
              <th style="min-width:260px;">Bin Layout Allocations</th>
            </tr>
          </thead>
          <tbody id="alloc-body-${task.id}">
            ${rows}
          </tbody>
        </table>
      </div>
      
      ${
        activeTab === "pending"
          ? `
      <div id="putaway-error-${task.id}" class="alert alert-danger py-2 px-3 small border-0 shadow-sm rounded-3 mb-2 d-none" style="font-size:0.75rem;"></div>
      
      <button type="button" class="btn btn-success btn-sm w-100 py-2 fw-semibold shadow-sm complete-task-btn" data-task-id="${task.id}">
        <i class="bi bi-check2-circle me-1"></i> Complete Putaway Task
      </button>
      `
          : ""
      }
    </div>
  `;
}

function renderItemAllocationRow(taskId, item) {
  const categoryVal = item.category || "-";
  const categoryLower = categoryVal.toLowerCase().trim();
  let catBg = "#e2e8f0";
  let catColor = "#475569";

  if (categoryLower === "ambient") {
    catBg = "#f5ebe0";
    catColor = "#4e342e";
  } else if (categoryLower === "chiller") {
    catBg = "#cfe2ff";
    catColor = "#084298";
  } else if (categoryLower === "frozen") {
    catBg = "#e0f7fa";
    catColor = "#006064";
  }

  const categoryDisplay = `<span class="badge rounded-pill px-3 py-1 text-capitalize fw-bold" style="background-color: ${catBg}; color: ${catColor}; border: none; display: inline-block;">${escapeHtml(categoryVal)}</span>`;

  let allocatedRowsHtml = "";
  if (activeTab === "pending") {
    const allocations = allocationsState[taskId][item.item_code];
    allocatedRowsHtml = allocations
      .map((alloc, idx) => renderAllocationLine(taskId, item, alloc, idx))
      .join("");
  } else {
    // Read-only execution path handling plain-text row layout generation from new mapping history
    const allocations = item.allocations || [];
    if (allocations.length === 0) {
      allocatedRowsHtml = `<span class="text-muted small">—</span>`;
    } else {
      allocatedRowsHtml = allocations
        .map(
          (alloc) => `
        <div class="font-monospace text-dark py-0.5" style="font-size:0.75rem;">
          <span class="fw-bold">${escapeHtml(alloc.location_id)}</span> &nbsp;&nbsp;&nbsp;&nbsp; Qty ${alloc.quantity}
        </div>
      `,
        )
        .join("");
    }
  }

  return `
    <tr data-item-code="${escapeHtml(item.item_code)}">
      <td class="ps-1"><code class="small fw-bold font-monospace text-primary">${escapeHtml(item.item_code)}</code></td>
      <td><div class="text-secondary text-truncate" style="max-width:150px;" title="${escapeHtml(item.item_description)}">${escapeHtml(item.item_description)}</div></td>
      <td class="text-center">${categoryDisplay}</td>
      <td class="small text-muted">${item.manufacturing_date ? escapeHtml(item.manufacturing_date) : "—"}</td>
      <td class="small text-muted">${item.expiry_date ? escapeHtml(item.expiry_date) : "—"}</td>
      <td class="fw-bold text-dark">${item.quantity_to_place}</td>
      <td><small class="text-uppercase text-muted fw-bold">${escapeHtml(item.uom || "")}</small></td>
      <td class="py-2">
        <div class="d-flex flex-column gap-1.5" id="alloc-lines-${taskId}-${cssSafe(item.item_code)}">
          ${allocatedRowsHtml}
        </div>
        ${
          activeTab === "pending"
            ? `
        <button type="button" class="btn btn-xs btn-link p-0 mt-1 add-split-btn text-decoration-none fw-semibold"
                data-task-id="${taskId}" data-item-code="${escapeHtml(item.item_code)}" style="font-size:0.75rem;">
          <i class="bi bi-plus-circle me-1"></i>Split across another bin
        </button>
        `
            : ""
        }
      </td>
    </tr>
  `;
}

function renderAllocationLine(taskId, item, alloc, idx) {
  const comboboxKey = `cb-${taskId}-${cssSafe(item.item_code)}-${idx}`;

  return `
    <div class="d-flex gap-1.5 align-items-center alloc-line" data-idx="${idx}">
      <div class="location-combobox-wrapper position-relative flex-grow-1" style="max-width:150px;">
        <input id="location-${comboboxKey}"
                type="text"
                class="form-control form-control-sm alloc-location-input font-monospace text-uppercase"
                placeholder="Select Bin"
                autocomplete="off"
                value="${escapeHtml(alloc.location_id)}"
                data-task-id="${taskId}"
                data-item-code="${escapeHtml(item.item_code)}"
                data-idx="${idx}"
                data-combobox-key="${comboboxKey}"
                style="font-size:0.75rem;">
        <div
            id="dropdown-${comboboxKey}"
            class="location-dropdown-menu d-none shadow-lg border rounded bg-white position-absolute w-100"
            data-combobox-key="${comboboxKey}"
            style="top:100%;left:0;z-index:20;max-height:160px;overflow-y:auto;">
        </div>
      </div>
      
      <input type="number" min="0" class="form-control form-control-sm alloc-qty-input fw-semibold text-end" 
             placeholder="Qty"
             style="width:75px; font-size:0.75rem;" value="${alloc.quantity}"
             data-task-id="${taskId}" 
             data-item-code="${escapeHtml(item.item_code)}" 
             data-idx="${idx}">
      
      ${
        idx > 0
          ? `
        <button type="button" class="btn btn-sm btn-outline-danger btn-xs remove-split-btn px-2 border-0"
                data-task-id="${taskId}" data-item-code="${escapeHtml(item.item_code)}" data-idx="${idx}">
          <i class="bi bi-trash3-fill"></i>
        </button>
      `
          : `<div style="width:28px;"></div>`
      }
    </div>
  `;
}

// =========================================================================
// EXPANDED TASK INTERACTIONS
// =========================================================================
function wireUpExpandedTask(taskId) {
  // If viewing the completed tab archive framework, lock modifications out completely
  if (activeTab !== "pending") return;

  const container = document.getElementById(`alloc-body-${taskId}`);
  if (!container) return;

  container.querySelectorAll(".alloc-location-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      updateAllocationField(e.target, "location_id", e.target.value);
      openLocationDropdown(e.target, e.target.value);
    });
    input.addEventListener("focus", (e) => {
      openLocationDropdown(e.target, e.target.value);
    });
  });

  container.querySelectorAll(".alloc-qty-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      updateAllocationField(
        e.target,
        "quantity",
        parseFloat(e.target.value) || 0,
      );
    });
  });

  container.querySelectorAll(".add-split-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { taskId, itemCode } = btn.dataset;
      allocationsState[taskId][itemCode].push({ location_id: "", quantity: 0 });
      renderTaskList(document.getElementById("putaway-list"));
    });
  });

  container.querySelectorAll(".remove-split-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { taskId, itemCode, idx } = btn.dataset;
      allocationsState[taskId][itemCode].splice(parseInt(idx, 10), 1);
      renderTaskList(document.getElementById("putaway-list"));
    });
  });

  const completeBtn = document.querySelector(
    `.complete-task-btn[data-task-id="${taskId}"]`,
  );
  if (completeBtn) {
    completeBtn.addEventListener("click", () => completeTask(taskId));
  }
}

function updateAllocationField(inputEl, field, value) {
  const taskId = inputEl.dataset.taskId;
  const itemCode = inputEl.dataset.itemCode;
  const idx = Number(inputEl.getAttribute("data-idx"));

  if (
    allocationsState[taskId] &&
    allocationsState[taskId][itemCode] &&
    allocationsState[taskId][itemCode][idx]
  ) {
    allocationsState[taskId][itemCode][idx][field] = value;
  }
}

function openLocationDropdown(inputEl, query) {
  const comboboxKey = inputEl.dataset.comboboxKey;
  const dropdown = document.getElementById(`dropdown-${comboboxKey}`);

  if (!dropdown) return;

  const normalizedQuery = (query || "").trim().toLowerCase();
  const matches = availableLocations.filter((loc) =>
    loc.id.toLowerCase().includes(normalizedQuery),
  );

  if (availableLocations.length === 0) {
    dropdown.innerHTML = `<div class="px-2 py-1.5 small text-muted text-center" style="font-size:0.7rem;">No locations declared.</div>`;
  } else if (matches.length === 0) {
    dropdown.innerHTML = `<div class="px-2 py-1.5 small text-muted text-center" style="font-size:0.7rem;">No matches found.</div>`;
  } else {
    dropdown.innerHTML = matches
      .slice(0, 30)
      .map((loc) => {
        const badgeColor =
          loc.calculated_status === "Occupied"
            ? "bg-warning text-dark"
            : "bg-success text-white";
        return `
          <div class="px-2 py-1.5 small font-monospace location-option d-flex justify-content-between align-items-center border-bottom-dashed"
               style="cursor:pointer; font-size:0.75rem;" data-location-id="${escapeHtml(loc.id)}">
              <span class="fw-bold">${escapeHtml(loc.id)}</span>
              <span class="badge ${badgeColor}" style="font-size:0.6rem; scale:0.9;">${loc.calculated_status}</span>
          </div>`;
      })
      .join("");

    dropdown.querySelectorAll(".location-option").forEach((opt) => {
      opt.addEventListener("mousedown", (e) => {
        e.preventDefault();
        inputEl.value = opt.dataset.locationId;
        updateAllocationField(inputEl, "location_id", opt.dataset.locationId);
        closeAllComboboxDropdowns();
      });

      opt.addEventListener("mouseenter", () => opt.classList.add("bg-light"));
      opt.addEventListener("mouseleave", () =>
        opt.classList.remove("bg-light"),
      );
    });
  }

  if (openComboboxKey !== comboboxKey) {
    closeAllComboboxDropdowns();
  }

  dropdown.classList.remove("d-none");
  openComboboxKey = comboboxKey;
}

async function completeTask(taskId) {
  const errorEl = document.getElementById(`putaway-error-${taskId}`);
  errorEl.classList.add("d-none");
  errorEl.textContent = "";

  const task = tasksCache.find((t) => t.id === taskId);
  if (!task) return;

  const allocations = [];
  for (const item of task.items) {
    const lines = allocationsState[taskId][item.item_code] || [];
    for (const line of lines) {
      if (!line.location_id || !line.quantity || line.quantity <= 0) continue;
      allocations.push({
        item_code: item.item_code,
        item_description: item.item_description,
        location_id: line.location_id.trim(),
        quantity: line.quantity,
      });
    }
  }

  const expectedTotals = {};
  task.items.forEach((item) => {
    expectedTotals[item.item_code] =
      (expectedTotals[item.item_code] || 0) + item.quantity_to_place;
  });
  const submittedTotals = {};
  allocations.forEach((a) => {
    submittedTotals[a.item_code] =
      (submittedTotals[a.item_code] || 0) + a.quantity;
  });
  for (const code of Object.keys(expectedTotals)) {
    const expected = expectedTotals[code];
    const submitted = submittedTotals[code] || 0;
    if (Math.abs(expected - submitted) > 0.001) {
      errorEl.textContent = `Item '${code}': allocated quantity (${submitted}) doesn't match expected total (${expected}). Every unit must be assigned to a bin before completing.`;
      errorEl.classList.remove("d-none");
      return;
    }
  }

  const completeBtn = document.querySelector(
    `.complete-task-btn[data-task-id="${taskId}"]`,
  );
  completeBtn.disabled = true;
  completeBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Completing...`;

  try {
    const result = await Api.putaway.completeTask(taskId, allocations);
    if (!result || result.success === false) {
      throw new Error(result?.error || "Putaway completion was rejected.");
    }

    delete allocationsState[taskId];
    expandedTaskId = null;
    await refreshTasks();
  } catch (err) {
    errorEl.textContent = `Error: ${err.message}`;
    errorEl.classList.remove("d-none");
    completeBtn.disabled = false;
    completeBtn.innerHTML = `<i class="bi bi-check2-circle me-1"></i> Complete Putaway Task`;
  }
}

// =========================================================================
// UTIL
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

function escapeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cssSafe(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}
