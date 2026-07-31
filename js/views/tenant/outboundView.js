import { Api } from "../../api.js";

// =========================================================================
// MODULE STATE
// =========================================================================
let pollInterval = null;
let activeShipmentId = null; // null for Manual Entry, set for AI Upload
let clientsCache = [];
let inventoryCache = [];
let lineItems = []; // [{ uid, stock_owner_id, stock_owner_name, stock_owner_code, item_code, item_description, uom, requested_quantity, resolved }]
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

  container
    .querySelector("#start-manual-btn")
    .addEventListener("click", async () => {
      activeShipmentId = null;
      lineItems = [];
      lastAllocations = null;
      await refreshInventoryCache();
      const root = document.getElementById("outbound-root");
      renderWorkspace(root, { header: {}, lineItems: [] });
    });
}

async function refreshInventoryCache() {
  try {
    const res = await Api.inventory.getSnapshot();
    inventoryCache = res.inventory || [];
  } catch (err) {
    console.warn("Failed to update inventory snapshot:", err);
  }
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
    const [res] = await Promise.all([
      Api.outbound.getStaged(shipmentId),
      refreshInventoryCache(),
    ]);
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
// AUTO-VALIDATION ENGINE (SECTION 12)
// =========================================================================
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

    // Check if distinct stock owners exist across matching inventory items
    const distinctStockOwners = [
      ...new Set(matches.map((m) => String(m.stock_owner_id))),
    ];

    if (distinctStockOwners.length === 1) {
      const target = matches[0];
      item.item_code = target.item_code;
      item.item_description = target.item_description || "";
      item.uom = target.uom || "PCS";
      item.stock_owner_id = target.stock_owner_id;
      item.stock_owner_name = target.stock_owner_name || "";
      item.stock_owner_code = target.stock_owner_code || "";
      item.resolved = true;
    } else {
      item.resolved = false;
    }
  });
}

