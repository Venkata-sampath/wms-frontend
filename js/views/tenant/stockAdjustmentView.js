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
      
      <!-- Header -->
      <div class="d-flex justify-content-between align-items-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-sliders text-primary me-2"></i>Stock Adjustment (Multi-Item Cycle Count)
          </h3>
          <p class="text-muted small mb-0">Select multiple items from inventory, enter counted physical stock, and post batch adjustments.</p>
        </div>
        <button id="refresh-adj-btn" class="btn btn-light btn-sm border text-muted shadow-sm" type="button">
          <i class="bi bi-arrow-clockwise"></i> Refresh Inventory
        </button>
      </div>

      <div id="adjustment-alert-anchor" class="px-3 px-sm-0"></div>

      <div class="row g-0 g-sm-4">
        
        <!-- Left Panel: Live Inventory List -->
        <div class="col-12 col-xl-5 mb-4 mb-xl-0">
          <div class="card shadow-sm border-0 rounded-0 rounded-sm-3 h-100">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h5 class="fw-bold text-secondary mb-0 small text-uppercase">
                <i class="bi bi-boxes me-2"></i>Live Inventory Items
              </h5>
              <input type="text" id="inv-search-input" class="form-control form-control-sm bg-light w-50" placeholder="Filter code or location...">
            </div>
            <div class="card-body p-0">
              <div class="table-responsive" style="max-height: 580px; overflow-y: auto;">
                <table class="table table-hover align-middle mb-0 text-nowrap">
                  <thead class="table-light text-secondary small text-uppercase" style="font-size: 0.75rem; position: sticky; top: 0; z-index: 1;">
                    <tr>
                      <th class="ps-3 py-2">Location & Item</th>
                      <th class="py-2 text-end">Total</th>
                      <th class="py-2 text-end text-danger">Rsvd</th>
                      <th class="pe-3 py-2 text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody id="inventory-selection-table-body">
                    <tr>
                      <td colspan="4" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                        Loading inventory...
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Panel: Adjustment Staging Workspace -->
        <div class="col-12 col-xl-7">
          <div class="card shadow-sm border-0 rounded-0 rounded-sm-3">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h5 class="fw-bold text-secondary mb-0 small text-uppercase">
                <i class="bi bi-list-check me-2"></i>Staged Adjustment Items (<span id="staged-count-badge">0</span>)
              </h5>
              <button id="clear-staged-btn" class="btn btn-outline-danger btn-sm py-1 px-2" style="font-size: 0.75rem;" type="button" disabled>
                <i class="bi bi-trash me-1"></i>Clear All
              </button>
            </div>
            
            <div class="card-body p-3">
              <div id="staged-empty-placeholder" class="text-center py-5 border border-dashed rounded-3 bg-light text-muted">
                <i class="bi bi-hand-index-thumb display-6 d-block mb-2 text-primary"></i>
                <div class="fw-semibold">No items selected for adjustment</div>
                <div class="extra-small text-secondary mt-1">Click <strong>"Add"</strong> on items from the left inventory list to stage them here.</div>
              </div>

              <div id="staged-items-container" class="table-responsive d-none mb-3" style="max-height: 400px; overflow-y: auto;">
                <table class="table table-sm table-bordered align-middle mb-0" style="font-size: 0.85rem;">
                  <thead class="table-light small text-uppercase">
                    <tr>
                      <th>SKU & Location</th>
                      <th class="text-end" style="width: 90px;">System</th>
                      <th class="text-end" style="width: 140px;">Counted Qty *</th>
                      <th class="text-end" style="width: 110px;">Variance</th>
                      <th class="text-center" style="width: 50px;">Remove</th>
                    </tr>
                  </thead>
                  <tbody id="staged-items-tbody"></tbody>
                </table>
              </div>

              <!-- Form Metadata & Submit -->
              <form id="stock-adjustment-form" novalidate>
                <div class="mb-3">
                  <label for="adj-remarks" class="form-label small fw-semibold text-muted">Audit Reason / Remarks *</label>
                  <textarea id="adj-remarks" class="form-control bg-light" rows="2" placeholder="e.g. Periodic cycle count reconciliation, warehouse physical audit..." required disabled></textarea>
                </div>

                <button type="submit" id="submit-adj-btn" class="btn btn-primary w-100 py-2 fw-semibold shadow-sm d-flex align-items-center justify-content-center" disabled>
                  <i class="bi bi-check-circle me-2"></i> Post Batch Adjustment (<span id="btn-item-count">0</span> items)
                </button>
              </form>

            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  const alertAnchor = document.getElementById("adjustment-alert-anchor");
  const refreshBtn = document.getElementById("refresh-adj-btn");
  const searchInput = document.getElementById("inv-search-input");
  const form = document.getElementById("stock-adjustment-form");
  const remarksIn = document.getElementById("adj-remarks");
  const submitBtn = document.getElementById("submit-adj-btn");
  const clearBtn = document.getElementById("clear-staged-btn");
  const stagedCountBadge = document.getElementById("staged-count-badge");
  const btnItemCount = document.getElementById("btn-item-count");
  const placeholder = document.getElementById("staged-empty-placeholder");
  const stagedContainer = document.getElementById("staged-items-container");
  const stagedTbody = document.getElementById("staged-items-tbody");

  let fullInventoryList = [];
  let stagedItemsMap = new Map();

  async function loadInventory() {
    const tbody = document.getElementById("inventory-selection-table-body");
    try {
      const res = await Api.inventory.getSnapshot();
      fullInventoryList = res.inventory || [];
      renderInventoryTable(fullInventoryList);
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-danger py-4 small fw-bold">
            <i class="bi bi-exclamation-triangle-fill me-2"></i> Failed to load inventory: ${err.message}
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
          <td colspan="4" class="text-center py-5 text-muted small">
            <i class="bi bi-inbox display-6 d-block mb-2 text-secondary"></i>No inventory items found.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = "";
    items.forEach((item) => {
      const isStaged = stagedItemsMap.has(item.id);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="ps-3">
          <span class="badge bg-light text-primary border font-monospace me-1">${escapeHtml(item.location_id)}</span>
          <strong class="text-dark">${escapeHtml(item.item_code)}</strong>
          <div class="text-muted text-truncate" style="max-width: 170px; font-size: 0.75rem;">${escapeHtml(item.item_description)}</div>
          <div class="text-muted extra-small" style="font-size: 0.7rem;">Batch: ${item.batch_number ? escapeHtml(item.batch_number) : "N/A"}</div>
        </td>
        <td class="text-end fw-bold text-primary font-monospace">${parseFloat(item.quantity || 0)}</td>
        <td class="text-end text-danger font-monospace">${parseFloat(item.reserved_quantity || 0)}</td>
        <td class="pe-3 text-end">
          <button class="btn ${isStaged ? "btn-secondary" : "btn-outline-primary"} btn-sm px-2 py-1 add-item-btn" 
                  type="button" 
                  style="font-size: 0.75rem;" 
                  ${isStaged ? "disabled" : ""}>
            ${isStaged ? '<i class="bi bi-check2"></i> Added' : '<i class="bi bi-plus-lg"></i> Add'}
          </button>
        </td>
      `;

      tr.querySelector(".add-item-btn").addEventListener("click", () => {
        addToStaging(item);
      });

      tbody.appendChild(tr);
    });
  }

  function addToStaging(item) {
    if (stagedItemsMap.has(item.id)) return;

    stagedItemsMap.set(item.id, {
      ...item,
      physical_quantity: item.quantity,
      delta: 0,
    });

    updateStagedUI();
    renderInventoryTable(filterInventory(searchInput.value));
  }

  function removeFromStaging(inventoryId) {
    stagedItemsMap.delete(inventoryId);
    updateStagedUI();
    renderInventoryTable(filterInventory(searchInput.value));
  }

  function updateStagedUI() {
    const count = stagedItemsMap.size;
    stagedCountBadge.textContent = count;
    btnItemCount.textContent = count;

    if (count === 0) {
      placeholder.classList.remove("d-none");
      stagedContainer.classList.add("d-none");
      remarksIn.disabled = true;
      submitBtn.disabled = true;
      clearBtn.disabled = true;
      stagedTbody.innerHTML = "";
      return;
    }

    placeholder.classList.add("d-none");
    stagedContainer.classList.remove("d-none");
    remarksIn.disabled = false;
    submitBtn.disabled = false;
    clearBtn.disabled = false;

    stagedTbody.innerHTML = "";
    stagedItemsMap.forEach((entry, invId) => {
      const delta = entry.delta;
      const deltaClass =
        delta > 0
          ? "text-success fw-bold"
          : delta < 0
            ? "text-danger fw-bold"
            : "text-muted";
      const deltaSign = delta > 0 ? "+" : "";

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <div class="fw-bold text-dark">${escapeHtml(entry.item_code)}</div>
          <div class="extra-small text-muted" style="font-size:0.75rem;">
            Loc: <span class="badge bg-light text-dark border font-monospace">${escapeHtml(entry.location_id)}</span> | UOM: ${escapeHtml(entry.uom || "PCS")}
          </div>
          <div class="text-danger extra-small" style="font-size:0.7rem;">Rsvd: ${entry.reserved_quantity}</div>
        </td>
        <td class="text-end font-monospace pt-3">${parseFloat(entry.quantity || 0)}</td>
        <td>
          <input type="number" step="any" min="${entry.reserved_quantity || 0}" 
                 class="form-control form-control-sm text-end phys-qty-input font-monospace" 
                 value="${entry.physical_quantity}" 
                 data-id="${invId}">
        </td>
        <td class="text-end font-monospace pt-3 ${deltaClass}">
          ${deltaSign}${delta}
        </td>
        <td class="text-center pt-2.5">
          <button type="button" class="btn btn-outline-danger btn-sm p-1 remove-btn" data-id="${invId}" title="Remove item">
            <i class="bi bi-x-lg"></i>
          </button>
        </td>
      `;

      row.querySelector(".phys-qty-input").addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        const sys = parseFloat(entry.quantity) || 0;
        const currentPhys = isNaN(val) ? 0 : val;
        entry.physical_quantity = e.target.value;
        entry.delta = currentPhys - sys;
        updateStagedUI();
      });

      row.querySelector(".remove-btn").addEventListener("click", () => {
        removeFromStaging(invId);
      });

      stagedTbody.appendChild(row);
    });
  }

  function filterInventory(term) {
    const q = (term || "").toLowerCase().trim();
    if (!q) return fullInventoryList;
    return fullInventoryList.filter(
      (i) =>
        (i.item_code || "").toLowerCase().includes(q) ||
        (i.location_id || "").toLowerCase().includes(q) ||
        (i.item_description || "").toLowerCase().includes(q),
    );
  }

  searchInput.addEventListener("input", (e) => {
    renderInventoryTable(filterInventory(e.target.value));
  });

  clearBtn.addEventListener("click", () => {
    stagedItemsMap.clear();
    updateStagedUI();
    renderInventoryTable(filterInventory(searchInput.value));
  });

  // Form Submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertAnchor.innerHTML = "";

    const remarks = remarksIn.value.trim();

    if (stagedItemsMap.size === 0) {
      renderAlert(
        alertAnchor,
        "warning",
        "Please select at least one item to adjust.",
      );
      return;
    }

    if (!remarks) {
      renderAlert(
        alertAnchor,
        "warning",
        "Audit remarks/reasons are mandatory.",
      );
      return;
    }

    const payloadItems = [];
    for (const [invId, entry] of stagedItemsMap.entries()) {
      const physQty = parseFloat(entry.physical_quantity);
      if (isNaN(physQty) || physQty < 0) {
        renderAlert(
          alertAnchor,
          "warning",
          `Physical quantity for item '${entry.item_code}' must be a non-negative number.`,
        );
        return;
      }
      if (physQty < entry.reserved_quantity) {
        renderAlert(
          alertAnchor,
          "warning",
          `Counted quantity for SKU '${entry.item_code}' cannot drop below reserved quantity (${entry.reserved_quantity}).`,
        );
        return;
      }
      payloadItems.push({
        inventory_id: invId,
        physical_quantity: physQty,
        item_code: entry.item_code,
      });
    }

    setLoading(true);

    try {
      const res = await Api.inventory.adjust({
        remarks,
        items: payloadItems,
      });

      renderAlert(
        alertAnchor,
        "success",
        res.message || "Batch adjustment successfully posted.",
      );
      stagedItemsMap.clear();
      remarksIn.value = "";
      updateStagedUI();
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

  function setLoading(isL) {
    if (isL) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Posting Adjustment...`;
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="bi bi-check-circle me-2"></i> Post Batch Adjustment (${stagedItemsMap.size} items)`;
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

  await loadInventory();
}
