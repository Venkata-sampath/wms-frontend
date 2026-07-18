import { Api } from "../../api.js";

/**
 * Renders and wires up the Super Admin Warehouse Management view
 * @param {HTMLElement} container - The target injection workspace viewport
 * @param {Object} user - The active authenticated user session profile
 */
export async function render(container, user) {
  // Construct baseline structure layout frame with a dynamic loading skeleton
  container.innerHTML = `
    <div class="container-fluid p-0 animate-fade-in">
      
      <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1"><i class="bi bi-building-gear me-2 text-primary"></i>Warehouse Registry Management</h3>
          <p class="text-muted small mb-0">Monitor cloud tenant system matrices, control subscription scopes, and toggle operational lifecycles.</p>
        </div>
        <div class="text-end">
          <span class="badge bg-primary px-3 py-2 fs-6 shadow-sm">Global Control Active</span>
        </div>
      </div>

      <div id="super-warehouse-alert-anchor"></div>

      <div class="card shadow-sm border-0 rounded-3">
        <div class="card-header bg-white py-3 border-bottom d-flex align-items-center justify-content-between">
          <h5 class="fw-bold text-secondary mb-0 mb-sm-0 d-flex align-items-center">
            <i class="bi bi-list-ul me-2"></i> Registered Cloud Tenants
          </h5>
          <button id="refresh-warehouses-btn" class="btn btn-outline-secondary btn-sm d-flex align-items-center">
            <i class="bi bi-arrow-clockwise me-1"></i> Sync Grid
          </button>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover table-striped align-middle mb-0 text-nowrap" id="warehouses-data-table">
              <thead class="table-light border-bottom">
                <tr>
                  <th scope="col" class="ps-4 py-3 text-uppercase small tracking-wider text-muted fw-bold">Company / Legal Name</th>
                  <th scope="col" class="py-3 text-uppercase small tracking-wider text-muted fw-bold">Tenant System Identifier</th>
                  <th scope="col" class="py-3 text-uppercase small tracking-wider text-muted fw-bold">Creation Date</th>
                  <th scope="col" class="py-3 text-uppercase small tracking-wider text-muted fw-bold text-center">Status Flag</th>
                  <th scope="col" class="pe-4 py-3 text-uppercase small tracking-wider text-muted fw-bold text-end">Administrative Actions</th>
                </tr>
              </thead>
              <tbody id="warehouses-table-body">
                <tr>
                  <td colspan="5" class="text-center py-5">
                    <div class="spinner-border text-primary spinner-border-sm me-2" role="status"></div>
                    <span class="text-muted small">Streaming global storage tenants from cloud core...</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  `;

  // Capture active operational interface interactive nodes
  const tableBody = document.getElementById("warehouses-table-body");
  const refreshBtn = document.getElementById("refresh-warehouses-btn");
  const alertAnchor = document.getElementById("super-warehouse-alert-anchor");

  /**
   * Orchestrates the fetch pipeline and structural layout loop injection
   */
  async function streamTenantRecords() {
    try {
      const warehouses = await Api.superadmin.getWarehouses();

      if (!warehouses || warehouses.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center py-5 text-muted">
              <i class="bi bi-building-exclamation display-6 d-block mb-3 text-secondary"></i>
              <p class="mb-0 fw-semibold">No Cloud Tenants Active</p>
              <span class="small extra-small">Navigate to "Onboard Tenant" in your navigation menu to deploy your first warehouse ecosystem.</span>
            </td>
          </tr>
        `;
        return;
      }

      // Loop through arrays and append semantic data grids securely
      tableBody.innerHTML = warehouses
        .map((wh) => {
          const isActive = wh.subscription_status === "active";

          // Define clean contextual styling attributes matching standard Bootstrap schemes
          const badgeClass = isActive
            ? "bg-success-subtle text-success border border-success-subtle"
            : "bg-danger-subtle text-danger border border-danger-subtle";
          const buttonClass = isActive
            ? "btn-outline-danger"
            : "btn-success text-white";
          const buttonIcon = isActive ? "bi-shield-slash" : "bi-shield-check";
          const buttonText = isActive ? "Suspend Access" : "Restore Access";

          // Format ISO timestamps gracefully if available
          const localTime = wh.created_at
            ? new Date(wh.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "N/A";

          return `
          <tr data-wh-id="${wh.id}">
            <td class="ps-4 fw-bold text-dark">${escapeHtml(wh.company_name)}</td>
            <td><code>${wh.id}</code></td>
            <td><i class="bi bi-calendar3 me-2 text-muted"></i>${localTime}</td>
            <td class="text-center">
              <span class="badge text-uppercase rounded-pill px-3 py-1 ${badgeClass}" style="font-size:0.7rem;">
                ${wh.subscription_status}
              </span>
            </td>
            <td class="pe-4 text-end">
              <button 
                class="btn ${buttonClass} btn-sm fw-semibold toggle-status-action-btn px-3 shadow-sm" 
                data-id="${wh.id}" 
                data-status="${wh.subscription_status}"
              >
                <i class="bi ${buttonIcon} me-1"></i> ${buttonText}
              </button>
            </td>
          </tr>
        `;
        })
        .join("");

      // Re-attach fresh click event loops to dynamic elements inside the body container
      bindTableActionListeners();
    } catch (err) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-5 text-danger fw-semibold">
            <i class="bi bi-exclamation-triangle-fill display-6 d-block mb-2 text-danger"></i>
            Failed to load warehouses: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  /**
   * Binds inline row action handling triggers via structural data properties
   */
  function bindTableActionListeners() {
    tableBody
      .querySelectorAll(".toggle-status-action-btn")
      .forEach((button) => {
        button.addEventListener("click", async (e) => {
          e.preventDefault();

          const warehouseId = button.getAttribute("data-id");
          const currentStatus = button.getAttribute("data-status");

          // Shift action item into loading layout status
          button.disabled = true;
          button.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> Modifying...`;

          try {
            // Send modifications directly into the Cloudflare pipeline
            await Api.superadmin.toggleWarehouseStatus(
              warehouseId,
              currentStatus,
            );

            // Flash a clean operations success alert across the view anchor
            alertAnchor.innerHTML = `
            <div class="alert alert-success alert-dismissible fade show border-0 shadow-sm d-flex align-items-center" role="alert">
              <i class="bi bi-check-circle-fill me-2 fs-5"></i>
              <div>Tenant subscription map status was modernized successfully.</div>
              <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
          `;

            // Re-trigger core streaming execution to repaint rows cleanly
            await streamTenantRecords();
          } catch (error) {
            alertAnchor.innerHTML = `
            <div class="alert alert-danger alert-dismissible fade show border-0 shadow-sm d-flex align-items-center" role="alert">
              <i class="bi bi-exclamation-octagon-fill me-2 fs-5"></i>
              <div><strong>System Interception:</strong> ${error.message}</div>
              <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
          `;

            // Re-enable row action if failure occurs
            button.disabled = false;
            button.innerHTML = `<i class="bi bi-shield-exclamation me-1"></i> Try Again`;
          }
        });
      });
  }

  // Bind full view refresh tracking trigger
  refreshBtn.addEventListener("click", (e) => {
    e.preventDefault();
    alertAnchor.innerHTML = "";
    streamTenantRecords();
  });

  // Execute initial component data rendering
  await streamTenantRecords();
}

/**
 * Clean sanitization utility against malicious DOM mutations
 */
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
