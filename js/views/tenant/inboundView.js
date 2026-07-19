import { Api } from "../../api.js";

// =========================================================================
// MODULE STATE
// Kept at module scope so it survives re-renders of the same view instance,
// but is reset cleanly every time render() is called fresh.
// =========================================================================
let pollInterval = null;
let currentFiles = [];
let activeShipmentId = null;
let objectUrlsMap = {};

const HEADER_KEYS = [
  "invoice_number",
  "invoice_date",
  "po_number",
  "lr_number",
  "driver_name",
  "driver_phone_number",
  "vehicle_number",
  "e_way_bill_number",
];

const PARTY_ROLES = ["seller", "bill_to", "ship_to"];

const ITEM_CATEGORIES = ["frozen", "chiller", "ambient"];

// =========================================================================
// ENTRY POINT
// =========================================================================
export async function render(container, user) {
  // Defensive cleanup in case this module instance is being re-rendered
  // (e.g. user navigates away and back) so we never stack intervals.
  stopPolling();
  currentFiles = [];
  activeShipmentId = null;
  objectUrlsMap = {};

  container.innerHTML = `
    <style>
      /* Verification Checkbox Styles: Green theme with prominent border */
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

    <div class="container-fluid p-0 p-sm-4 animate-fade-in" id="inbound-root">
      
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div class="mb-2 mb-md-0">
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-box-seam text-primary me-2"></i>Inbound Command Center
          </h3>
          <p class="text-muted small mb-0">Ingest shipment logs, verify data, and commit stock inventory records to the ledger.</p>
        </div>
        <div class="mt-2 mt-md-0">
          <button id="refresh-queue-btn" class="btn btn-sm btn-outline-secondary shadow-sm">
            <i class="bi bi-arrow-clockwise"></i> Refresh Queue
          </button>
        </div>
      </div>

      <div class="card border-0 shadow-sm rounded-0 rounded-sm-3 p-4 mb-4">
        <h6 class="fw-bold mb-1 text-dark">Upload Inbound Shipment Packet</h6>
        <p class="text-muted small mb-3">Accepts Tax Invoices, Delivery Challans, E-Way Bills, and Lorry Receipts.</p>

        <div id="dropzone" class="border rounded-3 p-4 text-center mb-3 bg-light" style="border: 2px dashed #dee2e6 !important; cursor: pointer;">
          <p class="mb-2 text-muted"><i class="bi bi-cloud-arrow-up text-primary fs-2 d-block mb-1"></i>Drag & Drop files or</p>
          <div class="d-flex flex-wrap justify-content-center gap-2">
            <button id="browse-btn" type="button" class="btn btn-primary btn-sm"><i class="bi bi-folder2-open"></i> Browse Files</button>
            <button id="camera-btn" type="button" class="btn btn-secondary btn-sm"><i class="bi bi-camera"></i> Camera</button>
          </div>
          <input type="file" id="file-input" multiple accept="image/*" class="d-none">
          <input type="file" id="camera-input" accept="image/*" capture="environment" class="d-none">
        </div>

        <div id="upload-rows" class="mb-3 d-flex flex-column gap-2"></div>
        <button id="upload-all-btn" class="btn btn-success w-100 py-2 shadow-sm" disabled>
          <i class="bi bi-send-check shadow-sm"></i> Process All Documents
        </button>
        <div id="upload-status" class="small mt-2"></div>
      </div>

      <div class="mb-4 px-3 px-sm-0">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h5 class="fw-bold text-secondary mb-0">Pending Approval</h5>
        </div>
        <p class="text-muted small">Shipments still processing or awaiting your verification. Come back anytime — nothing here is lost.</p>
        <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
          <div style="max-height: 340px; overflow-y: auto;">
            <table class="table table-hover mb-0 align-middle">
              <thead class="table-light" style="position: sticky; top: 0; z-index: 1;">
                <tr>
                  <th class="ps-3">Shipment</th>
                  <th>Uploaded By</th>
                  <th>Created At</th>
                  <th>Status</th>
                  <th class="pe-3 text-end">Actions</th>
                </tr>
              </thead>
              <tbody id="list-body">
                <tr><td colspan="5" class="text-center text-muted py-4">Loading queue...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="workspace" class="mt-4">
        <div class="card border-0 p-5 shadow-sm text-center text-muted rounded-0 rounded-sm-3">
          <i class="bi bi-clipboard-check text-muted display-6 d-block mb-3"></i>
          <h6 class="fw-bold text-secondary mb-1">No Active Workspace</h6>
          Select a shipment row from the Pending Approval queue to verify data records.
        </div>
      </div>
    </div>

    <div class="modal fade" id="previewModal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-3">
          <div class="modal-header border-bottom py-2 bg-light">
            <h6 class="modal-title fw-bold"><i class="bi bi-image me-1"></i> Document View Target Preview</h6>
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
  startPolling();
}

// =========================================================================
// UPLOAD PANEL WIRING & LOGIC
// =========================================================================
function setupEventListeners(container) {
  const fileInput = container.querySelector("#file-input");
  const cameraInput = container.querySelector("#camera-input");
  const dropzone = container.querySelector("#dropzone");

  container.querySelector("#browse-btn").onclick = () => fileInput.click();
  container.querySelector("#camera-btn").onclick = () => cameraInput.click();

  fileInput.onchange = (e) => handleFiles(e.target.files);
  cameraInput.onchange = (e) => handleFiles(e.target.files);

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

  container.querySelector("#upload-all-btn").onclick = uploadAll;
  container.querySelector("#refresh-queue-btn").onclick = refreshQueue;
}

function handleFiles(files) {
  Array.from(files).forEach((file) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    currentFiles.push({ id, file });
    objectUrlsMap[id] = URL.createObjectURL(file);

    const row = document.createElement("div");
    row.className =
      "upload-row d-flex align-items-center gap-2 p-2 border rounded-3 bg-white shadow-sm animate-fade-in";
    row.dataset.id = id;
    row.innerHTML = `
      <img src="${objectUrlsMap[id]}" class="preview-thumb rounded border" data-id="${id}"
           style="width:44px;height:44px;object-fit:cover;cursor:pointer;" title="Click to view full image">
      <div class="flex-grow-1 small text-truncate">
        <div class="fw-semibold text-dark text-truncate" title="${file.name}">${file.name}</div>
        <div class="text-muted">${(file.size / 1024).toFixed(1)} KB</div>
      </div>
      <select class="doc-type form-select form-select-sm" style="width: 170px;">
        <option value="tax_invoice">Tax Invoice</option>
        <option value="delivery_challan">Delivery Challan</option>
        <option value="lr">Lorry Receipt (LR)</option>
        <option value="e_way_bill">E-Way Bill</option>
      </select>
      <button type="button" class="btn btn-sm btn-outline-danger remove-row-btn me-1" data-id="${id}">
        <i class="bi bi-x-lg"></i>
      </button>
    `;
    document.getElementById("upload-rows").appendChild(row);
  });

  document.querySelectorAll(".preview-thumb").forEach((img) => {
    img.onclick = () => showPreview(objectUrlsMap[img.dataset.id]);
  });
  document.querySelectorAll(".remove-row-btn").forEach((btn) => {
    btn.onclick = () => removeRow(btn.dataset.id);
  });

  document.getElementById("upload-all-btn").disabled =
    currentFiles.length === 0;
}

function removeRow(id) {
  currentFiles = currentFiles.filter((f) => f.id !== id);
  if (objectUrlsMap[id]) {
    URL.revokeObjectURL(objectUrlsMap[id]);
    delete objectUrlsMap[id];
  }
  const row = document.querySelector(`.upload-row[data-id="${id}"]`);
  if (row) row.remove();
  document.getElementById("upload-all-btn").disabled =
    currentFiles.length === 0;
}

function showPreview(url) {
  document.getElementById("modal-img").src = url;
  new bootstrap.Modal(document.getElementById("previewModal")).show();
}

async function uploadAll() {
  const uploadBtn = document.getElementById("upload-all-btn");
  const statusEl = document.getElementById("upload-status");
  uploadBtn.disabled = true;
  statusEl.className = "small mt-2 text-muted";
  statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Uploading documents and queueing for OCR...`;

  try {
    const fd = new FormData();
    document.querySelectorAll(".upload-row").forEach((row) => {
      const id = row.dataset.id;
      const fileObj = currentFiles.find((f) => f.id === id);
      if (!fileObj) return;
      fd.append("files", fileObj.file);
      fd.append("document_types", row.querySelector(".doc-type").value);
    });

    const result = await Api.shipments.upload(fd);
    if (!result || result.success === false) {
      throw new Error(result?.error || "Upload was rejected by the server.");
    }

    Object.values(objectUrlsMap).forEach((url) => URL.revokeObjectURL(url));
    objectUrlsMap = {};
    currentFiles = [];
    document.getElementById("upload-rows").innerHTML = "";

    statusEl.className = "small mt-2 text-success fw-semibold";
    statusEl.innerHTML = `<i class="bi bi-check-circle-fill"></i> Uploaded! Shipment ${result.shipmentId.substring(0, 8)}... is now processing — it will update live.`;

    refreshQueue();
  } catch (err) {
    statusEl.className = "small mt-2 text-danger fw-semibold";
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    uploadBtn.disabled = currentFiles.length === 0;
  }
}

