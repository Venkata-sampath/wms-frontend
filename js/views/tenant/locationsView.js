import { Api } from "../../api.js";

/**
 * Renders and wires up the Locations Blueprint layout view component.
 * @param {HTMLElement} container - The target injection workspace viewport canvas frame
 * @param {Object} currentUser - The active authenticated user session profile metadata
 */
export async function render(container, currentUser) {
  const isAdmin = currentUser.role === "admin";

  // Draw core structural template instantly with tightened mobile spacings
  container.innerHTML = `
    <style>
      .location-cube-item {
        cursor: pointer !important;
        transition: transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
      }
      .location-cube-item:hover {
        transform: translateY(-3px);
        box-shadow: 0 .5rem 1rem rgba(0,0,0,.15) !important;
      }
    </style>
    
    <!-- Reduced global outer padding on mobile from p-4 to p-2 -->
    <div class="container-fluid p-2 p-sm-4 animate-fade-in">
      
      <!-- Tightened Header Framework: Reduced bottom margins on mobile views -->
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 mb-md-4 pb-2 border-bottom">
        <div class="mb-2 mb-md-0">
          <h4 class="fw-bold text-dark mb-1">
            <i class="bi bi-grid-3x3-gap text-primary me-2"></i>Locations Blueprint
          </h4>
          <p class="text-muted small mb-0">Configure structural inventory bin frameworks and audit layout zone occupancy balances.</p>
        </div>
        <div>
          <button id="refresh-locations-btn" class="btn btn-sm btn-outline-secondary shadow-sm px-3 w-100 w-md-auto" type="button">
            <i class="bi bi-arrow-clockwise me-1"></i> Sync Grid
          </button>
        </div>
      </div>

      <div id="locations-alert-anchor"></div>

      <!-- Structural Storage Slot Registration Input Frame -->
      <div class="row mb-3 mb-md-4">
        <div class="col-12 col-md-10 col-lg-8 mx-auto" id="location-creation-aside-panel">
          ${
            isAdmin
              ? `
            <div class="card shadow-sm border-0 rounded-3 animate-fade-in">
              <!-- Reduced card heading padding on mobile -->
              <div class="card-header bg-white py-2 py-sm-3 border-bottom">
                <h6 class="fw-bold text-secondary mb-0"><i class="bi bi-plus-circle me-2 text-primary"></i>Initialize Storage Slot</h6>
              </div>
              <!-- Reduced card body internal padding on mobile from p-4 to p-3 -->
              <div class="card-body p-3 p-sm-4">
                <form id="create-location-form" novalidate>
                  
                  <div class="mb-3">
                    <label for="loc-identifier" class="form-label small fw-semibold text-muted">Location Label Identifier</label>
                    <div class="input-group input-group-sm">
                      <span class="input-group-text bg-light text-muted"><i class="bi bi-tag"></i></span>
                      <input type="text" id="loc-identifier" class="form-control text-uppercase font-monospace" 
                             placeholder="e.g. AISLE-01-BAY-A" required autocomplete="off">
                    </div>
                    <div class="form-text text-muted mt-2" style="font-size:0.75rem;">
                      Recommendation format standards: Use unique uppercase letters, digits, and hyphens to define structural sectors clearly.
                    </div>
                  </div>

                  <button type="submit" id="submit-loc-btn" class="btn btn-primary btn-sm w-100 py-2 fw-semibold shadow-sm">
                    <i class="bi bi-plus-square-fill me-2"></i> Register Location Label
                  </button>

                </form>
              </div>
            </div>
            `
              : `
            <div class="card bg-light border-0 rounded-3 p-3 p-sm-4 text-center shadow-sm">
              <i class="bi bi-shield-lock text-muted display-6 mb-2 d-block"></i>
              <h6 class="fw-bold text-secondary mb-1">Configuration Locked</h6>
              <p class="text-muted small mb-0">Your operator profile has read-only blueprint privileges. Structural alterations require administrative approval signatures.</p>
            </div>
            `
          }
        </div>
      </div>

      <!-- Operational Matrix Management Hub Block -->
      <div class="row g-3 g-md-4">
        <div class="col-12">
          <div class="card shadow-sm border-0 rounded-3">
            <!-- Compact card header controls for mobile view execution -->
            <div class="card-header bg-white py-2 py-sm-3 border-bottom d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
              <h6 class="fw-bold text-secondary mb-0"><i class="bi bi-columns-gap me-2 text-primary"></i>Active Operational Matrix</h6>
              
              <div class="d-flex flex-column flex-sm-row gap-2 w-100 w-sm-auto">
                <div class="input-group input-group-sm" style="min-width: 100%;">
                  <span class="input-group-text bg-light text-muted"><i class="bi bi-search"></i></span>
                  <input type="text" id="loc-search-input" class="form-control" placeholder="Search locations...">
                </div>
                <select id="loc-filter-select" class="form-select form-select-sm" style="min-width: 100%;">
                  <option value="All">All Statuses</option>
                  <option value="Free">Free</option>
                  <option value="Occupied">Occupied</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </div>
            </div>
            
            <!-- Tightened canvas panel wrapper margins -->
            <div class="card-body p-2 p-sm-4 bg-light bg-opacity-20">
              <div class="row g-2 g-sm-3" id="locations-grid-canvas">
                <div class="col-12 text-center py-5 text-muted">
                  <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                  Loading layout matrices...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Inventory Audit Frame Modal Overlay Component -->
    <div class="modal fade" id="locationAuditModal" data-bs-backdrop="static" tabindex="-1" aria-labelledby="locationAuditModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-md p-2">
        <div class="modal-content border-0 shadow-lg rounded-3">
          <div class="modal-header bg-dark text-white py-2 py-sm-3">
            <h5 class="modal-title fw-bold md-modal-title" id="locationAuditModalLabel">
              <i class="bi bi-box-seam me-2 text-warning"></i>Slot Content Inventory Audit
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-0">
            <div class="bg-light px-3 py-2 border-bottom d-flex justify-content-between align-items-center">
              <span class="text-secondary small fw-semibold">Target Bin Location:</span>
              <span id="audit-target-label" class="badge bg-primary fs-6 font-monospace px-3 py-1 shadow-sm">---</span>
            </div>
            <div class="p-3">
              <div class="table-responsive" style="max-height: 350px;">
                <table class="table table-sm table-hover align-middle mb-0">
                  <thead class="table-light small text-uppercase" style="font-size:0.7rem;">
                    <tr>
                      <th class="py-2 ps-2">Item SKU</th>
                      <th class="py-2">Description</th>
                      <th class="py-2 text-end pe-2">Qty</th>
                    </tr>
                  </thead>
                  <tbody id="location-audit-table-body"></tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="modal-footer bg-light py-2">
            <button type="button" class="btn btn-secondary btn-sm fw-semibold px-4" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Track DOM Elements
  const alertAnchor = document.getElementById("locations-alert-anchor");
  const gridCanvas = document.getElementById("locations-grid-canvas");
  const refreshBtn = document.getElementById("refresh-locations-btn");
  const createForm = document.getElementById("create-location-form");
  const locInput = document.getElementById("loc-identifier");
  const submitBtn = document.getElementById("submit-loc-btn");
  const searchInput = document.getElementById("loc-search-input");
  const filterSelect = document.getElementById("loc-filter-select");

  // Initialize Bootstrap Modal Instance Controls
  const auditModalEl = document.getElementById("locationAuditModal");
  const bootstrapAuditModal = new bootstrap.Modal(auditModalEl);

  // Execution Sync Trigger
  await synchronizeBlueprintGrid();

  // Wire Interaction Event Listeners: Search & Filtering
  searchInput.addEventListener("input", applyFilters);
  filterSelect.addEventListener("change", applyFilters);

  // Wire Interaction Event Listeners: Add Location Form Submission
  if (createForm && isAdmin) {
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      alertAnchor.innerHTML = "";

      const locationId = locInput.value.trim();

      if (!locationId || locationId.length < 2) {
        renderAlert(
          alertAnchor,
          "warning",
          "Validation failure: A descriptive structural label identifier input value is required.",
        );
        return;
      }

      setLoadingState(true);

      try {
        const response = await Api.locations.create(locationId);
        renderAlert(
          alertAnchor,
          "success",
          response.message ||
            `Location slot '${locationId}' successfully initialized.`,
        );
        createForm.reset();
        await synchronizeBlueprintGrid();
      } catch (err) {
        renderAlert(
          alertAnchor,
          "danger",
          err.message ||
            "Failed to finalize new structural storage layout configurations.",
        );
      } finally {
        setLoadingState(false);
      }
    });
  }

  // Wire Interaction Event Listeners: Refresh Trigger
  refreshBtn.addEventListener("click", async () => {
    alertAnchor.innerHTML = "";
    await synchronizeBlueprintGrid();
  });

  /**
   * Applies active search text and dropdown status to filter grid items
   */
  function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const filterStatus = filterSelect.value;

    const items = document.querySelectorAll(".location-cube-wrapper");
    let visibleCount = 0;

    items.forEach((item) => {
      const locId = item.getAttribute("data-loc-id");
      const locStatus = item.getAttribute("data-loc-status");

      const matchesSearch = locId.includes(searchTerm);
      const matchesStatus =
        filterStatus === "All" || locStatus === filterStatus;

      if (matchesSearch && matchesStatus) {
        item.style.display = "";
        visibleCount++;
      } else {
        item.style.display = "none";
      }
    });

    let placeholder = document.getElementById("no-results-placeholder");

    if (visibleCount === 0) {
      if (!placeholder) {
        placeholder = document.createElement("div");
        placeholder.id = "no-results-placeholder";
        placeholder.className =
          "col-12 text-center py-5 text-muted animate-fade-in";
        placeholder.innerHTML = `
          <i class="bi bi-search display-6 d-block mb-3 text-secondary"></i>
          <p class="fw-bold mb-1">No locations match criteria</p>
          <small class="text-muted">Adjust search terms or filters.</small>
        `;
        gridCanvas.appendChild(placeholder);
      }
    } else if (placeholder) {
      placeholder.remove();
    }
  }

  /**
   * Dispatches GET list queries and formats location items into visual bin components
   */
  async function synchronizeBlueprintGrid() {
    try {
      const responseData = await Api.locations.list();
      const itemsArray =
        responseData && responseData.locations ? responseData.locations : [];

      if (itemsArray.length === 0) {
        gridCanvas.innerHTML = `
          <div class="col-12 text-center py-5 text-muted animate-fade-in">
            <i class="bi bi-border-style display-5 text-secondary d-block mb-3"></i>
            <p class="small mb-0">No structural inventory slots declared inside the platform registry framework database rows yet.</p>
          </div>
        `;
        return;
      }

      gridCanvas.innerHTML = "";

      itemsArray.forEach((slot) => {
        const statusColor =
          slot.calculated_status === "Occupied"
            ? "bg-primary"
            : slot.calculated_status === "Free"
              ? "bg-success"
              : "bg-danger";

        const columnCard = document.createElement("div");
        // Compacted spacing grid: row g-2 matches col scaling metrics perfectly
        columnCard.className =
          "col-6 col-sm-6 col-md-4 col-xl-3 location-cube-wrapper p-1 animate-fade-in";

        columnCard.setAttribute("data-loc-id", slot.id.toLowerCase());
        columnCard.setAttribute("data-loc-status", slot.calculated_status);

        columnCard.innerHTML = `
          <div class="card h-100 border-0 shadow-sm location-cube-item">
            <div class="card-body p-2 text-center">
              <div class="fw-bold text-dark font-monospace mb-1 small text-truncate" title="${slot.id}">${slot.id}</div>
              <span class="badge ${statusColor} text-white mb-1 px-2 py-0.5 rounded style="font-size: 0.7rem;">${slot.calculated_status}</span>
              
              ${
                isAdmin
                  ? `
                <button class="btn btn-xs btn-outline-warning w-100 toggle-loc-btn mt-1 py-0.5" 
                        style="font-size:0.7rem;" data-id="${slot.id}" data-status="${slot.status}">
                  ${slot.status === "available" ? "Disable" : "Enable"}
                </button>
              `
                  : ""
              }
            </div>
          </div>
        `;

        columnCard
          .querySelector(".location-cube-item")
          .addEventListener("click", () => {
            inspectBinInventory(slot.id);
          });

        const toggleBtn = columnCard.querySelector(".toggle-loc-btn");
        if (toggleBtn) {
          toggleBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            alertAnchor.innerHTML = "";

            try {
              const currentStatus = toggleBtn.getAttribute("data-status");
              await Api.locations.toggleStatus(slot.id, currentStatus);
              await synchronizeBlueprintGrid();
            } catch (err) {
              renderAlert(
                alertAnchor,
                "danger",
                err.message ||
                  "Failed to alter structural availability status configurations.",
              );
            }
          });
        }

        gridCanvas.appendChild(columnCard);
      });

      applyFilters();
    } catch (err) {
      gridCanvas.innerHTML = `
        <div class="col-12 text-center text-danger py-4 small fw-bold">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>Ecosystem synchronization bottleneck: ${err.message}
        </div>
      `;
    }
  }

  /**
   * Fetches sub-items inside a targeted container and mounts records inside an overlay frame modal
   */
  async function inspectBinInventory(locationId) {
    const tableBody = document.getElementById("location-audit-table-body");
    const labelHeader = document.getElementById("audit-target-label");

    labelHeader.innerText = locationId;
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-4 text-muted small">
          <span class="spinner-border spinner-border-sm text-warning me-2" role="status"></span>
          Querying active balances...
        </td>
      </tr>
    `;

    bootstrapAuditModal.show();

    try {
      const inspectData = await Api.locations.list(locationId);
      const itemsList =
        inspectData && inspectData.items ? inspectData.items : [];

      if (itemsList.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="3" class="text-center py-4 text-muted small italic">
              <i class="bi bi-info-circle me-1"></i> This location slot is completely empty.
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = "";

      itemsList.forEach((item) => {
        const tr = document.createElement("tr");
        tr.className = "align-middle small";
        tr.innerHTML = `
          <td class="fw-semibold text-secondary font-monospace ps-1" style="font-size:0.75rem;">${item.item_code}</td>
          <td class="text-dark text-truncate" style="max-width:120px; font-size:0.75rem;">${item.item_description || "N/A"}</td>
          <td class="text-end fw-bold text-primary pe-1" style="font-size:0.75rem;">${Number(item.quantity).toLocaleString()}</td>
        `;
        tableBody.appendChild(tr);
      });
    } catch (err) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="3" class="text-center text-danger py-3 small fw-bold">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>Failed to complete layout balances audit query: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function setLoadingState(isLoading) {
    if (!submitBtn) return;
    if (isLoading) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Saving...`;
      if (locInput) locInput.disabled = true;
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="bi bi-plus-square-fill me-2"></i> Register Location Label`;
      if (locInput) locInput.disabled = false;
    }
  }

  function renderAlert(anchor, bootstrapType, message) {
    const iconMap = {
      danger: "bi-exclamation-octagon-fill",
      warning: "bi-exclamation-triangle-fill",
      success: "bi-check-circle-fill",
    };
    anchor.innerHTML = `
      <div class="alert alert-${bootstrapType} border-0 shadow-sm d-flex align-items-center small py-2 px-3 rounded-3 mb-3" role="alert">
        <i class="bi ${iconMap[bootstrapType]} me-2 fs-6 flex-shrink-0"></i>
        <div style="font-size:0.75rem;">${message}</div>
      </div>
    `;
  }
}
