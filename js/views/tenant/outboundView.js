import { Api } from "../../api.js";

// =========================================================================
// MODULE STATE
// =========================================================================
let pollInterval = null;
let activeShipmentId = null; // null for Manual Entry, set for AI Upload
let clientsCache = [];
let inventoryCache = [];
let lineItems = []; // [{ uid, stock_owner_id, item_code, item_description, uom, requested_quantity }]
let lastAllocations = null; // result of the last successful Verify call

function uid() {
  return "li_" + Math.random().toString(36).slice(2, 10);
}

// =========================================================================
// ENTRY POINT
// =========================================================================
export async function render(container, user) {
  stopPolling();
  activeShipmentId = null;
  lineItems = [];
  lastAllocations = null;

  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in" id="outbound-root">

      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div class="mb-2 mb-md-0">
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-truck text-primary me-2"></i>Outbound Dock
          </h3>
          <p class="text-muted small mb-0">Create outbound orders via AI Upload or Manual Entry, verify stock allocation, and commit to generate picking tasks.</p>
        </div>
      </div>

      <ul class="nav nav-tabs px-3 px-sm-0 mb-3" id="outbound-tabs">
        <li class="nav-item"><button class="nav-link active" data-tab="pending" type="button">Pending Outbounds</button></li>
        <li class="nav-item"><button class="nav-link" data-tab="manual" type="button">Manual Entry</button></li>
      </ul>

      <div id="tab-pending" class="px-3 px-sm-0">
        <div class="card border-0 shadow-sm rounded-0 rounded-sm-3 p-4 mb-4">
          <h6 class="fw-bold mb-1 text-dark">Upload Outbound Dispatch Document</h6>
          <p class="text-muted small mb-3">Accepts delivery orders / dispatch instructions for AI-assisted extraction.</p>
          <div id="dropzone" class="border rounded-3 p-4 text-center mb-3 bg-light" style="border: 2px dashed #dee2e6 !important; cursor: pointer;">
            <p class="mb-2 text-muted"><i class="bi bi-cloud-arrow-up text-primary fs-2 d-block mb-1"></i>Drag & Drop files or</p>
            <button id="browse-btn" type="button" class="btn btn-primary btn-sm"><i class="bi bi-folder2-open"></i> Browse Files</button>
            <input type="file" id="file-input" multiple accept="image/*" class="d-none">
          </div>
          <div id="upload-rows" class="mb-3 d-flex flex-column gap-2"></div>
          <button id="upload-all-btn" class="btn btn-success w-100 py-2 shadow-sm" disabled>
            <i class="bi bi-send-check"></i> Process Documents
          </button>
          <div id="upload-status" class="small mt-2"></div>
        </div>

        <div class="card border-0 shadow-sm rounded-3 overflow-hidden mb-4">
          <div style="max-height: 340px; overflow-y: auto;">
            <table class="table table-hover mb-0 align-middle">
              <thead class="table-light" style="position: sticky; top: 0; z-index: 1;">
                <tr><th class="ps-3">Shipment</th><th>Status</th><th>Created At</th><th class="pe-3 text-end">Actions</th></tr>
              </thead>
              <tbody id="list-body"><tr><td colspan="4" class="text-center text-muted py-4">Loading queue...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="tab-manual" class="px-3 px-sm-0 d-none">
        <button id="start-manual-btn" class="btn btn-outline-primary mb-3"><i class="bi bi-file-earmark-plus"></i> Start Blank Outbound Order</button>
      </div>

      <div id="workspace" class="mt-2 px-3 px-sm-0">
        <div class="card border-0 p-5 shadow-sm text-center text-muted rounded-0 rounded-sm-3">
          <i class="bi bi-clipboard-check text-muted display-6 d-block mb-3"></i>
          <h6 class="fw-bold text-secondary mb-1">No Active Workspace</h6>
          Select a shipment from Pending Outbounds, or start a Manual Entry order.
        </div>
      </div>
    </div>
  `;

  setupEventListeners(container);
  clientsCache = await Api.clients.list().catch(() => []);
  inventoryCache = await Api.inventory
    .getSnapshot()
    .then((r) => r.inventory || [])
    .catch(() => []);
  refreshQueue();
  startPolling();
}

function setupEventListeners(container) {
  container.querySelectorAll("#outbound-tabs .nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      container
        .querySelectorAll("#outbound-tabs .nav-link")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.getAttribute("data-tab");
      container
        .querySelector("#tab-pending")
        .classList.toggle("d-none", tab !== "pending");
      container
        .querySelector("#tab-manual")
        .classList.toggle("d-none", tab !== "manual");
    });
  });

  const dropzone = container.querySelector("#dropzone");
  const fileInput = container.querySelector("#file-input");
  const browseBtn = container.querySelector("#browse-btn");
  const uploadRows = container.querySelector("#upload-rows");
  const uploadAllBtn = container.querySelector("#upload-all-btn");

  let queuedFiles = [];

  browseBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => e.preventDefault());
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files));
  });
  fileInput.addEventListener("change", (e) =>
    handleFiles(Array.from(e.target.files)),
  );

  function handleFiles(files) {
    queuedFiles.push(...files);
    uploadRows.innerHTML = queuedFiles
      .map(
        (
          f,
          i,
        ) => `<div class="d-flex justify-content-between align-items-center border rounded p-2 small">
        <span><i class="bi bi-file-earmark-image me-1"></i>${f.name}</span>
        <button class="btn btn-sm btn-link text-danger" data-remove="${i}">Remove</button>
      </div>`,
      )
      .join("");
    uploadRows.querySelectorAll("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => {
        queuedFiles.splice(Number(b.getAttribute("data-remove")), 1);
        handleFiles([]);
      }),
    );
    uploadAllBtn.disabled = queuedFiles.length === 0;
  }

  uploadAllBtn.addEventListener("click", async () => {
    const statusEl = container.querySelector("#upload-status");
    uploadAllBtn.disabled = true;
    statusEl.innerHTML = `<span class="text-muted">Uploading...</span>`;
    try {
      const formData = new FormData();
      queuedFiles.forEach((f) => {
        formData.append("files", f);
        formData.append("document_types", "delivery_order");
      });
      await Api.outbound.upload(formData);
      statusEl.innerHTML = `<span class="text-success"><i class="bi bi-check-circle"></i> Uploaded. Processing in background — refresh the queue shortly.</span>`;
      queuedFiles = [];
      uploadRows.innerHTML = "";
      refreshQueue();
    } catch (err) {
      statusEl.innerHTML = `<span class="text-danger">${err.message}</span>`;
      uploadAllBtn.disabled = false;
    }
  });

  container.querySelector("#start-manual-btn").addEventListener("click", () => {
    activeShipmentId = null;
    lineItems = [];
    lastAllocations = null;
    renderWorkspace(container, { header: {}, lineItems: [] });
  });
}

async function refreshQueue() {
  const root = document.getElementById("outbound-root");
  if (!root) return;
  const listBody = root.querySelector("#list-body");
  try {
    const res = await Api.outbound.listPending();
    const shipments = res.shipments || [];
    if (shipments.length === 0) {
      listBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No pending outbound uploads.</td></tr>`;
      return;
    }
    listBody.innerHTML = shipments
      .map(
        (s) => `<tr>
        <td class="ps-3">${s.id.slice(0, 8)}...</td>
        <td><span class="badge ${s.status === "pending_verification" ? "bg-warning-subtle text-warning-emphasis" : "bg-secondary-subtle text-secondary-emphasis"}">${s.status}</span></td>
        <td>${new Date(s.created_at).toLocaleString()}</td>
        <td class="pe-3 text-end">
          <button class="btn btn-sm btn-primary" data-open="${s.id}" ${s.status !== "pending_verification" ? "disabled" : ""}>Verify</button>
        </td>
      </tr>`,
      )
      .join("");
    listBody
      .querySelectorAll("[data-open]")
      .forEach((b) =>
        b.addEventListener("click", () =>
          openStagedShipment(b.getAttribute("data-open")),
        ),
      );
  } catch (err) {
    listBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4">${err.message}</td></tr>`;
  }
}