// =========================================================================
// PENDING / PROCESSING QUEUE LONG-POLLING RUNTIMES
// =========================================================================
async function refreshQueue() {
  const listBody = document.getElementById("list-body");
  if (!listBody) return; // view layout was torn down mid-flight

  try {
    const shipments = await Api.shipments.listPending();

    if (!shipments || shipments.length === 0) {
      listBody.innerHTML = `
        <tr><td colspan="5" class="text-center text-muted py-4">
          Nothing pending. Upload a packet above to get started.
        </td></tr>`;
      return;
    }

    listBody.innerHTML = shipments.map((s) => renderQueueRow(s)).join("");

    listBody.querySelectorAll(".verify-btn").forEach((btn) => {
      btn.onclick = () => renderVerification(btn.dataset.id);
    });
  } catch (err) {
    listBody.innerHTML = `
      <tr><td colspan="5" class="text-center text-danger py-3 fw-semibold small">
        <i class="bi bi-exclamation-triangle-fill me-1"></i> Failed to load queue lifecycle parameters: ${err.message}
      </td></tr>`;
  }
}

function renderQueueRow(s) {
  const shortId = s.id.substring(0, 8) + "...";
  const isActive = s.id === activeShipmentId;
  const uploadedBy = s.uploaded_by_username || "—";
  const createdAt = formatTimestamp(s.created_at);

  if (s.status === "pending_verification") {
    return `
      <tr class="${isActive ? "table-primary fw-medium" : ""}">
        <td class="ps-3"><code class="small text-primary">${shortId}</code></td>
        <td>${uploadedBy}</td>
        <td class="text-muted small">${createdAt}</td>
        <td><span class="badge bg-success-subtle text-success px-2 py-1 border border-success-subtle rounded-pill">Ready to Verify</span></td>
        <td class="pe-3 text-end">
          <button class="btn btn-sm btn-primary verify-btn shadow-sm" data-id="${s.id}">
            <i class="bi bi-clipboard-check"></i> Verify
          </button>
        </td>
      </tr>`;
  }

  if (s.status === "failed") {
    return `
      <tr>
        <td class="ps-3"><code class="small text-danger">${shortId}</code></td>
        <td>${uploadedBy}</td>
        <td class="text-muted small">${createdAt}</td>
        <td><span class="badge bg-danger-subtle text-danger px-2 py-1 border border-danger-subtle rounded-pill">Extraction Failed</span></td>
        <td class="pe-3 text-end text-muted small">OCR Parsing Timeout</td>
      </tr>`;
  }

  // processing status runtime mapping (default state representation)
  return `
    <tr>
      <td class="ps-3"><code class="small text-muted">${shortId}</code></td>
      <td>${uploadedBy}</td>
      <td class="text-muted small">${createdAt}</td>
      <td>
        <span class="badge bg-warning text-warning-dominant px-2 py-1 border border-warning-subtle rounded-pill d-inline-flex align-items-center gap-1">
          <span class="spinner-border spinner-border-sm" style="width:0.65rem;height:0.65rem;border-width:1.5px;"></span>
          Processing
        </span>
      </td>
      <td class="pe-3 text-end text-muted small">OCR Analysis...</td>
    </tr>`;
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

// =========================================================================
// VERIFICATION WORKSPACE ENGINE
// =========================================================================
async function renderVerification(shipmentId) {
  const workspace = document.getElementById("workspace");
  activeShipmentId = shipmentId;
  refreshQueue(); // highlights active row context immediately

  workspace.innerHTML = `
    <div class="card border-0 p-5 shadow-sm text-center rounded-0 rounded-sm-3">
      <div class="spinner-border text-primary mx-auto mb-3" role="status"></div>
      <h6 class="fw-bold text-dark mb-1">Loading Staged Datasets</h6>
      <p class="text-muted small mb-0">Assembling structured packet references for ${shipmentId.substring(0, 8)}...</p>
    </div>`;

  let data;
  try {
    data = await Api.shipments.getStaged(shipmentId);
  } catch (err) {
    workspace.innerHTML = `<div class="alert alert-danger border-0 p-3 shadow-sm rounded-0 rounded-sm-3 mx-3 mx-sm-0"><i class="bi bi-x-octagon-fill me-2"></i>Failed to load shipment staged variables: ${err.message}</div>`;
    return;
  }

  if (data.status !== "pending_verification" || !data.staging_json) {
    workspace.innerHTML = `
      <div class="alert alert-warning border-0 p-3 shadow-sm rounded-0 rounded-sm-3 mx-3 mx-sm-0">
        <i class="bi bi-exclamation-triangle-fill me-2"></i> This shipment is not ready for verification yet (status: <strong>${data.status}</strong>).
        It will update here automatically once OCR extraction loops settle.
      </div>`;
    return;
  }

  const staging = JSON.parse(data.staging_json);

  workspace.innerHTML = `
    <div class="card border-0 p-4 shadow-sm rounded-0 rounded-sm-3 mt-2 animate-fade-in">
      <form id="verification-form" novalidate>
        <div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center border-bottom pb-3 mb-4">
          <h5 class="fw-bold text-dark mb-1 mb-sm-0 fs-5">
            Verify Shipment Structure: <code class="text-primary bg-light px-2 py-1 rounded small d-inline-block text-truncate" style="max-width:200px;">${shipmentId}</code>
          </h5>
          <span class="small text-muted"><i class="bi bi-shield-fill-check text-success"></i> Form Validation System Active</span>
        </div>

        <!-- NEW INTEGRATION BLOCK: CLIENT IDENTITY MATRIX SELECTION DROPDOWN -->
        <div class="card bg-light border p-3 mb-4 shadow-sm">
          <label for="shipment-client-select" class="form-label small fw-bold text-dark mb-1">
            Choose Client Context Profile <span class="text-danger">*</span>
          </label>
          <select id="shipment-client-select" class="form-select required-field fw-semibold" required>
            <option value="" disabled selected>-- Fetching available master client registers --</option>
          </select>
          <div class="form-text text-muted extra-small mt-1" style="font-size: 0.75rem;">
            Assigning a client context links this physical inbound manifest to a specific customer account for audit tracing.
          </div>
        </div>

        <div class="fw-bold text-uppercase small text-secondary tracking-wider border-bottom pb-2 mb-3">
          1. Document Metadata & Financial Totals
        </div>
        <div class="row g-3 mb-4" id="header-fields-grid"></div>

        <div class="fw-bold text-uppercase small text-secondary tracking-wider border-bottom pb-2 mb-3">
          2. Trading Parties & Address Master Registers
        </div>
        <div class="row g-3 mb-4" id="parties-container"></div>

        <div class="fw-bold text-uppercase small text-secondary tracking-wider border-bottom pb-2 mb-3">
          3. Physical Line Item Manifest & Discrepancy Capture
        </div>
        
        <div class="d-flex justify-content-end mb-3">
          <button type="button" id="add-line-item-btn" class="btn btn-sm btn-primary shadow-sm px-3">
            <i class="bi bi-plus-lg"></i> Add Line Item Form Entry
          </button>
        </div>

        <div class="mb-4 border rounded-3 shadow-sm overflow-hidden">
          <div class="table-responsive">
            <table class="table table-sm table-hover mb-0 align-middle" style="min-width: 2980px;">
              <thead class="table-light">
                <tr class="small text-secondary py-2">
                  <th style="width: 65px;" class="ps-2">Sl No.</th>
                  <th style="width: 140px;">Item Code*</th>
                  <th style="min-width: 280px;">Description*</th>
                  <th style="width: 110px;">HSN/SAC</th>
                  <th style="width: 90px;">Ordered*</th>
                  <th style="width: 90px;">UOM*</th>
                  <th style="width: 100px;">Rate</th>
                  <th style="width: 100px;">Gross</th>
                  <th style="width: 100px;">Discount</th>
                  <th style="width: 110px;">Taxable</th>
                  <th style="width: 90px;">Tax %</th>
                  <th style="width: 100px;">CGST</th>
                  <th style="width: 100px;">SGST</th>
                  <th style="width: 100px;">IGST</th>
                  <th style="width: 100px;">CESS</th>
                  <th style="width: 120px;">Total Amt</th>
                  <th style="width: 100px; background: #ecfdf5;" class="text-center">Received <span class="text-danger">*</span></th>
                  <th style="width: 90px; background: #fef2f2;" class="text-center">Damaged</th>
                  <th style="width: 90px; background: #fffbeb;" class="text-center">Shortage</th>
                  <th style="width: 90px; background: #fdf2f8;" class="text-center">Excess</th>
                  <th style="width: 220px;">Discrepancy Notes</th>
                  <th style="width: 130px;">Category <span class="text-danger">*</span></th>
                  <th style="width: 150px;">Manufacturing Date</th>
                  <th style="width: 150px;">Expiry Date</th>
                  <th style="width: 80px;" class="text-center">Verified</th>
                  <th style="width: 70px;" class="text-center pe-2">Actions</th>
                </tr>
              </thead>
              <tbody id="v-body"></tbody>
            </table>
          </div>
        </div>

        <div class="text-muted small mb-4" style="margin-top: -0.75rem;">
          <i class="bi bi-arrow-left-right"></i> Scroll horizontally to see all columns.
        </div>

        <button type="button" id="commit-btn" class="btn btn-success w-100 py-3 shadow-sm fw-bold">
          <i class="bi bi-check2-circle fs-5 me-1"></i> Verify & Commit Shipment to Ledger
        </button>
        <div id="commit-status" class="small mt-2 px-1"></div>
      </form>
    </div>
  `;
  renderHeaderFields(staging.header);
  renderParties(staging.parties);
  renderLineItems(staging.lineItems || []);
  populateClientDropdownSelector();

  async function populateClientDropdownSelector() {
    const dropdown = document.getElementById("shipment-client-select");
    if (!dropdown) return;

    try {
      const clients = await Api.clients.list();
      if (!clients || clients.length === 0) {
        dropdown.innerHTML = `<option value="" disabled>⚠️ No configured client records found inside this warehouse footprint.</option>`;
        document.getElementById("commit-btn").disabled = true;
        return;
      }

      dropdown.innerHTML = `<option value="" disabled selected>-- Select assigned client owner profile * --</option>`;
      clients.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.code})`;
        dropdown.appendChild(opt);
      });
    } catch (err) {
      dropdown.innerHTML = `<option value="" disabled>❌ Error synchronizing warehouse clients data: ${err.message}</option>`;
    }
  }

  document.getElementById("add-line-item-btn").onclick = (e) => {
    e.preventDefault();
    addLineItemRow();
  };

  workspace.addEventListener("input", (e) => {
    if (
      e.target.classList.contains("required-field") &&
      e.target.value.trim() !== ""
    ) {
      e.target.classList.remove("is-invalid");
    }
  });

  workspace.addEventListener("change", (e) => {
    if (
      e.target.classList.contains("required-field") &&
      e.target.value.trim() !== ""
    ) {
      e.target.classList.remove("is-invalid");
    }
  });

  // Instantly warn the user when they leave a required field empty
  workspace.addEventListener("focusout", (e) => {
    if (e.target.classList.contains("required-field")) {
      if (e.target.value.trim() === "") {
        e.target.classList.add("is-invalid");
      } else {
        e.target.classList.remove("is-invalid");
      }
    }
  });

  // Catch form submission handlers securely
  document
    .getElementById("verification-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      commitShipment(shipmentId, workspace);
    });

  document.getElementById("commit-btn").onclick = () =>
    commitShipment(shipmentId, workspace);
}

const REQUIRED_HEADER_KEYS = ["invoice_number", "invoice_date"];

function renderHeaderFields(header) {
  const grid = document.getElementById("header-fields-grid");
  HEADER_KEYS.forEach((key) => {
    const value = header?.[key] ?? "";
    const label = key.replace(/_/g, " ");
    const isRequired = REQUIRED_HEADER_KEYS.includes(key);
    const needsVerification =
      key === "invoice_number" || key === "invoice_date";
    const col = document.createElement("div");
    col.className = "col-12 col-sm-6 col-md-4 col-xl-3";
    col.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-1">
        <label class="form-label small text-muted text-capitalize mb-0">${label}${isRequired ? ' <span class="text-danger">*</span>' : ""}</label>
        ${
          needsVerification
            ? `<div class="form-check mb-0">
                 <input class="form-check-input verify-checkbox header-verify-checkbox" type="checkbox" id="header_verify_${key}">
               </div>`
            : ""
        }
      </div>
      <input type="text" class="form-control form-control-sm ${isRequired ? "required-field" : ""}"
             id="header_${key}" value="${escapeAttr(value)}" ${isRequired ? "required" : ""}>
    `;
    grid.appendChild(col);
  });
}

