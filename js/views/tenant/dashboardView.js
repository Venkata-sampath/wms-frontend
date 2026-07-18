import { Api } from "../../api.js";

/**
 * Renders the initial landing Dashboard viewport workspace area for Tenant users.
 * @param {HTMLElement} container - The target injection workspace viewport canvas frame
 * @param {Object} user - The active authenticated user session profile metadata
 */
export async function render(container, user) {
  // Format role string for cleaner representation
  const friendlyRole = user.role.replace("_", " ");

  container.innerHTML = `
    <div class="container-fluid p-2 p-sm-3 p-md-4 animate-fade-in">
      
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 mb-md-4 pb-2 border-bottom">
        <div class="mb-2 mb-md-0">
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-md-3">
            <i class="bi bi-speedometer2 text-primary me-2"></i>Operational Workspace Control Panel
          </h3>
          <p class="text-muted small mb-0">
            Welcome back, <strong class="text-dark">${user.username}</strong> (${friendlyRole}). Manage your warehouse operations below.
          </p>
        </div>
        <div class="text-muted small mt-2 mt-md-0">
          <i class="bi bi-clock-history me-1"></i> System Status: <span class="badge bg-success shadow-sm">Operational</span>
        </div>
      </div>

      <div class="row g-2 g-md-3 mb-3 mb-md-4">
        
        <div class="col-12 col-sm-6 col-md-3">
          <div class="card border-0 shadow-sm rounded-3 h-100">
            <div class="card-body p-2 p-sm-3 d-flex align-items-center">
              <div class="bg-primary bg-opacity-10 text-primary rounded-3 p-2 p-sm-3 me-2 me-sm-3">
                <i class="bi bi-boxes fs-4 fs-sm-3"></i>
              </div>
              <div>
                <span class="text-muted text-uppercase extra-small fw-bold tracking-wider" style="font-size:0.7rem;">Live Stock Items</span>
                <h4 class="fw-bold text-dark mb-0 mt-1 fs-5 fs-sm-4" id="stat-stock-items">
                  <span class="spinner-border spinner-border-sm text-primary" role="status"></span>
                </h4>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-sm-6 col-md-3">
          <div class="card border-0 shadow-sm rounded-3 h-100">
            <div class="card-body p-2 p-sm-3 d-flex align-items-center">
              <div class="bg-warning bg-opacity-10 text-warning rounded-3 p-2 p-sm-3 me-2 me-sm-3">
                <i class="bi bi-truck-flatbed fs-4 fs-sm-3"></i>
              </div>
              <div>
                <span class="text-muted text-uppercase extra-small fw-bold tracking-wider" style="font-size:0.7rem;">Inbound Dock Tasks</span>
                <h4 class="fw-bold text-dark mb-0 mt-1 fs-5 fs-sm-4" id="stat-inbound-tasks">
                  <span class="spinner-border spinner-border-sm text-warning" role="status"></span>
                </h4>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-sm-6 col-md-3">
          <div class="card border-0 shadow-sm rounded-3 h-100">
            <div class="card-body p-2 p-sm-3 d-flex align-items-center">
              <div class="bg-info bg-opacity-10 text-info rounded-3 p-2 p-sm-3 me-2 me-sm-3">
                <i class="bi bi-arrow-down-left-square fs-4 fs-sm-3"></i>
              </div>
              <div>
                <span class="text-muted text-uppercase extra-small fw-bold tracking-wider" style="font-size:0.7rem;">Pending Putaway</span>
                <h4 class="fw-bold text-dark mb-0 mt-1 fs-5 fs-sm-4" id="stat-pending-putaway">
                  <span class="spinner-border spinner-border-sm text-info" role="status"></span>
                </h4>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-sm-6 col-md-3">
          <div class="card border-0 shadow-sm rounded-3 h-100">
            <div class="card-body p-2 p-sm-3 d-flex align-items-center">
              <div class="bg-success bg-opacity-10 text-success rounded-3 p-2 p-sm-3 me-2 me-sm-3">
                <i class="bi bi-grid-3x3-gap fs-4 fs-sm-3"></i>
              </div>
              <div>
                <span class="text-muted text-uppercase extra-small fw-bold tracking-wider" style="font-size:0.7rem;">Allocated Zones</span>
                <h4 class="fw-bold text-dark mb-0 mt-1 fs-5 fs-sm-4" id="stat-allocated-zones">
                  <span class="spinner-border spinner-border-sm text-success" role="status"></span>
                </h4>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div class="card border-dashed bg-white shadow-sm rounded-3 border-light py-4 py-md-5 text-center">
        <div class="card-body py-3 py-md-4">
          <i class="bi bi-layers text-muted display-4 mb-3 d-block"></i>
          <h4 class="fw-bold text-secondary fs-5 fs-md-4">Ecosystem Interface Modules Ready</h4>
          <p class="text-muted mx-auto small mb-4 px-2" style="max-width: 500px;">
            The central layout shell framework and navigation routes have loaded successfully. Use the left-hand sidebar menu options to transition between workspace operations.
          </p>
        </div>
      </div>

    </div>
  `;

  loadDashboardStats();
}

/**
 * Fetches the four summary metrics in parallel. Each card fails independently
 * (showing "—" with a tooltip) so one bad endpoint doesn't blank the whole panel.
 */
async function loadDashboardStats() {
  const [inventoryResult, inboundResult, putawayResult, locationsResult] =
    await Promise.allSettled([
      Api.inventory.getSnapshot(),
      Api.shipments.listPending(),
      Api.putaway.getPending(),
      Api.locations.list(),
    ]);

  setStat("stat-stock-items", inventoryResult, (data) => {
    const rows = data.inventory || [];
    const distinctSkus = new Set(rows.map((r) => r.item_code)).size;
    return distinctSkus.toLocaleString();
  });

  setStat("stat-inbound-tasks", inboundResult, (data) => {
    const shipments = Array.isArray(data) ? data : [];
    return shipments.length.toLocaleString();
  });

  setStat("stat-pending-putaway", putawayResult, (data) => {
    const tasks = data.tasks || [];
    return tasks.length.toLocaleString();
  });

  setStat("stat-allocated-zones", locationsResult, (data) => {
    const locations = data.locations || [];
    const occupied = locations.filter(
      (l) => l.calculated_status === "Occupied",
    ).length;
    return `${occupied} <span class="fs-6 text-muted fw-normal">/ ${locations.length}</span>`;
  });
}

function setStat(elementId, settledResult, formatter) {
  const el = document.getElementById(elementId);
  if (!el) return; // view may have been torn down before the fetch resolved

  if (settledResult.status === "fulfilled") {
    try {
      el.innerHTML = formatter(settledResult.value);
    } catch (err) {
      el.innerHTML = `<span class="text-muted fs-6">—</span>`;
    }
  } else {
    el.innerHTML = `<span class="text-danger fs-6" title="${escapeAttr(settledResult.reason?.message || "Failed to load")}">—</span>`;
  }
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