async function openStagedShipment(shipmentId) {
  const root = document.getElementById("outbound-root");
  try {
    const res = await Api.outbound.getStaged(shipmentId);
    activeShipmentId = shipmentId;
    lastAllocations = null;
    renderWorkspace(root, res.staging || { header: {}, lineItems: [] });
  } catch (err) {
    alert(err.message);
  }
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(refreshQueue, 8000);
}
function stopPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = null;
}

// =========================================================================
// WORKSPACE — shared by AI Upload (pre-populated) and Manual Entry (blank)
// =========================================================================
function renderWorkspace(root, staging) {
  lineItems = (staging.lineItems || []).map((item) => ({
    uid: uid(),
    stock_owner_id: "",
    item_code: item.item_code || "",
    item_description: item.item_description || "",
    uom: item.uom || "PCS",
    requested_quantity: item.requested_quantity || 0,
  }));

  const workspace = root.querySelector("#workspace");
  workspace.innerHTML = `
    <div class="card border-0 shadow-sm rounded-0 rounded-sm-3 p-4">
      <h6 class="fw-bold mb-3">${activeShipmentId ? "AI-Populated Outbound Order" : "Manual Outbound Order"}</h6>

      <div class="row g-3 mb-3">
        <div class="col-md-4">
          <label class="form-label small fw-semibold">Client</label>
          <select id="client-select" class="form-select form-select-sm">
            <option value="">Select client...</option>
            ${clientsCache.map((c) => `<option value="${c.id}">${c.name} (${c.code})</option>`).join("")}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label small fw-semibold">E-Way Bill No.</label>
          <input id="eway-input" type="text" class="form-control form-control-sm" value="${staging.header?.eway_bill_number || ""}">
        </div>
        <div class="col-md-4">
          <label class="form-label small fw-semibold">Vehicle Number</label>
          <input id="vehicle-input" type="text" class="form-control form-control-sm" value="${staging.header?.vehicle_number || ""}">
        </div>
        <div class="col-md-4">
          <label class="form-label small fw-semibold">Transporter</label>
          <input id="transporter-input" type="text" class="form-control form-control-sm" value="${staging.header?.transporter_name || ""}">
        </div>
      </div>

      <datalist id="item-code-list">
        ${[...new Set(inventoryCache.map((i) => i.item_code))].map((c) => `<option value="${c}">`).join("")}
      </datalist>

      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="fw-bold mb-0 small text-secondary">Line Items</h6>
        <button id="add-line-btn" class="btn btn-sm btn-outline-primary"><i class="bi bi-plus-lg"></i> Add Line</button>
      </div>

      <div class="table-responsive mb-3">
        <table class="table table-sm align-middle">
          <thead class="table-light"><tr>
            <th>Item Code</th><th>Description</th><th>Stock Owner</th><th>UOM</th><th>Qty</th><th></th>
          </tr></thead>
          <tbody id="line-items-body"></tbody>
        </table>
      </div>

      <div id="allocation-accordion" class="mb-3"></div>
      <div id="verify-errors" class="mb-3"></div>

      <div class="d-flex gap-2">
        <button id="verify-btn" class="btn btn-secondary"><i class="bi bi-check2-square"></i> Verify</button>
        <button id="commit-btn" class="btn btn-success" disabled><i class="bi bi-send-check"></i> Commit</button>
      </div>
    </div>
  `;

  renderLineItemsBody(workspace);

  workspace.querySelector("#add-line-btn").addEventListener("click", () => {
    lineItems.push({
      uid: uid(),
      stock_owner_id: "",
      item_code: "",
      item_description: "",
      uom: "PCS",
      requested_quantity: 0,
    });
    renderLineItemsBody(workspace);
  });

  workspace
    .querySelector("#verify-btn")
    .addEventListener("click", () => runVerify(workspace));
  workspace
    .querySelector("#commit-btn")
    .addEventListener("click", () => runCommit(workspace));
}