function renderParties(parties) {
  const container = document.getElementById("parties-container");
  PARTY_ROLES.forEach((role) => {
    const party = parties?.[role] || {};
    const nameVal = party.name || party.legal_name || "";
    const addressVal = party.address || party.physical_address || "";
    const gstinVal = party.gstin || "";

    const col = document.createElement("div");
    col.className = "col-12 col-lg-4";
    col.innerHTML = `
      <div class="border rounded-3 p-3 bg-light h-100 shadow-sm animate-fade-in">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <span class="badge bg-secondary-subtle text-secondary border text-uppercase px-2 py-1">${role.replace(/_/g, " ")} Entity Context</span>
          <div class="dropdown">
            <button class="btn btn-outline-secondary btn-sm py-0 px-2 copy-data-btn" type="button"
                    data-bs-toggle="dropdown" data-role="${role}" aria-expanded="false">
              <i class="bi bi-clipboard-plus"></i> Copy data
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-sm">
              ${PARTY_ROLES.filter((r) => r !== role)
                .map(
                  (r) =>
                    `<li><a class="dropdown-item copy-data-source" href="#" data-target-role="${role}" data-source-role="${r}">${r.replace(/_/g, " ")}</a></li>`,
                )
                .join("")}
            </ul>
          </div>
        </div>
        <div class="mb-2">
          <label class="form-label small text-muted mb-1">Company / Entity Name <span class="text-danger">*</span></label>
          <input type="text" class="form-control form-control-sm required-field" id="party_${role}_name" value="${escapeAttr(nameVal)}" required>
        </div>
        <div class="mb-2">
          <label class="form-label small text-muted mb-1">GSTIN <span class="text-danger">*</span></label>
          <input type="text" class="form-control form-control-sm party-gstin-input required-field" id="party_${role}_gstin"
                 data-role="${role}" value="${escapeAttr(gstinVal)}" required>
        </div>
        <div class="mb-3">
          <label class="form-label small text-muted mb-1">Registered Address <span class="text-danger">*</span></label>
          <input type="text" class="form-control form-control-sm required-field" id="party_${role}_address" value="${escapeAttr(addressVal)}" required>
        </div>
        <div id="lookup_status_${role}" class="small fw-semibold text-muted bg-white border p-2 rounded-2 text-center shadow-sm">Awaiting GSTIN validation...</div>
      </div>
    `;
    container.appendChild(col);
  });

  document.querySelectorAll(".party-gstin-input").forEach((input) => {
    checkExistingPartyRegister(input.value, input.dataset.role);
    input.addEventListener("change", (e) => {
      checkExistingPartyRegister(e.target.value, e.target.dataset.role);
    });
  });

  document.querySelectorAll(".copy-data-source").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const { targetRole, sourceRole } = e.currentTarget.dataset;
      copyPartyData(sourceRole, targetRole);
    });
  });
}

