import { Api } from "../../api.js";

export async function render(container, user) {
  container.innerHTML = `
    <div class="container-fluid p-2 p-sm-3 p-md-4" id="inventory-root">
      <div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 mb-3 mb-md-4">
        <div>
          <h3 class="fw-bold mb-1 fs-4 fs-md-3">Real-Time Inventory Snapshot</h3>
          <p class="text-muted mb-0 small">Live stock balances and location mappings across the warehouse ecosystem.</p>
        </div>
        <button id="refresh-inv-btn" class="btn btn-outline-primary shadow-sm align-self-start align-self-sm-center">
          <i class="bi bi-arrow-clockwise me-1"></i> Refresh Stock
        </button>
      </div>

      <div class="row g-2 g-md-3 mb-3 mb-md-4">
        <div class="col-md-4">
          <div class="card p-2 p-sm-3 shadow-sm border-start border-primary border-4">
            <small class="text-uppercase fw-bold text-muted" style="font-size:0.75rem;">Total SKUs Tracked</small>
            <h3 class="fw-bold text-primary mt-1 mb-0 fs-4 fs-md-3" id="metric-total-skus">0</h3>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card p-2 p-sm-3 shadow-sm border-start border-success border-4">
            <small class="text-uppercase fw-bold text-muted" style="font-size:0.75rem;">Total Units On Hand</small>
            <h3 class="fw-bold text-success mt-1 mb-0 fs-4 fs-md-3" id="metric-total-units">0</h3>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card p-2 p-sm-3 shadow-sm border-start border-warning border-4">
            <small class="text-uppercase fw-bold text-muted" style="font-size:0.75rem;">Active Locations</small>
            <h3 class="fw-bold text-warning mt-1 mb-0 fs-4 fs-md-3" id="metric-total-locations">0</h3>
          </div>
        </div>
      </div>

      <div class="card p-2 p-sm-3 shadow-sm mb-3 mb-md-4 bg-white">
        <div class="row g-2">
          <div class="col-md-8">
            <div class="input-group">
              <span class="input-group-text bg-light border-end-0"><i class="bi bi-search text-muted"></i></span>
              <input type="text" id="inventory-search" class="form-control border-start-0 ps-0" placeholder="Search by SKU, Item Description, or Location ID...">
            </div>
          </div>
          <div class="col-md-4">
            <select id="inventory-filter-status" class="form-select">
              <option value="all">All Items</option>
              <option value="in_stock">In Stock (> 0)</option>
              <option value="out_of_stock">Out of Stock (0)</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card shadow-sm border-0 bg-white">
        <div class="table-responsive" style="max-height: 600px; overflow-y: auto;">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light sticky-top" style="z-index: 10;">
              <tr>
                <th scope="col" class="ps-3">Item Code / SKU</th>
                <th scope="col">Description</th>
                <th scope="col">Location ID</th>
                <th scope="col">Expiry Date</th>
                <th scope="col" class="text-end">Quantity On Hand</th>
                <th scope="col" class="text-center">UOM</th>
                <th scope="col" class="pe-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody id="inventory-table-body">
              <tr>
                <td colspan="7" class="text-center py-5">
                  <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                  Querying real-time ledger balances...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  let fullInventoryData = [];

  // Data Fetching Function
  async function loadInventory() {
    const tbody = document.getElementById("inventory-table-body");
    try {
      // Fetch dynamic balance snapshot from API module
      const response = await Api.inventory.getSnapshot();
      fullInventoryData = response.inventory || [];

      // Compute Top Summary Metrics
      computeSummaryMetrics(fullInventoryData);

      // Render Table Data
      renderFilteredTable();
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-danger py-4">
            <i class="bi bi-exclamation-triangle-fill me-2"></i> Failed to retrieve inventory: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  // Dynamic Summary Computations
  function computeSummaryMetrics(data) {
    const uniqueSkus = new Set(data.map((item) => item.item_code)).size;
    const totalUnits = data.reduce(
      (acc, item) => acc + parseFloat(item.quantity || 0),
      0,
    );
    const occupiedLocations = new Set(
      data.map((item) => item.location_id).filter((loc) => loc),
    ).size;

    document.getElementById("metric-total-skus").innerText = uniqueSkus;
    document.getElementById("metric-total-units").innerText =
      totalUnits.toLocaleString();
    document.getElementById("metric-total-locations").innerText =
      occupiedLocations;
  }

  // Live Filter & Draw Table Component Logic
  function renderFilteredTable() {
    const query = document
      .getElementById("inventory-search")
      .value.toLowerCase()
      .trim();
    const statusFilter = document.getElementById(
      "inventory-filter-status",
    ).value;
    const tbody = document.getElementById("inventory-table-body");

    const filtered = fullInventoryData.filter((item) => {
      const matchSearch =
        (item.item_code || "").toLowerCase().includes(query) ||
        (item.item_description || "").toLowerCase().includes(query) ||
        (item.location_id || "").toLowerCase().includes(query);

      const qty = parseFloat(item.quantity || 0);
      let matchStatus = true;
      if (statusFilter === "in_stock") matchStatus = qty > 0;
      if (statusFilter === "out_of_stock") matchStatus = qty === 0;

      return matchSearch && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted py-4">
            No matching inventory allocations found matching specified criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered
      .map((item) => {
        const qty = parseFloat(item.quantity || 0);
        const isOutOfStock = qty === 0;

        return `
        <tr class="${isOutOfStock ? "table-light text-muted" : ""}">
          <td class="fw-bold ps-3 text-primary">${item.item_code}</td>
          <td>${item.item_description || '<span class="text-muted small">No description available</span>'}</td>
          <td>
            <span class="badge bg-secondary font-monospace px-2 py-1">${item.location_id || "STAGING_AREA"}</span>
          </td>
          <td>${item.expiry_date ? `<span class="small text-dark">${item.expiry_date}</span>` : '<span class="text-muted small">No expiry</span>'}</td>
          <td class="text-end fw-bold ${qty > 0 ? "text-dark" : "text-danger"}">${qty.toLocaleString()}</td>
          <td class="text-center"><small class="text-uppercase text-muted fw-bold">${item.uom || "PCS"}</small></td>
          <td class="text-center pe-3">
            <span class="badge ${qty > 0 ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"} rounded-pill px-2">
              ${qty > 0 ? "In Stock" : "Stockout"}
            </span>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  // Wire Interactions using Event Listeners safely
  const root = document.getElementById("inventory-root");
  root.querySelector("#refresh-inv-btn").onclick = () => loadInventory();
  root.querySelector("#inventory-search").oninput = () => renderFilteredTable();
  root.querySelector("#inventory-filter-status").onchange = () =>
    renderFilteredTable();

  // Initial runtime load invocation
  await loadInventory();
}
