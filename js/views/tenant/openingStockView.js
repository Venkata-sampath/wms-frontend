import { Api } from "../../api.js";

let selectedFile = null;
let validationResult = null;

export async function render(container, user) {
  selectedFile = null;
  validationResult = null;

  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in" id="opening-stock-root">
      
      <!-- HEADER -->
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div class="mb-2 mb-md-0">
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-file-earmark-excel text-success me-2"></i>Opening Stock Upload
          </h3>
          <p class="text-muted small mb-0">Directly onboard initial warehouse inventory balances via Excel spreadsheet import.</p>
        </div>
      </div>

      <!-- CLIENT & STOCK OWNER MATRIX BLOCK -->
      <div class="card border-0 shadow-sm rounded-0 rounded-sm-3 p-4 mb-4">
        <h6 class="fw-bold mb-1 text-dark"><i class="bi bi-diagram-3 text-primary me-2"></i>1. Select Account Context</h6>
        <p class="text-muted small mb-3">These account selections apply to all items within the uploaded Excel file.</p>
        
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label for="os-client-select" class="form-label small fw-bold text-dark mb-1">
              Choose Client <span class="text-danger">*</span>
            </label>
            <select id="os-client-select" class="form-select fw-semibold" required>
              <option value="" disabled selected>-- Select Client --</option>
            </select>
          </div>

          <div class="col-12 col-md-6">
            <label for="os-stock-owner-select" class="form-label small fw-bold text-dark mb-1">
              Choose Stock Owner <span class="text-danger">*</span>
            </label>
            <select id="os-stock-owner-select" class="form-select fw-semibold" disabled required>
              <option value="" disabled selected>-- Select Client First --</option>
            </select>
          </div>
        </div>
      </div>

      <!-- EXCEL UPLOAD PANEL -->
      <div class="card border-0 shadow-sm rounded-0 rounded-sm-3 p-4 mb-4">
        <h6 class="fw-bold mb-1 text-dark"><i class="bi bi-cloud-upload text-primary me-2"></i>2. Upload Opening Stock Excel File</h6>
        <p class="text-muted small mb-3">Mandatory headers: <code>Item Code</code>, <code>Item Description</code>, <code>Quantity</code>, <code>UOM</code>, <code>Category</code>, <code>Location</code>, <code>Batch Number</code>, <code>Manufacturing Date</code>, <code>Expiry Date</code>. Optional: <code>Case Conversion Qty</code>.</p>

        <div id="os-dropzone" class="border rounded-3 p-4 text-center mb-3 bg-light" style="border: 2px dashed #dee2e6 !important; cursor: pointer;">
          <p class="mb-2 text-muted"><i class="bi bi-file-earmark-spreadsheet text-success fs-1 d-block mb-1"></i>Drag & Drop Excel file or</p>
          <button id="os-browse-btn" type="button" class="btn btn-primary btn-sm px-3"><i class="bi bi-folder2-open me-1"></i> Browse Files</button>
          <input type="file" id="os-file-input" accept=".xlsx, .xls" class="d-none">
        </div>

        <div id="os-file-info" class="d-none alert alert-secondary d-flex align-items-center justify-content-between p-2 mb-3">
          <div class="d-flex align-items-center text-truncate me-2">
            <i class="bi bi-file-earmark-excel-fill text-success fs-4 me-2"></i>
            <div class="text-truncate">
              <span class="fw-bold text-dark d-block text-truncate" id="os-filename">file.xlsx</span>
              <small class="text-muted" id="os-filesize">0 KB</small>
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger border-0" id="os-remove-file-btn"><i class="bi bi-x-lg"></i></button>
        </div>

        <button id="os-validate-btn" class="btn btn-primary w-100 py-2 shadow-sm" disabled>
          <i class="bi bi-shield-check me-1"></i> Validate Excel
        </button>
      </div>

      <!-- VALIDATION REPORT & IMPORT ACTION -->
      <div id="os-report-container" class="mb-4"></div>
    </div>
  `;

  setupClientOwnerDropdowns();
  setupUploadInteractions(container);
}

async function setupClientOwnerDropdowns() {
  const clientDropdown = document.getElementById("os-client-select");
  const ownerDropdown = document.getElementById("os-stock-owner-select");
  if (!clientDropdown || !ownerDropdown) return;

  try {
    const clients = await Api.clients.list();
    if (!clients || clients.length === 0) {
      clientDropdown.innerHTML = `<option value="" disabled>⚠️ No configured client records found.</option>`;
      return;
    }

    clientDropdown.innerHTML = `<option value="" disabled selected>-- Choose Client --</option>`;
    clients.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.code})`;
      clientDropdown.appendChild(opt);
    });

    clientDropdown.addEventListener("change", async (e) => {
      const selectedClientId = e.target.value;
      ownerDropdown.disabled = true;
      ownerDropdown.innerHTML = `<option value="" disabled selected>Fetching stock owners...</option>`;
      checkCanImport();

      try {
        const stockOwners = await Api.stockOwners.list(selectedClientId);
        if (!stockOwners || stockOwners.length === 0) {
          ownerDropdown.innerHTML = `<option value="" disabled>⚠️ No stock owners found.</option>`;
          return;
        }

        ownerDropdown.innerHTML = `<option value="" disabled selected>-- Choose Stock Owner --</option>`;
        stockOwners.forEach((so) => {
          const opt = document.createElement("option");
          opt.value = so.id;
          opt.textContent = `${so.name} (${so.code})`;
          ownerDropdown.appendChild(opt);
        });

        ownerDropdown.disabled = false;
      } catch (err) {
        ownerDropdown.innerHTML = `<option value="" disabled>❌ Error loading stock owners</option>`;
      }
    });

    ownerDropdown.addEventListener("change", () => checkCanImport());
  } catch (err) {
    clientDropdown.innerHTML = `<option value="" disabled>❌ Error loading clients</option>`;
  }
}

