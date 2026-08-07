import { Api } from "../../api.js";

// =========================================================================
// MODULE STATE
// =========================================================================
let pollInterval = null;
let activeShipmentId = null;
let clientsCache = [];
let inventoryCache = [];
let stockOwnersCache = [];
let lineItems = [];
let lastQueueHash = "";
let currentUploadFiles = [];
let uploadObjectUrlsMap = {};

function uid() {
  return "li_" + Math.random().toString(36).slice(2, 10);
}

// =========================================================================
// UNMOUNT / CLEANUP HOOK
// =========================================================================
export function dispose() {
  stopPolling();
  Object.values(uploadObjectUrlsMap).forEach((url) => URL.revokeObjectURL(url));
  activeShipmentId = null;
  lineItems = [];
  lastQueueHash = "";
  currentUploadFiles = [];
  uploadObjectUrlsMap = {};
}

// =========================================================================
// ENTRY POINT
// =========================================================================
export async function render(container, user) {
  dispose();

  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in" id="outbound-root">

      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div class="mb-2 mb-md-0">
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-truck text-primary me-2"></i>Outbound Dock
          </h3>
          <p class="text-muted small mb-0">Create outbound orders via AI Upload or Manual Entry, verify stock allocation, and commit to generate picking tasks.</p>
        </div>
        <div class="mt-2 mt-md-0">
          <button id="refresh-queue-btn" class="btn btn-sm btn-outline-secondary shadow-sm">
            <i class="bi bi-arrow-clockwise"></i> Refresh Queue
          </button>
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
            <div class="d-flex flex-wrap justify-content-center gap-2">
              <button id="browse-btn" type="button" class="btn btn-primary btn-sm"><i class="bi bi-folder2-open"></i> Browse Files</button>
            </div>
            <input type="file" id="file-input" multiple accept="image/*" class="d-none">
          </div>

          <div id="upload-rows" class="mb-3 d-flex flex-column gap-2"></div>
          <button id="upload-all-btn" class="btn btn-success w-100 py-2 shadow-sm" disabled>
            <i class="bi bi-send-check shadow-sm"></i> Process Documents
          </button>
          <div id="upload-status" class="small mt-2"></div>
        </div>

        <div class="mb-4">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h5 class="fw-bold text-secondary mb-0">Pending Approval</h5>
          </div>
          <p class="text-muted small">Outbound orders still processing or awaiting verification.</p>
          <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
            <div style="max-height: 340px; overflow-y: auto;">
              <table class="table table-hover mb-0 align-middle">
                <thead class="table-light" style="position: sticky; top: 0; z-index: 1;">
                  <tr>
                    <th class="ps-3">Shipment</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th class="pe-3 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody id="list-body-outbound">
                  <tr><td colspan="4" class="text-center text-muted py-4">Loading queue...</td></tr>
                </tbody>
              </table>
            </div>
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

    <div class="modal fade" id="previewModal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-3">
          <div class="modal-header border-bottom py-2 bg-light">
            <h6 class="modal-title fw-bold"><i class="bi bi-image me-1"></i> Document Preview</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-0 text-center bg-dark rounded-bottom">
            <img src="" id="modal-img" class="img-fluid" style="max-height: 80vh; object-fit: contain;">
          </div>
        </div>
      </div>
    </div>
  `;

  setupEventListeners(container);
  clientsCache = await Api.clients.list().catch(() => []);
  await refreshInventoryCache();
  await refreshQueue(true);
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

  browseBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-primary", "bg-primary-subtle");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-primary", "bg-primary-subtle");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-primary", "bg-primary-subtle");
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });

  container.querySelector("#upload-all-btn").onclick = uploadAllFiles;
  container.querySelector("#refresh-queue-btn").onclick = () =>
    refreshQueue(true);

  container
    .querySelector("#start-manual-btn")
    .addEventListener("click", async () => {
      activeShipmentId = null;
      lineItems = [];
      stockOwnersCache = [];
      await refreshInventoryCache();
      const root = document.getElementById("outbound-root");
      renderWorkspace(root, { header: {}, lineItems: [] });
    });
}

function handleFiles(files) {
  Array.from(files).forEach((file) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    currentUploadFiles.push({ id, file });
    uploadObjectUrlsMap[id] = URL.createObjectURL(file);

    const row = document.createElement("div");
    row.className =
      "upload-row d-flex align-items-center gap-2 p-2 border rounded-3 bg-white shadow-sm animate-fade-in";
    row.dataset.id = id;
    row.innerHTML = `
      <img src="${uploadObjectUrlsMap[id]}" class="preview-thumb rounded border" data-id="${id}"
           style="width:44px;height:44px;object-fit:cover;cursor:pointer;" title="Click to view full image">
      <div class="flex-grow-1 small text-truncate">
        <div class="fw-semibold text-dark text-truncate" title="${file.name}">${file.name}</div>
        <div class="text-muted">${(file.size / 1024).toFixed(1)} KB</div>
      </div>
      <button type="button" class="btn btn-sm btn-outline-danger remove-row-btn me-1" data-id="${id}">
        <i class="bi bi-x-lg"></i>
      </button>
    `;
    document.getElementById("upload-rows").appendChild(row);
  });

  document.querySelectorAll(".preview-thumb").forEach((img) => {
    img.onclick = () => {
      document.getElementById("modal-img").src =
        uploadObjectUrlsMap[img.dataset.id];
      new bootstrap.Modal(document.getElementById("previewModal")).show();
    };
  });

  document.querySelectorAll(".remove-row-btn").forEach((btn) => {
    btn.onclick = () => removeUploadRow(btn.dataset.id);
  });

  document.getElementById("upload-all-btn").disabled =
    currentUploadFiles.length === 0;
}

function removeUploadRow(id) {
  currentUploadFiles = currentUploadFiles.filter((f) => f.id !== id);
  if (uploadObjectUrlsMap[id]) {
    URL.revokeObjectURL(uploadObjectUrlsMap[id]);
    delete uploadObjectUrlsMap[id];
  }
  const row = document.querySelector(`.upload-row[data-id="${id}"]`);
  if (row) row.remove();
  document.getElementById("upload-all-btn").disabled =
    currentUploadFiles.length === 0;
}

async function uploadAllFiles() {
  const uploadBtn = document.getElementById("upload-all-btn");
  const statusEl = document.getElementById("upload-status");
  uploadBtn.disabled = true;
  statusEl.className = "small mt-2 text-muted";
  statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Uploading documents and processing OCR...`;

  try {
    const formData = new FormData();
    currentUploadFiles.forEach((item) => {
      formData.append("files", item.file);
      formData.append("document_types", "delivery_order");
    });

    await Api.outbound.upload(formData);

    Object.values(uploadObjectUrlsMap).forEach((url) =>
      URL.revokeObjectURL(url),
    );
    uploadObjectUrlsMap = {};
    currentUploadFiles = [];
    document.getElementById("upload-rows").innerHTML = "";

    statusEl.className = "small mt-2 text-success fw-semibold";
    statusEl.innerHTML = `<i class="bi bi-check-circle-fill"></i> Uploaded! Document is processing — it will appear in the queue shortly.`;

    refreshQueue(true);
  } catch (err) {
    statusEl.className = "small mt-2 text-danger fw-semibold";
    statusEl.textContent = `Error: ${err.message}`;
    uploadBtn.disabled = currentUploadFiles.length === 0;
  }
}