// =========================================================================
// AUTOCOMPLETE ENGINE (SECTIONS 2-7)
// =========================================================================
function createAutocomplete(inputEl, fieldType, item, workspace) {
  let dropdownEl = null;
  let selectedIndex = -1;

  function closeDropdown() {
    if (dropdownEl) {
      dropdownEl.remove();
      dropdownEl = null;
      selectedIndex = -1;
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
      if (!map.has(key)) {
        map.set(key, inv);
      }
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
    dropdownEl.style.top = `${inputEl.offsetTop + inputEl.offsetHeight + 2}px`;
    dropdownEl.style.left = `${inputEl.offsetLeft}px`;

    matches.forEach((rec, idx) => {
      const itemEl = document.createElement("a");
      itemEl.href = "#";
      itemEl.className =
        "dropdown-item text-wrap py-2 border-bottom border-light small";
      if (idx === matches.length - 1) itemEl.classList.remove("border-bottom");

      const stockOwnerStr =
        rec.stock_owner_name || rec.stock_owner_code
          ? `${rec.stock_owner_name || ""} (${rec.stock_owner_code || ""})`.trim()
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
    item.stock_owner_name = rec.stock_owner_name || "";
    item.stock_owner_code = rec.stock_owner_code || "";
    item.resolved = true;

    closeDropdown();
    renderLineItemsBody(workspace);
  }

  function updateHighlight() {
    if (!dropdownEl) return;
    const items = dropdownEl.querySelectorAll(".dropdown-item");
    items.forEach((el, idx) => {
      if (idx === selectedIndex) {
        el.classList.add("active");
        el.scrollIntoView({ block: "nearest" });
      } else {
        el.classList.remove("active");
      }
    });
  }

  inputEl.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    item[fieldType] = e.target.value;
    item.resolved = false;

    // Remove errors visual state on active edit
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

  inputEl.addEventListener("keydown", (e) => {
    if (!dropdownEl) return;
    const items = dropdownEl.querySelectorAll(".dropdown-item");

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      updateHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateHighlight();
    } else if (e.key === "Enter") {
      if (selectedIndex >= 0 && items[selectedIndex]) {
        e.preventDefault();
        items[selectedIndex].dispatchEvent(new Event("mousedown"));
      }
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  });

  inputEl.addEventListener("blur", () => {
    setTimeout(closeDropdown, 200);
  });
}

// =========================================================================
// WORKSPACE — shared by AI Upload (pre-populated) and Manual Entry (blank)
// =========================================================================
function renderWorkspace(root, staging) {
  lineItems = (staging.lineItems || []).map((item) => ({
    uid: uid(),
    stock_owner_id: item.stock_owner_id || "",
    stock_owner_name: item.stock_owner_name || "",
    stock_owner_code: item.stock_owner_code || "",
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
            <th style="width:25%">Item Code</th>
            <th style="width:30%">Description</th>
            <th style="width:25%">Stock Owner</th>
            <th style="width:10%">UOM</th>
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

  clientSelect.addEventListener("change", () => {
    const clientId = clientSelect.value;
    if (clientId) {
      runAutoValidationPass(clientId);
    }
    renderLineItemsBody(workspace);
  });

  workspace.querySelector("#add-line-btn").addEventListener("click", () => {
    if (!clientSelect.value) return;
    lineItems.push({
      uid: uid(),
      stock_owner_id: "",
      stock_owner_name: "",
      stock_owner_code: "",
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
    .map((item) => {
      const stockOwnerDisplay =
        item.stock_owner_name || item.stock_owner_code
          ? `${item.stock_owner_name || ""} (${item.stock_owner_code || ""})`.trim()
          : "-";

      const isInvalid = !item.resolved;

      return `<tr data-uid="${item.uid}">
      <td>
        <input type="text" class="form-control form-control-sm ${isInvalid ? "is-invalid" : ""}" data-field="item_code" value="${item.item_code}" ${!isClientSelected ? "disabled" : ""} placeholder="Search code...">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm" data-field="item_description" value="${item.item_description}" ${!isClientSelected ? "disabled" : ""} placeholder="Search description...">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm bg-light text-muted" value="${stockOwnerDisplay}" readonly tabindex="-1">
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
    const qtyInput = row.querySelector('[data-field="requested_quantity"]');

    if (isClientSelected) {
      createAutocomplete(codeInput, "item_code", item, workspace);
      createAutocomplete(descInput, "item_description", item, workspace);
    }

    qtyInput.addEventListener("input", () => {
      item.requested_quantity = parseFloat(qtyInput.value) || 0;
    });

    row.querySelector("[data-remove-line]").addEventListener("click", () => {
      lineItems = lineItems.filter((l) => l.uid !== itemUid);
      renderLineItemsBody(workspace);
    });
  });
}

// =========================================================================
// VERIFY & COMMIT ENGINE (SECTIONS 13 & 14)
// =========================================================================
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

  // Pre-validate resolution status across all line items (Section 13)
  let hasUnresolved = false;
  lineItems.forEach((l) => {
    if (!l.resolved) {
      hasUnresolved = true;
      const tr = workspace.querySelector(`tr[data-uid="${l.uid}"]`);
      if (tr) {
        const codeInput = tr.querySelector('[data-field="item_code"]');
        if (codeInput) codeInput.classList.add("is-invalid");
      }
    }
  });

  if (hasUnresolved) {
    errorsEl.innerHTML = `<div class="alert alert-danger small mb-0">One or more line items are not resolved to valid client inventory records. Please select valid items using the autocomplete dropdown.</div>`;
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

  if (!client_id) {
    errorsEl.innerHTML = `<div class="alert alert-danger small mb-0">Please select a Client before committing.</div>`;
    commitBtn.disabled = false;
    commitBtn.innerHTML = `<i class="bi bi-send-check"></i> Commit`;
    return;
  }

  // Pre-validate resolution status before commit
  let hasUnresolved = false;
  lineItems.forEach((l) => {
    if (!l.resolved) {
      hasUnresolved = true;
      const tr = workspace.querySelector(`tr[data-uid="${l.uid}"]`);
      if (tr) {
        const codeInput = tr.querySelector('[data-field="item_code"]');
        if (codeInput) codeInput.classList.add("is-invalid");
      }
    }
  });

  if (hasUnresolved) {
    errorsEl.innerHTML = `<div class="alert alert-danger small mb-0">Cannot commit: One or more line items are unresolved. Please resolve all line items first.</div>`;
    commitBtn.disabled = false;
    commitBtn.innerHTML = `<i class="bi bi-send-check"></i> Commit`;
    return;
  }

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
      .querySelector("#workspace").innerHTML =
      `<div class="alert alert-success"><i class="bi bi-check-circle me-2"></i>Outbound order committed. Picking task generated — see Picking Tasks.</div>`;
    activeShipmentId = null;
    refreshQueue();
  } catch (err) {
    errorsEl.innerHTML = `<div class="alert alert-danger small mb-0">${err.message} — stock may have changed, please re-verify.</div>`;
    commitBtn.disabled = false;
    commitBtn.innerHTML = `<i class="bi bi-send-check"></i> Commit`;
  }
}