function copyPartyData(sourceRole, targetRole) {
  const fields = ["name", "gstin", "address"];
  fields.forEach((field) => {
    const sourceInput = document.getElementById(`party_${sourceRole}_${field}`);
    const targetInput = document.getElementById(`party_${targetRole}_${field}`);
    if (sourceInput && targetInput) {
      targetInput.value = sourceInput.value;
    }
  });

  const targetGstinInput = document.getElementById(`party_${targetRole}_gstin`);
  if (targetGstinInput) {
    checkExistingPartyRegister(targetGstinInput.value, targetRole);
  }
}

async function checkExistingPartyRegister(gstin, role) {
  const feedbackEl = document.getElementById(`lookup_status_${role}`);
  if (!feedbackEl) return;

  const cleanGstin = (gstin || "").trim().toUpperCase();

  if (cleanGstin === "") {
    feedbackEl.className =
      "small fw-semibold text-warning-dominant bg-white border p-2 rounded-2 text-center shadow-sm";
    feedbackEl.innerHTML =
      "⚠️ No GSTIN entered — enter one to check the master register.";
    return;
  }

  if (cleanGstin.length !== 15) {
    feedbackEl.className =
      "small fw-semibold text-warning-dominant bg-white border p-2 rounded-2 text-center shadow-sm";
    feedbackEl.innerHTML =
      "⚠️ GSTIN looks incomplete (expected 15 characters) — please verify.";
    return;
  }

  feedbackEl.className =
    "small fw-semibold text-muted bg-white border p-2 rounded-2 text-center shadow-sm";
  feedbackEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Checking master register...`;

  try {
    const node = await Api.parties.lookup(cleanGstin);
    if (node.found) {
      const matchName =
        node.party.name || node.party.legal_name || "Existing Entity";
      feedbackEl.className =
        "small fw-semibold text-success bg-success-subtle border border-success-subtle p-2 rounded-2 text-center shadow-sm";
      feedbackEl.innerHTML = `✅ Match found: reusing existing party (${escapeAttr(matchName)})`;
    } else {
      feedbackEl.className =
        "small fw-semibold text-primary bg-primary-subtle border border-primary-subtle p-2 rounded-2 text-center shadow-sm";
      feedbackEl.innerHTML =
        "✨ New entity — will be auto-registered on commit.";
    }
  } catch (e) {
    feedbackEl.className =
      "small fw-semibold text-danger bg-danger-subtle border border-danger-subtle p-2 rounded-2 text-center shadow-sm";
    feedbackEl.innerHTML = `⚠️ Lookup failed: ${escapeAttr(e.message || "could not reach master register")}`;
  }
}

function renderLineItems(items) {
  const tbody = document.getElementById("v-body");
  tbody.innerHTML = items
    .map(
      (item, idx) =>
        `<tr class="item-row-data align-middle" data-idx="${idx}">${getLineItemRowHtml(item, idx)}</tr>`,
    )
    .join("");

  tbody.querySelectorAll(".remove-line-item").forEach((btn) => {
    btn.onclick = () => {
      btn.closest("tr").remove();
      renumberRows();
    };
  });
}

// =========================================================================
// LINE ITEM DYNAMIC ACTIONS & ROW BUILDERS
// =========================================================================
function getLineItemRowHtml(item, idx) {
  let finalItemCode = item.item_code;
  if (!finalItemCode || finalItemCode.toString().trim() === "") {
    finalItemCode = item.item_description
      ? generateItemCode(item.item_description)
      : "";
  }

  return `
    <td class="ps-2"><input type="number" class="form-control form-control-sm text-center" style="min-width: 55px;" id="item_sl_${idx}" value="${idx + 1}" disabled></td>
    <td><input type="text" class="form-control form-control-sm required-field font-monospace" id="item_code_${idx}" value="${escapeAttr(finalItemCode)}" required></td>
    <td><textarea rows="2" class="form-control form-control-sm required-field small" id="item_desc_${idx}" required>${escapeAttr(item.item_description ?? "")}</textarea></td>
    <td><input type="text" class="form-control form-control-sm text-center" id="item_hsn_${idx}" value="${escapeAttr(item.hsn_sac ?? "")}"></td>
    <td><input type="number" class="form-control form-control-sm text-center required-field" id="item_ordered_${idx}" value="${item.ordered_quantity ?? 0}" required></td>
    <td><input type="text" class="form-control form-control-sm text-center required-field" id="item_uom_${idx}" value="${escapeAttr(item.uom) || "PCS"}" required></td>
    <td><input type="text" class="form-control form-control-sm text-end" id="item_rate_${idx}" value="${item.rate ?? 0}"></td>
    <td><input type="text" class="form-control form-control-sm text-end" id="item_gross_${idx}" value="${item.gross_amount ?? 0}"></td>
    <td><input type="text" class="form-control form-control-sm text-end" id="item_discount_${idx}" value="${item.discount_amount ?? 0}"></td>
    <td><input type="text" class="form-control form-control-sm text-end" id="item_taxable_${idx}" value="${item.taxable_amount ?? 0}"></td>
    <td><input type="text" class="form-control form-control-sm text-center" id="item_tax_rate_percent_${idx}" value="${escapeAttr(item.tax_rate_percent ?? "")}"></td>
    <td><input type="text" class="form-control form-control-sm text-end" id="item_cgst_${idx}" value="${item.cgst ?? 0}"></td>
    <td><input type="text" class="form-control form-control-sm text-end" id="item_sgst_${idx}" value="${item.sgst ?? 0}"></td>
    <td><input type="text" class="form-control form-control-sm text-end" id="item_igst_${idx}" value="${item.igst ?? 0}"></td>
    <td><input type="text" class="form-control form-control-sm text-end" id="item_cess_${idx}" value="${item.cess ?? 0}"></td>
    <td><input type="text" class="form-control form-control-sm text-end fw-semibold" id="item_total_${idx}" value="${item.total_amount ?? 0}"></td>
    <td style="background:#f0fdf4;"><input type="number" class="form-control form-control-sm text-center required-field" style="border-color: #bbf7d0;" id="item_received_${idx}" value="${item.received_quantity ?? item.ordered_quantity ?? 0}" required></td>
    <td style="background:#fef2f2;"><input type="number" class="form-control form-control-sm text-center" style="border-color: #fecaca;" id="item_damaged_${idx}" value="${item.damaged_quantity ?? 0}"></td>
    <td style="background:#fffbeb;"><input type="number" class="form-control form-control-sm text-center" style="border-color: #fef08a;" id="item_shortage_${idx}" value="${item.shortage_quantity ?? 0}"></td>
    <td style="background:#fdf2f8;"><input type="number" class="form-control form-control-sm text-center" style="border-color: #fbcfe8;" id="item_excess_${idx}" value="${item.excess_quantity ?? 0}"></td>
    <td><input type="text" class="form-control form-control-sm" id="item_notes_${idx}" value="${escapeAttr(item.discrepancy_notes ?? "")}" placeholder="Enter variance logs..."></td>
    <td>
      <select class="form-select form-select-sm required-field text-capitalize" id="item_category_${idx}" required>
        <option value="" disabled ${!item.category ? "selected" : ""}>Select</option>
        ${ITEM_CATEGORIES.map(
          (cat) =>
            `<option value="${cat}" ${item.category === cat ? "selected" : ""}>${cat}</option>`,
        ).join("")}
      </select>
    </td>
    <td><input type="date" class="form-control form-control-sm" id="item_manufacturing_${idx}" value="${escapeAttr(item.manufacturing_date ?? "")}"></td>
    <td><input type="date" class="form-control form-control-sm" id="item_expiry_${idx}" value="${escapeAttr(item.expiry_date ?? "")}"></td>
    <td class="text-center">
      <input type="checkbox" class="form-check-input verify-checkbox item-verify-checkbox" id="item_verify_${idx}">
    </td>
    <td class="text-center pe-2">
      <button type="button" class="btn btn-sm btn-outline-danger remove-line-item py-0 px-2" title="Remove Row">
        <i class="bi bi-trash"></i>
      </button>
    </td>
  `;
}

function renumberRows() {
  const rows = document.querySelectorAll("#v-body .item-row-data");
  rows.forEach((row, i) => {
    row.dataset.idx = i;
    const inputs = row.querySelectorAll("input, textarea, select");
    inputs.forEach((input) => {
      if (input.id) {
        input.id = input.id.replace(/_\d+$/, `_${i}`);
      }
    });
    const slInput = document.getElementById(`item_sl_${i}`);
    if (slInput) {
      slInput.value = i + 1;
    }
  });
}

function addLineItemRow() {
  const tbody = document.getElementById("v-body");
  const idx = tbody.querySelectorAll(".item-row-data").length;

  const tr = document.createElement("tr");
  tr.className = "item-row-data align-middle animate-fade-in";
  tr.dataset.idx = idx;

  tr.innerHTML = getLineItemRowHtml(
    {
      item_code: "",
      item_description: "",
      hsn_sac: "",
      ordered_quantity: 0,
      uom: "PCS",
      rate: 0,
      gross_amount: 0,
      discount_amount: 0,
      taxable_amount: 0,
      tax_rate_percent: "",
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
      total_amount: 0,
      received_quantity: 0,
      damaged_quantity: 0,
      shortage_quantity: 0,
      excess_quantity: 0,
      discrepancy_notes: "",
      category: "",
      expiry_date: "",
      manufacturing_date: "",
    },
    idx,
  );

  tbody.appendChild(tr);

  tr.querySelector(".remove-line-item").onclick = () => {
    tr.remove();
    renumberRows();
  };
}

function startPolling() {
  refreshQueue();
  pollInterval = setInterval(refreshQueue, 8000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function commitShipment(shipmentId, workspace) {
  const commitBtn = document.getElementById("commit-btn");
  const statusEl = document.getElementById("commit-status");

  // Validate fields marked mandatory across header, parties, and items
  const missingFields = [];
  document.querySelectorAll(".required-field").forEach((el) => {
    el.classList.remove("is-invalid");
    if (!el.value || el.value.trim() === "") {
      el.classList.add("is-invalid");
      missingFields.push(el);
    }
  });

  const selectedClientId = document.getElementById(
    "shipment-client-select",
  )?.value;
  if (!selectedClientId) {
    statusEl.className = "small mt-2 text-danger fw-semibold";
    statusEl.innerHTML = `<i class="bi bi-exclamation-octagon-fill"></i> Processing blocked: An active Client assignment mapping context parameter must be selected prior to transaction execution steps.`;
    document.getElementById("shipment-client-select")?.focus();
    return;
  }

  if (missingFields.length > 0) {
    statusEl.className = "small mt-2 text-danger fw-semibold";
    statusEl.innerHTML = `<i class="bi bi-exclamation-octagon-fill"></i> Please fill in all mandatory fields (marked *) before committing — ${missingFields.length} field(s) missing.`;
    missingFields[0].scrollIntoView({ behavior: "smooth", block: "center" });
    missingFields[0].focus();
    return;
  }

  // Validate manual verification checkboxes
  const invNumChecked = document.getElementById(
    "header_verify_invoice_number",
  )?.checked;
  const invDateChecked = document.getElementById(
    "header_verify_invoice_date",
  )?.checked;
  const lineItemCheckboxes = Array.from(
    document.querySelectorAll(".item-verify-checkbox"),
  );
  const allLineItemsChecked =
    lineItemCheckboxes.length > 0 &&
    lineItemCheckboxes.every((cb) => cb.checked);

  if (!invNumChecked || !invDateChecked || !allLineItemsChecked) {
    statusEl.className = "small mt-2 text-danger fw-semibold";
    statusEl.innerHTML = `<i class="bi bi-exclamation-octagon-fill"></i> Please verify Invoice Number, Invoice Date, and every Line Item by checking their verification boxes before committing the shipment.`;
    return;
  }

  commitBtn.disabled = true;
  commitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Committing to Ledger Registry...`;

  try {
    const headerData = {};
    HEADER_KEYS.forEach((k) => {
      headerData[k] = document.getElementById(`header_${k}`)?.value ?? "";
    });

    const partiesData = {};
    PARTY_ROLES.forEach((r) => {
      partiesData[r] = {
        name: document.getElementById(`party_${r}_name`)?.value || "",
        gstin: document.getElementById(`party_${r}_gstin`)?.value || "",
        address: document.getElementById(`party_${r}_address`)?.value || "",
      };
    });

    const lineItems = [];
    document.querySelectorAll(".item-row-data").forEach((row) => {
      const idx = row.dataset.idx;
      lineItems.push({
        item_code: document.getElementById(`item_code_${idx}`).value,
        item_description: document.getElementById(`item_desc_${idx}`).value,
        hsn_sac: document.getElementById(`item_hsn_${idx}`).value,
        ordered_quantity: document.getElementById(`item_ordered_${idx}`).value,
        rate: document.getElementById(`item_rate_${idx}`).value,
        gross_amount: document.getElementById(`item_gross_${idx}`).value,
        discount_amount: document.getElementById(`item_discount_${idx}`).value,
        taxable_amount: document.getElementById(`item_taxable_${idx}`).value,
        tax_rate_percent: document.getElementById(
          `item_tax_rate_percent_${idx}`,
        ).value,
        cgst: document.getElementById(`item_cgst_${idx}`).value,
        sgst: document.getElementById(`item_sgst_${idx}`).value,
        igst: document.getElementById(`item_igst_${idx}`).value,
        cess: document.getElementById(`item_cess_${idx}`).value,
        total_amount: document.getElementById(`item_total_${idx}`).value,
        received_quantity: document.getElementById(`item_received_${idx}`)
          .value,
        damaged_quantity: document.getElementById(`item_damaged_${idx}`).value,
        shortage_quantity: document.getElementById(`item_shortage_${idx}`)
          .value,
        excess_quantity: document.getElementById(`item_excess_${idx}`).value,
        uom: document.getElementById(`item_uom_${idx}`).value,
        discrepancy_uom: document.getElementById(`item_uom_${idx}`).value,
        discrepancy_notes: document.getElementById(`item_notes_${idx}`).value,
        category: document.getElementById(`item_category_${idx}`).value,
        expiry_date:
          document.getElementById(`item_expiry_${idx}`).value.trim() === ""
            ? null
            : document.getElementById(`item_expiry_${idx}`).value.trim(),
        manufacturing_date:
          document.getElementById(`item_manufacturing_${idx}`).value.trim() ===
          ""
            ? null
            : document.getElementById(`item_manufacturing_${idx}`).value.trim(),
      });
    });

    const payload = {
      shipmentId,
      client_id: selectedClientId,
      header: headerData,
      parties: partiesData,
      lineItems,
    };

    const result = await Api.shipments.commit(payload);
    if (!result || result.success === false) {
      throw new Error(result?.error || "Commit was rejected by the server.");
    }

    activeShipmentId = null;
    workspace.innerHTML = `
      <div class="card border-0 p-5 shadow-sm text-center rounded-0 rounded-sm-3 animate-fade-in mx-3 mx-sm-0">
        <i class="bi bi-check-circle-fill text-success display-5 mb-3"></i>
        <h5 class="fw-bold text-success mb-2">Shipment Successfully Committed!</h5>
        <p class="mb-3 text-muted mx-auto" style="max-width: 600px;">Transaction entries have been recorded in the ledger, and a putaway task has been generated automatically.</p>
        <p class="small text-secondary bg-light d-inline-block px-3 py-2 rounded-pill mb-3">
          <strong>Putaway Task ID:</strong> <code class="text-primary">${result.putaway_task_id || "n/a"}</code>
        </p>
        <div>
          <a href="#" class="btn btn-outline-primary shadow-sm px-4" data-view="tenant-putaway">
            <i class="bi bi-arrow-down-left-square me-1"></i> Go to Putaway Tasks
          </a>
        </div>
      </div>
    `;

    const goToPutawayLink = workspace.querySelector(
      '[data-view="tenant-putaway"]',
    );
    if (goToPutawayLink) {
      goToPutawayLink.addEventListener("click", (e) => {
        e.preventDefault();
        const navLink = document.querySelector(
          '.wms-sidebar .nav-link[data-view="tenant-putaway"]',
        );
        if (navLink) navLink.click();
      });
    }

    refreshQueue();
  } catch (err) {
    statusEl.className = "small mt-2 text-danger fw-semibold";
    statusEl.textContent = `Error: ${err.message}`;
    commitBtn.disabled = false;
    commitBtn.innerHTML = `<i class="bi bi-check2-circle"></i> Verify & Commit Shipment to Ledger`;
  }
}

// =========================================================================
// UTIL CONTEXT SANITIZERS
// =========================================================================
function escapeAttr(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// =========================================================================
// SYSTEM CODE GENERATOR
// =========================================================================
function generateItemCode(description) {
  if (!description || description.trim() === "") return "";

  const cleanDesc = description
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .toUpperCase();
  const words = cleanDesc.split(/\s+/).filter(Boolean);

  const TARGET_LENGTH = 5;
  const wordsUsed = Math.min(words.length, 5);
  const lettersPerWord = Math.max(1, Math.ceil(TARGET_LENGTH / wordsUsed));

  const baseCode = words
    .slice(0, wordsUsed)
    .map((w) => w.substring(0, lettersPerWord))
    .join("");

  return baseCode;
}