function setupUploadInteractions(container) {
  const fileInput = container.querySelector("#os-file-input");
  const dropzone = container.querySelector("#os-dropzone");
  const browseBtn = container.querySelector("#os-browse-btn");
  const removeBtn = container.querySelector("#os-remove-file-btn");
  const validateBtn = container.querySelector("#os-validate-btn");

  browseBtn.onclick = () => fileInput.click();
  dropzone.onclick = (e) => {
    if (e.target !== browseBtn) fileInput.click();
  };

  fileInput.onchange = (e) => {
    if (e.target.files.length) attachFile(e.target.files[0]);
  };

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-primary", "bg-primary-subtle");
  });
  dropzone.addEventListener("dragleave", () =>
    dropzone.classList.remove("border-primary", "bg-primary-subtle"),
  );
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-primary", "bg-primary-subtle");
    if (e.dataTransfer.files.length) attachFile(e.dataTransfer.files[0]);
  });

  removeBtn.onclick = () => {
    selectedFile = null;
    validationResult = null;
    fileInput.value = "";
    document.getElementById("os-file-info").classList.add("d-none");
    document.getElementById("os-dropzone").classList.remove("d-none");
    validateBtn.disabled = true;
    document.getElementById("os-report-container").innerHTML = "";
  };

  validateBtn.onclick = runValidation;
}

function attachFile(file) {
  selectedFile = file;
  validationResult = null;
  document.getElementById("os-filename").textContent = file.name;
  document.getElementById("os-filesize").textContent =
    `${(file.size / 1024).toFixed(1)} KB`;
  document.getElementById("os-file-info").classList.remove("d-none");
  document.getElementById("os-dropzone").classList.add("d-none");
  document.getElementById("os-validate-btn").disabled = false;
  document.getElementById("os-report-container").innerHTML = "";
}