// =========================================================================
// QUEUE & POLLING
// =========================================================================
function startPolling() {
  stopPolling();
  pollInterval = setInterval(() => refreshQueue(false), 8000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function refreshQueue(forceRefresh = false) {
  const root = document.getElementById("outbound-root");
  if (!root) return;
  const listBody = root.querySelector("#list-body-outbound");
  if (!listBody) return;

  try {
    const res = await Api.outbound.listPending();
    const shipments = res.shipments || [];

    const currentHash = JSON.stringify(shipments);
    if (!forceRefresh && currentHash === lastQueueHash) return;
    lastQueueHash = currentHash;

    if (shipments.length === 0) {
      listBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Nothing pending. Upload a document above to get started.</td></tr>`;
      return;
    }

    listBody.innerHTML = shipments.map((s) => renderQueueRow(s)).join("");

    listBody.querySelectorAll(".verify-btn").forEach((btn) => {
      btn.onclick = () => openStagedShipment(btn.dataset.id);
    });
  } catch (err) {
    listBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderQueueRow(s) {
  const shortId = s.id ? s.id.substring(0, 8) + "..." : "N/A";
  const isActive = s.id === activeShipmentId;
  const createdAt = formatTimestamp(s.created_at);

  if (s.status === "pending_verification" || s.status === "pending") {
    return `
      <tr class="${isActive ? "table-primary fw-medium" : ""}">
        <td class="ps-3"><code class="small text-primary">${shortId}</code></td>
        <td><span class="badge bg-success-subtle text-success px-2 py-1 border border-success-subtle rounded-pill">Ready to Verify</span></td>
        <td class="text-muted small">${createdAt}</td>
        <td class="pe-3 text-end">
          <button class="btn btn-sm btn-primary verify-btn shadow-sm" data-id="${s.id}">
            <i class="bi bi-clipboard-check"></i> Verify
          </button>
        </td>
      </tr>`;
  }

  return `
    <tr>
      <td class="ps-3"><code class="small text-muted">${shortId}</code></td>
      <td>
        <span class="badge bg-warning text-warning-dominant px-2 py-1 border border-warning-subtle rounded-pill d-inline-flex align-items-center gap-1">
          <span class="spinner-border spinner-border-sm" style="width:0.65rem;height:0.65rem;border-width:1.5px;"></span>
          ${escapeHtml(s.status || "Processing")}
        </span>
      </td>
      <td class="text-muted small">${createdAt}</td>
      <td class="pe-3 text-end text-muted small">OCR Extraction...</td>
    </tr>`;
}

async function openStagedShipment(shipmentId) {
  const root = document.getElementById("outbound-root");
  try {
    const [res] = await Promise.all([
      Api.outbound.getStaged(shipmentId),
      refreshInventoryCache(),
    ]);
    activeShipmentId = shipmentId;
    renderWorkspace(root, res.staging || { header: {}, lineItems: [] });
    refreshQueue(true);
  } catch (err) {
    alert(err.message);
  }
}

async function refreshInventoryCache() {
  try {
    const res = await Api.inventory.getSnapshot();
    inventoryCache = res.inventory || [];
  } catch (err) {
    console.warn("Failed to load inventory snapshot:", err);
  }
}

function runAutoValidationPass(selectedClientId) {
  if (!selectedClientId) return;

  const scopedInventory = inventoryCache.filter(
    (i) => String(i.client_id) === String(selectedClientId),
  );

  lineItems.forEach((item) => {
    const searchCode = String(item.item_code || "").trim();
    if (!searchCode) {
      item.resolved = false;
      return;
    }

    const matches = scopedInventory.filter(
      (inv) => inv.item_code === searchCode,
    );
    if (matches.length === 0) {
      item.resolved = false;
      return;
    }

    const distinctStockOwners = [
      ...new Set(matches.map((m) => String(m.stock_owner_id))),
    ];

    if (distinctStockOwners.length === 1 || item.stock_owner_id) {
      const target =
        matches.find(
          (m) => String(m.stock_owner_id) === String(item.stock_owner_id),
        ) || matches[0];
      item.item_code = target.item_code;
      item.item_description =
        item.item_description || target.item_description || "";
      item.uom = target.uom || "PCS";
      item.stock_owner_id = item.stock_owner_id || target.stock_owner_id;
      item.resolved = true;
    } else {
      item.resolved = false;
    }
  });
}

function createAutocomplete(inputEl, fieldType, item, workspace) {
  let dropdownEl = null;

  function closeDropdown() {
    if (dropdownEl) {
      dropdownEl.remove();
      dropdownEl = null;
    }
  }

  function getClientScopedUniqueInventory() {
    const selectedClientId = workspace.querySelector("#client-select").value;
    if (!selectedClientId) return [];

    const scoped = inventoryCache.filter(
      (inv) => String(inv.client_id) === String(selectedClientId),
    );

    const map = new Map();
    scoped.forEach((inv) => {
      const key = `${inv.item_code}|${inv.item_description}|${inv.uom}|${inv.stock_owner_id}`;
      if (!map.has(key)) map.set(key, inv);
    });

    return Array.from(map.values());
  }

  function renderDropdown(matches) {
    closeDropdown();
    if (matches.length === 0) return;

    dropdownEl = document.createElement("div");
    dropdownEl.className =
      "dropdown-menu show shadow-sm border rounded-3 p-1 position-absolute w-100";
    dropdownEl.style.maxHeight = "220px";
    dropdownEl.style.overflowY = "auto";
    dropdownEl.style.zIndex = "1050";

    matches.forEach((rec) => {
      const itemEl = document.createElement("a");
      itemEl.href = "#";
      itemEl.className =
        "dropdown-item text-wrap py-2 border-bottom border-light small";

      const ownerObj = stockOwnersCache.find(
        (so) => String(so.id) === String(rec.stock_owner_id),
      );
      const stockOwnerStr = ownerObj
        ? `${ownerObj.name} (${ownerObj.code})`
        : "N/A";

      itemEl.innerHTML = `<strong>${rec.item_code}</strong> | ${rec.item_description || "-"} | <span class="badge bg-light text-dark border">${rec.uom}</span> | <span class="text-primary">${stockOwnerStr}</span>`;

      itemEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectRecord(rec);
      });

      dropdownEl.appendChild(itemEl);
    });

    const parentTd = inputEl.closest("td");
    parentTd.style.position = "relative";
    parentTd.appendChild(dropdownEl);
  }

  function selectRecord(rec) {
    item.item_code = rec.item_code;
    item.item_description = rec.item_description || "";
    item.uom = rec.uom;
    item.stock_owner_id = rec.stock_owner_id;
    item.resolved = true;

    closeDropdown();
    renderLineItemsBody(workspace);
  }

  inputEl.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    item[fieldType] = e.target.value;
    item.resolved = false;
    inputEl.classList.remove("is-invalid");

    if (!query) {
      closeDropdown();
      return;
    }

    const scoped = getClientScopedUniqueInventory();
    const matches = scoped.filter((inv) => {
      const targetVal = String(inv[fieldType] || "").toLowerCase();
      return targetVal.includes(query);
    });

    renderDropdown(matches);
  });

  inputEl.addEventListener("blur", () => {
    setTimeout(closeDropdown, 200);
  });
}

async function renderWorkspace(root, staging) {
  lineItems = (staging.lineItems || []).map((item) => ({
    uid: uid(),
    stock_owner_id: item.stock_owner_id || "",
    item_code: item.item_code || "",
    item_description: item.item_description || "",
    uom: item.uom || "PCS",
    requested_quantity: item.requested_quantity || 0,
    resolved: false,
  }));

  const workspace = root.querySelector("#workspace");
  workspace.innerHTML = `
    <div class="card border-0 shadow-sm rounded-0 rounded-sm-3 p-4">
      <h6 class="fw-bold mb-3">${activeShipmentId ? "AI-Populated Outbound Order" : "Manual Outbound Order"}</h6>

      <div class="row g-3 mb-3">
        <div class="col-md-4">
          <label class="form-label small fw-semibold">Client <span class="text-danger">*</span></label>
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

      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="fw-bold mb-0 small text-secondary">Line Items</h6>
        <button id="add-line-btn" class="btn btn-sm btn-outline-primary" disabled><i class="bi bi-plus-lg"></i> Add Line</button>
      </div>

      <div class="table-responsive mb-3" style="overflow-x: visible;">
        <table class="table table-sm align-middle">
          <thead class="table-light"><tr>
            <th style="width:6%">No.</th>
            <th style="width:20%">Item Code</th>
            <th style="width:26%">Description</th>
            <th style="width:20%">Stock Owner</th>
            <th style="width:8%">UOM</th>
            <th style="width:10%">Qty</th>
            <th></th>
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

  const clientSelect = workspace.querySelector("#client-select");

  clientSelect.addEventListener("change", async () => {
    const clientId = clientSelect.value;
    if (clientId) {
      stockOwnersCache = await Api.stockOwners.list(clientId).catch(() => []);
      runAutoValidationPass(clientId);
    } else {
      stockOwnersCache = [];
    }
    renderLineItemsBody(workspace);
  });

  workspace.querySelector("#add-line-btn").addEventListener("click", () => {
    if (!clientSelect.value) return;
    lineItems.push({
      uid: uid(),
      stock_owner_id:
        stockOwnersCache.length === 1 ? stockOwnersCache[0].id : "",
      item_code: "",
      item_description: "",
      uom: "PCS",
      requested_quantity: 0,
      resolved: false,
    });
    renderLineItemsBody(workspace);
  });

  workspace
    .querySelector("#verify-btn")
    .addEventListener("click", () => runVerify(workspace));
  workspace
    .querySelector("#commit-btn")
    .addEventListener("click", () => runCommit(workspace));

  renderLineItemsBody(workspace);
}

function renderLineItemsBody(workspace) {
  const body = workspace.querySelector("#line-items-body");
  const clientSelect = workspace.querySelector("#client-select");
  const addLineBtn = workspace.querySelector("#add-line-btn");
  const isClientSelected = Boolean(clientSelect.value);

  addLineBtn.disabled = !isClientSelected;

  body.innerHTML = lineItems
    .map((item, idx) => {
      const isInvalid = !item.resolved;

      const stockOwnerOptionsHtml =
        stockOwnersCache.length > 0
          ? `<option value="" disabled ${!item.stock_owner_id ? "selected" : ""}>Select Stock Owner</option>` +
            stockOwnersCache
              .map(
                (so) =>
                  `<option value="${so.id}" ${String(item.stock_owner_id) === String(so.id) ? "selected" : ""}>${so.name} (${so.code})</option>`,
              )
              .join("")
          : `<option value="" disabled selected>Select Client First</option>`;

      return `<tr data-uid="${item.uid}">
      <td class="text-center text-muted small">${idx + 1}</td>
      <td>
        <input type="text" class="form-control form-control-sm ${isInvalid ? "is-invalid" : ""}" data-field="item_code" value="${item.item_code}" ${!isClientSelected ? "disabled" : ""} placeholder="Search code...">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm" data-field="item_description" value="${item.item_description}" ${!isClientSelected ? "disabled" : ""} placeholder="Search description...">
      </td>
      <td>
        <select class="form-select form-select-sm stock-owner-select" data-field="stock_owner_id" ${!isClientSelected ? "disabled" : ""}>
          ${stockOwnerOptionsHtml}
        </select>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm bg-light text-muted" style="width:80px" value="${item.uom}" readonly tabindex="-1">
      </td>
      <td>
        <input type="number" min="0" step="any" class="form-control form-control-sm" style="width:100px" data-field="requested_quantity" value="${item.requested_quantity}">
      </td>
      <td>
        <button class="btn btn-sm btn-link text-danger" data-remove-line><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
    })
    .join("");

  body.querySelectorAll("tr").forEach((row) => {
    const itemUid = row.getAttribute("data-uid");
    const item = lineItems.find((l) => l.uid === itemUid);

    const codeInput = row.querySelector('[data-field="item_code"]');
    const descInput = row.querySelector('[data-field="item_description"]');
    const ownerSelect = row.querySelector(".stock-owner-select");
    const qtyInput = row.querySelector('[data-field="requested_quantity"]');

    if (isClientSelected) {
      createAutocomplete(codeInput, "item_code", item, workspace);
      createAutocomplete(descInput, "item_description", item, workspace);
    }

    ownerSelect.addEventListener("change", (e) => {
      item.stock_owner_id = e.target.value;
      if (item.item_code) {
        const client_id = workspace.querySelector("#client-select").value;
        const exists = inventoryCache.some(
          (inv) =>
            String(inv.client_id) === String(client_id) &&
            inv.item_code === item.item_code &&
            String(inv.stock_owner_id) === String(item.stock_owner_id),
        );
        item.resolved = exists;
      }
      renderLineItemsBody(workspace);
    });

    qtyInput.addEventListener("input", () => {
      item.requested_quantity = parseFloat(qtyInput.value) || 0;
    });

    row.querySelector("[data-remove-line]").addEventListener("click", () => {
      lineItems = lineItems.filter((l) => l.uid !== itemUid);
      renderLineItemsBody(workspace);
    });
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
  if (!client_id) {
    errorsEl.innerHTML = `<div class="alert alert-danger small mb-0">Please select a Client before verifying.</div>`;
    return;
  }

  let hasUnresolved = false;
  lineItems.forEach((l) => {
    if (!l.resolved || !l.stock_owner_id) {
      hasUnresolved = true;
      const tr = workspace.querySelector(`tr[data-uid="${l.uid}"]`);
      if (tr) {
        const codeInput = tr.querySelector('[data-field="item_code"]');
        if (codeInput) codeInput.classList.add("is-invalid");
      }
    }
  });

  if (hasUnresolved) {
    errorsEl.innerHTML = `<div class="alert alert-danger small mb-0">One or more line items are unresolved or missing a valid stock owner. Please select valid items and stock owners.</div>`;
    return;
  }

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
      errorsEl.innerHTML = `<div class="alert alert-danger small mb-0"><ul class="mb-0">${res.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>`;
      return;
    }
    accordionEl.innerHTML = `<div class="accordion" id="alloc-acc">${res.allocations
      .map(
        (a, idx) => `
      <div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#alloc-${idx}">
            ${escapeHtml(a.item_code)} — ${a.allocated_quantity} ${escapeHtml(a.uom)} allocated across ${a.allocations.length} location(s)
          </button>
        </h2>
        <div id="alloc-${idx}" class="accordion-collapse collapse" data-bs-parent="#alloc-acc">
          <div class="accordion-body p-2">
            <table class="table table-sm mb-0">
              <thead><tr><th>Location</th><th>Batch</th><th>Expiry</th><th>Qty</th></tr></thead>
              <tbody>${a.allocations.map((al) => `<tr><td>${escapeHtml(al.location_id)}</td><td>${escapeHtml(al.batch_number || "-")}</td><td>${escapeHtml(al.expiry_date || "-")}</td><td>${al.quantity}</td></tr>`).join("")}</tbody>
            </table>
          </div>
        </div>
      </div>`,
      )
      .join("")}</div>`;
    commitBtn.disabled = false;
  } catch (err) {
    errorsEl.innerHTML = `<div class="alert alert-danger small mb-0">${escapeHtml(err.message)}</div>`;
  }
}

async function runCommit(workspace) {
  const commitBtn = workspace.querySelector("#commit-btn");
  const errorsEl = workspace.querySelector("#verify-errors");
  commitBtn.disabled = true;
  commitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Committing...`;

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
    document
      .getElementById("outbound-root")
      .querySelector("#workspace").innerHTML = `
      <div class="alert alert-success"><i class="bi bi-check-circle me-2"></i>Outbound order committed. Picking task generated — see Picking Tasks.</div>`;
    activeShipmentId = null;
    refreshQueue(true);
  } catch (err) {
    errorsEl.innerHTML = `<div class="alert alert-danger small mb-0">${escapeHtml(err.message)}</div>`;
    commitBtn.disabled = false;
    commitBtn.innerHTML = `<i class="bi bi-send-check me-1"></i> Commit`;
  }
}

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
