import { Api } from "../../api.js";

// =========================================================================
// MODULE STATE
// =========================================================================
let pollInterval = null;
let activeTab = "pending";
let tasksCache = [];

export async function render(container, user) {
  stopPolling();
  activeTab = "pending";
  tasksCache = [];

  container.innerHTML = `
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
        <li class="nav-item"><button class="nav-link active fw-semibold text-sm" data-tab="pending" type="button">Pending Tasks</button></li>
        <li class="nav-item"><button class="nav-link fw-semibold text-sm" data-tab="completed" type="button">Completed Tasks</button></li>
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
      const listEl = document.getElementById("picking-list");
      if (listEl) {
        listEl.innerHTML = `<div class="text-center text-muted py-5">
          <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
          <div class="small">Loading ${activeTab} picking tasks...</div></div>`;
      }
      refreshTasks();
    });
  });

  await refreshTasks();
  startPolling();
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

    if (tasksCache.length === 0) {
      listEl.innerHTML = `<div class="card border-0 p-5 shadow-sm text-center text-muted rounded-3">
        <i class="bi bi-inboxes text-muted display-6 d-block mb-3"></i>
        No ${activeTab} picking tasks.
      </div>`;
      return;
    }

    listEl.innerHTML = `<div class="accordion" id="picking-accordion">${tasksCache.map((t, idx) => renderTaskCard(t, idx)).join("")}</div>`;

    tasksCache.forEach((t, idx) => {
      const completeBtn = document.getElementById(`complete-btn-${idx}`);
      if (completeBtn) {
        completeBtn.addEventListener("click", () => completePicking(t, idx));
      }
    });
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderTaskCard(task, idx) {
  const itemsHtml = (task.items || [])
    .map(
      (item) => `<tr data-item-id="${item.id}">
        <td>${item.item_code}<div class="text-muted small">${item.item_description || ""}</div></td>
        <td>${item.location_id}</td>
        <td>${item.batch_number || "-"}</td>
        <td>${item.expiry_date || "-"}</td>
        <td>${item.quantity_to_pick} ${item.uom}</td>
        <td>
          ${
            activeTab === "pending"
              ? `<input type="number" class="form-control form-control-sm picked-qty-input" style="width:100px" min="0" step="any" max="${item.quantity_to_pick}" value="${item.quantity_to_pick}">`
              : `<span class="badge bg-success-subtle text-success-emphasis">${item.status}</span>`
          }
        </td>
      </tr>`,
    )
    .join("");

  return `
    <div class="accordion-item mb-2 border rounded-3 overflow-hidden">
      <h2 class="accordion-header">
        <button class="accordion-button ${idx === 0 ? "" : "collapsed"}" type="button" data-bs-toggle="collapse" data-bs-target="#picking-task-${idx}">
          <div class="d-flex flex-column">
            <span class="fw-semibold">${task.client_name || "Unknown Client"} <span class="text-muted small">(${task.client_code || ""})</span></span>
            <span class="text-muted small">E-Way Bill: ${task.eway_bill_number || "-"} • Vehicle: ${task.vehicle_number || "-"} • ${(task.items || []).length} item(s)</span>
          </div>
        </button>
      </h2>
      <div id="picking-task-${idx}" class="accordion-collapse collapse ${idx === 0 ? "show" : ""}" data-bs-parent="#picking-accordion">
        <div class="accordion-body p-3">
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-3">
              <thead class="table-light"><tr><th>Item</th><th>Location</th><th>Batch</th><th>Expiry</th><th>Allocated</th><th>${activeTab === "pending" ? "Picked Qty" : "Status"}</th></tr></thead>
              <tbody>${itemsHtml}</tbody>
            </table>
          </div>
          ${
            activeTab === "pending"
              ? `<button id="complete-btn-${idx}" class="btn btn-success"><i class="bi bi-check2-circle"></i> Complete Picking</button>`
              : `<span class="text-muted small">Completed by ${task.completed_by || "-"} at ${task.completed_at ? new Date(task.completed_at).toLocaleString() : "-"}</span>`
          }
        </div>
      </div>
    </div>
  `;
}

async function completePicking(task, idx) {
  const card = document.querySelectorAll("#picking-accordion .accordion-item")[
    idx
  ];
  const btn = document.getElementById(`complete-btn-${idx}`);
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Completing...`;

  const pickedItems = [];
  card.querySelectorAll("tr[data-item-id]").forEach((row) => {
    const input = row.querySelector(".picked-qty-input");
    if (!input) return;
    pickedItems.push({
      picking_task_item_id: row.getAttribute("data-item-id"),
      picked_quantity: parseFloat(input.value) || 0,
    });
  });

  try {
    await Api.picking.completeTask(task.id, pickedItems);
    refreshTasks();
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-check2-circle"></i> Complete Picking`;
  }
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(() => {
    if (activeTab === "pending") refreshTasks();
  }, 15000);
}
function stopPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = null;
}