async function runValidation() {
  const validateBtn = document.getElementById("os-validate-btn");
  const reportContainer = document.getElementById("os-report-container");

  if (!selectedFile) return;

  validateBtn.disabled = true;
  validateBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Validating Excel Content...`;
  reportContainer.innerHTML = "";

  try {
    const fd = new FormData();
    fd.append("file", selectedFile);

    validationResult = await Api.openingStock.validate(fd);

    renderValidationReport(validationResult);
  } catch (err) {
    reportContainer.innerHTML = `
      <div class="alert alert-danger border-0 shadow-sm rounded-3">
        <i class="bi bi-exclamation-triangle-fill me-2"></i> <strong>Validation Request Failed:</strong> ${err.message}
      </div>`;
  } finally {
    validateBtn.disabled = false;
    validateBtn.innerHTML = `<i class="bi bi-shield-check me-1"></i> Re-Validate Excel`;
  }
}

function renderValidationReport(res) {
  const reportContainer = document.getElementById("os-report-container");
  const hasErrors = !res.isValid || (res.errors && res.errors.length > 0);
  const hasWarnings = res.warnings && res.warnings.length > 0;

  let errorsListHtml = "";
  if (hasErrors) {
    errorsListHtml = `
      <div class="alert alert-danger border-0 shadow-sm rounded-3 mb-3">
        <h6 class="fw-bold mb-2"><i class="bi bi-x-circle-fill me-2"></i>Validation Errors (${res.errors.length})</h6>
        <ul class="mb-0 small ps-3" style="max-height: 200px; overflow-y: auto;">
          ${res.errors.map((e) => `<li class="mb-1">${e}</li>`).join("")}
        </ul>
      </div>`;
  }

  let warningsListHtml = "";
  if (hasWarnings) {
    warningsListHtml = `
      <div class="alert alert-warning border-0 shadow-sm rounded-3 mb-3">
        <h6 class="fw-bold mb-2"><i class="bi bi-exclamation-triangle-fill me-2"></i>Warnings & Duplicate Checks (${res.warnings.length})</h6>
        <ul class="mb-0 small ps-3" style="max-height: 150px; overflow-y: auto;">
          ${res.warnings.map((w) => `<li class="mb-1">${w}</li>`).join("")}
        </ul>
      </div>`;
  }

  let statusBanner = "";
  if (!hasErrors) {
    statusBanner = `
      <div class="alert alert-success border-0 shadow-sm rounded-3 mb-3 d-flex align-items-center">
        <i class="bi bi-check-circle-fill fs-3 me-3 text-success"></i>
        <div>
          <h6 class="fw-bold mb-0">Excel File Validation Passed Successfully!</h6>
          <small>Total <strong>${res.totalRows}</strong> item row(s) are ready for import into the live inventory matrix.</small>
        </div>
      </div>`;
  }

  reportContainer.innerHTML = `
    <div class="card border-0 shadow-sm rounded-0 rounded-sm-3 p-4 animate-fade-in">
      <h6 class="fw-bold mb-3 text-dark"><i class="bi bi-clipboard-data text-primary me-2"></i>Validation Report</h6>
      
      ${statusBanner}
      ${errorsListHtml}
      ${warningsListHtml}

      <button id="os-import-btn" class="btn btn-success w-100 py-3 shadow-sm fw-bold fs-6 mt-2" ${hasErrors ? "disabled" : ""}>
        <i class="bi bi-box-arrow-in-down me-1"></i> Import Opening Stock
      </button>
      <div id="os-import-status" class="small mt-2 px-1"></div>
    </div>
  `;

  checkCanImport();

  const importBtn = document.getElementById("os-import-btn");
  if (importBtn) {
    importBtn.onclick = runImport;
  }
}

function checkCanImport() {
  const importBtn = document.getElementById("os-import-btn");
  if (!importBtn) return;

  const clientId = document.getElementById("os-client-select")?.value;
  const ownerId = document.getElementById("os-stock-owner-select")?.value;
  const isValid = validationResult && validationResult.isValid;

  if (isValid && clientId && ownerId) {
    importBtn.disabled = false;
  } else {
    importBtn.disabled = true;
  }
}

async function runImport() {
  const importBtn = document.getElementById("os-import-btn");
  const statusEl = document.getElementById("os-import-status");
  const clientId = document.getElementById("os-client-select").value;
  const ownerId = document.getElementById("os-stock-owner-select").value;

  if (!selectedFile || !clientId || !ownerId) return;

  importBtn.disabled = true;
  importBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Committing Database Transaction...`;
  statusEl.className = "small mt-2 text-muted";
  statusEl.textContent = "Processing atomic batch write to D1 storage...";

  try {
    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("client_id", clientId);
    fd.append("stock_owner_id", ownerId);

    const res = await Api.openingStock.import(fd);

    if (!res || res.success === false) {
      throw new Error(res?.error || "Import transaction failed on server.");
    }

    document.getElementById("opening-stock-root").innerHTML = `
      <div class="card border-0 shadow-sm p-5 text-center rounded-3 animate-fade-in my-4">
        <i class="bi bi-check-circle-fill text-success display-4 mb-3"></i>
        <h4 class="fw-bold text-success mb-2">Opening Stock Successfully Imported!</h4>
        <p class="text-muted mx-auto mb-4" style="max-width: 600px;">
          Created <strong>${res.total_rows}</strong> live inventory record(s) and logged transaction ledger ID 
          <code class="text-primary">${res.transaction_id}</code>.
        </p>
        <div class="d-flex justify-content-center gap-3">
          <button id="os-go-inventory" class="btn btn-outline-primary shadow-sm px-4">
            <i class="bi bi-boxes me-1"></i> View Live Inventory
          </button>
          <button id="os-reload" class="btn btn-primary shadow-sm px-4">
            <i class="bi bi-plus-circle me-1"></i> Upload Another Batch
          </button>
        </div>
      </div>
    `;

    document.getElementById("os-go-inventory").onclick = () => {
      const navLink = document.querySelector(
        '.wms-sidebar .nav-link[data-view="tenant-inventory"]',
      );
      if (navLink) navLink.click();
    };

    document.getElementById("os-reload").onclick = () => {
      render(document.getElementById("workspace-viewport"), null);
    };
  } catch (err) {
    statusEl.className = "small mt-2 text-danger fw-semibold";
    statusEl.innerHTML = `<i class="bi bi-x-circle-fill me-1"></i> Import Failed: ${err.message}`;
    importBtn.disabled = false;
    importBtn.innerHTML = `<i class="bi bi-box-arrow-in-down me-1"></i> Import Opening Stock`;
  }
}