function renderLineItemsBody(workspace) {
  const body = workspace.querySelector("#line-items-body");
  body.innerHTML = lineItems
    .map(
      (item) => `<tr data-uid="${item.uid}">
      <td><input type="text" list="item-code-list" class="form-control form-control-sm" data-field="item_code" value="${item.item_code}"></td>
      <td><input type="text" class="form-control form-control-sm" data-field="item_description" value="${item.item_description}"></td>
      <td><select class="form-select form-select-sm" data-field="stock_owner_id"><option value="">...</option></select></td>
      <td><input type="text" class="form-control form-control-sm" style="width:80px" data-field="uom" value="${item.uom}"></td>
      <td><input type="number" min="0" step="any" class="form-control form-control-sm" style="width:100px" data-field="requested_quantity" value="${item.requested_quantity}"></td>
      <td><button class="btn btn-sm btn-link text-danger" data-remove-line><i class="bi bi-trash"></i></button></td>
    </tr>`,
    )
    .join("");

  body.querySelectorAll("tr").forEach((row) => {
    const itemUid = row.getAttribute("data-uid");
    const item = lineItems.find((l) => l.uid === itemUid);

    row.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        item[input.getAttribute("data-field")] = input.value;
      });
    });

    row.querySelector("[data-remove-line]").addEventListener("click", () => {
      lineItems = lineItems.filter((l) => l.uid !== itemUid);
      renderLineItemsBody(workspace);
    });

    const clientId = workspace.querySelector("#client-select").value;
    const stockOwnerSelect = row.querySelector('[data-field="stock_owner_id"]');
    if (clientId) {
      Api.stockOwners.list(clientId).then((owners) => {
        stockOwnerSelect.innerHTML =
          `<option value="">Select...</option>` +
          owners
            .map(
              (o) =>
                `<option value="${o.id}" ${o.id === item.stock_owner_id ? "selected" : ""}>${o.name} (${o.code})</option>`,
            )
            .join("");
      });
    }
  });

  workspace
    .querySelector("#client-select")
    .addEventListener("change", () => renderLineItemsBody(workspace), {
      once: true,
    });
}

