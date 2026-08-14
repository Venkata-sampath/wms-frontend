// src/views/tenant/stockAdjustmentView.js
import { Api } from "../../api.js";

export async function render(container, currentUser) {
  if (currentUser.role === "viewer" || currentUser.role === "super_admin") {
    container.innerHTML = `
      <div class="container-fluid p-0 p-sm-4">
        <div class="alert alert-danger border-0 shadow-sm" role="alert">
          <h5 class="fw-bold"><i class="bi bi-shield-lock-fill me-2"></i>Access Restricted</h5>
          <p class="mb-0 small">Only Warehouse Operators and Admins can perform inventory cycle count stock adjustments.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in">
      
      <!-- Top Header -->
      <div class="d-flex justify-content-between align-items-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-sliders text-primary me-2"></i>Stock Adjustment (Cycle Count)
          </h3>
          <p class="text-muted small mb-0">Select an item from live inventory, re-count physical stock, and record adjustment transactions.</p>
        </div>
        <button id="refresh-adj-btn" class="btn btn-light btn-sm border text-muted shadow-sm" type="button">
          <i class="bi bi-arrow-clockwise"></i> Refresh Inventory
        </button>
      </div>

      <div id="adjustment-alert-anchor" class="px-3 px-sm-0"></div>

      <div class="row g-0 g-sm-4">
        
        <!-- Left Panel: Live Inventory Selector -->
        <div class="col-12 col-lg-7 mb-4 mb-lg-0">
          <div class="card shadow-sm border-0 rounded-0 rounded-sm-3">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h5 class="fw-bold text-secondary mb-0"><i class="bi bi-boxes me-2"></i>Select Inventory Item</h5>
              <input type="text" id="inv-search-input" class="form-control form-control-sm bg-light w-50" placeholder="Search item code or location...">
            </div>
            <div class="card-body p-0">
              <div class="table-responsive" style="max-height: 520px; overflow-y: auto;">
                <table class="table table-hover align-middle mb-0 text-nowrap">
                  <thead class="table-light text-secondary small text-uppercase" style="font-size: 0.75rem; position: sticky; top: 0; z-index: 1;">
                    <tr>
                      <th class="ps-4 py-3">Location</th>
                      <th class="py-3">Item Details</th>
                      <th class="py-3 text-end text-primary">Total</th>
                      <th class="py-3 text-end text-danger">Rsvd</th>
                      <th class="py-3 text-end text-success">Avail</th>
                      <th class="pe-4 py-3 text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody id="inventory-selection-table-body">
                    <tr>
                      <td colspan="6" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                        Querying inventory records...
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Panel: Adjustment Form -->
        <div class="col-12 col-lg-5">
          <div class="card shadow-sm border-0 rounded-0 rounded-sm-3">
            <div class="card-header bg-white py-3 border-bottom">
              <h5 class="fw-bold text-secondary mb-0"><i class="bi bi-pencil-square me-2"></i>Cycle Count Entry</h5>
            </div>
            <div class="card-body p-4">
              <form id="stock-adjustment-form" novalidate>
                <input type="hidden" id="adj-inventory-id">

                <div class="p-3 mb-3 bg-light rounded-3 border border-dashed text-muted small" id="selected-item-summary">
                  <i class="bi bi-info-circle me-1"></i> Click <strong>"Select"</strong> on any item from the inventory table to begin adjustment.
                </div>

                <div class="row g-2 mb-3">
                  <div class="col-6">
                    <label class="form-label small fw-semibold text-muted">Current System Total Qty</label>
                    <input type="text" id="adj-system-qty" class="form-control bg-light" readonly placeholder="0">
                  </div>
                  <div class="col-6">
                    <label class="form-label small fw-semibold text-muted">UOM</label>
                    <input type="text" id="adj-uom" class="form-control bg-light" readonly placeholder="PCS">
                  </div>
                </div>

                <div class="mb-3">
                  <label for="adj-physical-qty" class="form-label small fw-semibold text-muted">Physical Counted Quantity (Total in Bin) *</label>
                  <input type="number" step="any" id="adj-physical-qty" class="form-control bg-light" placeholder="Enter audited total quantity" required disabled>
                </div>

                <div class="mb-3">
                  <label class="form-label small fw-semibold text-muted">Adjustment Delta</label>
                  <div class="input-group">
                    <input type="text" id="adj-delta-qty" class="form-control bg-light fw-bold" readonly placeholder="0">
                    <span class="input-group-text bg-light text-muted" id="adj-delta-badge">Balanced</span>
                  </div>
                </div>

                <div class="mb-4">
                  <label for="adj-remarks" class="form-label small fw-semibold text-muted">Reason / Audit Remarks *</label>
                  <textarea id="adj-remarks" class="form-control bg-light" rows="3" placeholder="e.g. Annual physical count variance, damaged stock discarded..." required disabled></textarea>
                </div>

                <button type="submit" id="submit-adj-btn" class="btn btn-primary w-100 py-2 fw-semibold shadow-sm d-flex align-items-center justify-content-center" disabled>
                  <i class="bi bi-check-circle me-2"></i> Post Stock Adjustment
                </button>

              </form>
            </div>
          </div>
        </div>

      </div>

    </div>
  `;

  // UI Element Selectors
  const alertAnchor = document.getElementById("adjustment-alert-anchor");
  const refreshBtn = document.getElementById("refresh-adj-btn");
  const searchInput = document.getElementById("inv-search-input");
  const form = document.getElementById("stock-adjustment-form");
  const hiddenInvId = document.getElementById("adj-inventory-id");
  const summaryBlock = document.getElementById("selected-item-summary");
  const systemQtyIn = document.getElementById("adj-system-qty");
  const uomIn = document.getElementById("adj-uom");
  const physicalQtyIn = document.getElementById("adj-physical-qty");
  const deltaQtyIn = document.getElementById("adj-delta-qty");
  const deltaBadge = document.getElementById("adj-delta-badge");
  const remarksIn = document.getElementById("adj-remarks");
  const submitBtn = document.getElementById("submit-adj-btn");

  let fullInventoryList = [];

  // Data Loader
  async function loadInventory() {
    const tbody = document.getElementById("inventory-selection-table-body");
    try {
      const res = await Api.inventory.getSnapshot();
      fullInventoryList = res.inventory || [];
      renderInventoryTable(fullInventoryList);
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-danger py-4 small fw-bold">
            <i class="bi bi-exclamation-triangle-fill me-2"></i> Failed to load live inventory snapshot: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function renderInventoryTable(items) {
    const tbody = document.getElementById("inventory-selection-table-body");
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-5 text-muted small">
            <i class="bi bi-inbox display-6 d-block mb-2 text-secondary"></i>No inventory items found.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = "";
    items.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="ps-4 fw-bold text-primary font-monospace">
          <i class="bi bi-geo-alt me-1 text-muted"></i>${escapeHtml(item.location_id)}
        </td>
        <td>
          <div class="fw-bold text-dark">${escapeHtml(item.item_code)}</div>
          <div class="text-muted extra-small" style="font-size:0.75rem;">${escapeHtml(item.item_description)}</div>
          <div class="text-muted extra-small" style="font-size:0.7rem;">Batch: ${item.batch_number ? escapeHtml(item.batch_number) : "N/A"} | Client: ${escapeHtml(item.client_code || "N/A")}</div>
        </td>
        <td class="text-end fw-bold text-primary">${parseFloat(item.quantity || 0)}</td>
        <td class="text-end text-danger">${parseFloat(item.reserved_quantity || 0)}</td>
        <td class="text-end fw-bold text-success">${parseFloat(item.available_quantity || 0)}</td>
        <td class="pe-4 text-end">
          <button class="btn btn-outline-primary btn-sm px-3 select-item-btn" type="button" data-id="${item.id}">
            Select
          </button>
        </td>
      `;

      tr.querySelector(".select-item-btn").addEventListener("click", () => {
        selectInventoryItem(item);
      });

      tbody.appendChild(tr);
    });
  }

  function selectInventoryItem(item) {
    hiddenInvId.value = item.id;
    systemQtyIn.value = item.quantity;
    uomIn.value = item.uom;
    physicalQtyIn.value = item.quantity;
    deltaQtyIn.value = "0";
    deltaBadge.textContent = "Balanced";
    deltaBadge.className = "input-group-text bg-light text-muted";
    remarksIn.value = "";

    summaryBlock.innerHTML = `
      <div class="fw-bold text-dark mb-1"><i class="bi bi-box-seam text-primary me-1"></i> ${escapeHtml(item.item_code)}</div>
      <div>Location: <strong>${escapeHtml(item.location_id)}</strong></div>
      <div>Desc: ${escapeHtml(item.item_description)}</div>
      <div>Reserved Qty: <strong><span class="text-danger">${parseFloat(item.reserved_quantity || 0)}</span></strong> (Total cannot drop below this)</div>
    `;

    physicalQtyIn.disabled = false;
    remarksIn.disabled = false;
    submitBtn.disabled = false;
  }

  // Live Delta Calculator
  physicalQtyIn.addEventListener("input", () => {
    const sys = parseFloat(systemQtyIn.value) || 0;
    const phys = parseFloat(physicalQtyIn.value) || 0;
    const delta = phys - sys;

    deltaQtyIn.value = (delta > 0 ? "+" : "") + delta;

    if (delta > 0) {
      deltaBadge.textContent = "Gain (+)";
      deltaBadge.className = "input-group-text bg-success text-white fw-bold";
    } else if (delta < 0) {
      deltaBadge.textContent = "Loss (-)";
      deltaBadge.className = "input-group-text bg-danger text-white fw-bold";
    } else {
      deltaBadge.textContent = "Balanced";
      deltaBadge.className = "input-group-text bg-light text-muted";
    }
  });

  // Search Filter
  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!term) {
      renderInventoryTable(fullInventoryList);
      return;
    }
    const filtered = fullInventoryList.filter(
      (i) =>
        (i.item_code || "").toLowerCase().includes(term) ||
        (i.location_id || "").toLowerCase().includes(term) ||
        (i.item_description || "").toLowerCase().includes(term),
    );
    renderInventoryTable(filtered);
  });

  // Form Submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertAnchor.innerHTML = "";

    const inventory_id = hiddenInvId.value;
    const physical_quantity = parseFloat(physicalQtyIn.value);
    const remarks = remarksIn.value.trim();

    if (!inventory_id) {
      renderAlert(
        alertAnchor,
        "warning",
        "Please select an inventory item first.",
      );
      return;
    }
    if (isNaN(physical_quantity) || physical_quantity < 0) {
      renderAlert(
        alertAnchor,
        "warning",
        "Physical quantity must be a valid non-negative number.",
      );
      return;
    }
    if (!remarks) {
      renderAlert(
        alertAnchor,
        "warning",
        "Audit remarks/reasons are mandatory for stock adjustments.",
      );
      return;
    }

    setLoading(true);

    try {
      const res = await Api.inventory.adjust({
        inventory_id,
        physical_quantity,
        remarks,
      });

      renderAlert(
        alertAnchor,
        "success",
        res.message || "Stock adjustment successfully posted.",
      );
      resetForm();
      await loadInventory();
    } catch (err) {
      renderAlert(
        alertAnchor,
        "danger",
        err.message || "Failed to execute stock adjustment.",
      );
    } finally {
      setLoading(false);
    }
  });

  refreshBtn.onclick = async () => {
    alertAnchor.innerHTML = "";
    await loadInventory();
  };

  function resetForm() {
    hiddenInvId.value = "";
    systemQtyIn.value = "";
    uomIn.value = "";
    physicalQtyIn.value = "";
    deltaQtyIn.value = "0";
    deltaBadge.textContent = "Balanced";
    deltaBadge.className = "input-group-text bg-light text-muted";
    remarksIn.value = "";
    summaryBlock.innerHTML = `<i class="bi bi-info-circle me-1"></i> Click <strong>"Select"</strong> on any item from the inventory table to begin adjustment.`;
    physicalQtyIn.disabled = true;
    remarksIn.disabled = true;
    submitBtn.disabled = true;
  }

  function setLoading(isL) {
    if (isL) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Posting Adjustment...`;
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="bi bi-check-circle me-2"></i> Post Stock Adjustment`;
    }
  }

  function renderAlert(anchor, bType, text) {
    const icons = {
      danger: "bi-exclamation-octagon-fill",
      warning: "bi-exclamation-triangle-fill",
      success: "bi-check-circle-fill",
    };
    anchor.innerHTML = `
      <div class="alert alert-${bType} border-0 shadow-sm d-flex align-items-center small py-3 px-3 rounded-3 mb-4 mx-3 mx-sm-0" role="alert">
        <i class="bi ${icons[bType]} me-2 fs-5 flex-shrink-0"></i>
        <div>${text}</div>
      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Initial Load
  await loadInventory();
}