async function runVerify(workspace) {
  const errorsEl = workspace.querySelector("#verify-errors");
  const accordionEl = workspace.querySelector("#allocation-accordion");
  const commitBtn = workspace.querySelector("#commit-btn");
  errorsEl.innerHTML = "";
  accordionEl.innerHTML = "";
  commitBtn.disabled = true;

  const client_id = workspace.querySelector("#client-select").value;
  const payload = {
    client_id,
    header: {
      eway_bill_number: workspace.querySelector("#eway-input").value,
      transporter_name: workspace.querySelector("#transporter-input").value,
      vehicle_number: workspace.querySelector("#vehicle-input").value,
    },
    lineItems: lineItems.map((l) => ({
      stock_owner_id: l.stock_owner_id,
      item_code: l.item_code,
      item_description: l.item_description,
      uom: l.uom,
      requested_quantity: l.requested_quantity,
    })),
  };

  try {
    const res = await Api.outbound.verify(payload);
    if (!res.success) {
      errorsEl.innerHTML = `<div class="alert alert-danger small mb-0"><ul class="mb-0">${res.errors.map((e) => `<li>${e}</li>`).join("")}</ul></div>`;
      return;
    }
    lastAllocations = res.allocations;
    accordionEl.innerHTML = `<div class="accordion" id="alloc-acc">${res.allocations
      .map(
        (a, idx) => `<div class="accordion-item">
        <h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#alloc-${idx}">
          ${a.item_code} — ${a.allocated_quantity} ${a.uom} allocated across ${a.allocations.length} location(s)
        </button></h2>
        <div id="alloc-${idx}" class="accordion-collapse collapse" data-bs-parent="#alloc-acc">
          <div class="accordion-body p-2">
            <table class="table table-sm mb-0"><thead><tr><th>Location</th><th>Batch</th><th>Expiry</th><th>Qty</th></tr></thead>
            <tbody>${a.allocations.map((al) => `<tr><td>${al.location_id}</td><td>${al.batch_number || "-"}</td><td>${al.expiry_date || "-"}</td><td>${al.quantity}</td></tr>`).join("")}</tbody></table>
          </div>
        </div>
      </div>`,
      )
      .join("")}</div>`;
    commitBtn.disabled = false;
  } catch (err) {
    errorsEl.innerHTML = `<div class="alert alert-danger small mb-0">${err.message}</div>`;
  }
}

async function runCommit(workspace) {
  const commitBtn = workspace.querySelector("#commit-btn");
  const errorsEl = workspace.querySelector("#verify-errors");
  commitBtn.disabled = true;
  commitBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Committing...`;

  const client_id = workspace.querySelector("#client-select").value;
  const payload = {
    shipmentId: activeShipmentId,
    client_id,
    header: {
      eway_bill_number: workspace.querySelector("#eway-input").value,
      transporter_name: workspace.querySelector("#transporter-input").value,
      vehicle_number: workspace.querySelector("#vehicle-input").value,
    },
    lineItems: lineItems.map((l) => ({
      stock_owner_id: l.stock_owner_id,
      item_code: l.item_code,
      item_description: l.item_description,
      uom: l.uom,
      requested_quantity: l.requested_quantity,
    })),
  };

  try {
    await Api.outbound.commit(payload);
    workspace.querySelector("#workspace") || null;
    document
      .getElementById("outbound-root")
      .querySelector("#workspace").innerHTML =
      `<div class="alert alert-success">Outbound order committed. Picking task generated — see Picking Tasks.</div>`;
    activeShipmentId = null;
    refreshQueue();
  } catch (err) {
    errorsEl.innerHTML = `<div class="alert alert-danger small mb-0">${err.message} — stock may have changed, please re-verify.</div>`;
    commitBtn.disabled = false;
    commitBtn.innerHTML = `<i class="bi bi-send-check"></i> Commit`;
  }
}
