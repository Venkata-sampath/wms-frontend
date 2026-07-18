import { Api } from "../../api.js";

export async function render(container, user) {
  container.innerHTML = `
    <div class="container-fluid p-2 p-sm-3 p-md-4" id="inventory-root">
      <div class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 mb-3 mb-md-4">
        <div>
          <h3 class="fw-bold mb-1 fs-4 fs-md-3">Real-Time Inventory Snapshot</h3>
          <p class="text-muted mb-0 small">Granular batch level tracking and location mappings across the warehouse ecosystem.</p>
        </div>
        <button id="refresh-inv-btn" class="btn btn-outline-primary shadow-sm align-self-start align-self-sm-center">
          <i class="bi bi-arrow-clockwise me-1"></i> Refresh Stock
        </button>
      </div>

      <div class="row g-2 g-md-3 mb-3 mb-md-4">
        <div class="col-md-4">
          <div class="card p-2 p-sm-3 shadow-sm border-start border-primary border-4">
            <small class="text-uppercase fw-bold text-muted" style="font-size:0.75rem;">Total Batches Tracked</small>
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
              <input type="text" id="inventory-search" class="form-control border-start-0 ps-0" placeholder="Search by SKU, Description, Location, or Shipment ID...">
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
          <table class="table table-hover align-middle mb-0" style="font-size: 0.9rem;">
            <thead class="table-light sticky-top" style="z-index: 10;">
              <tr>
                <th scope="col" class="ps-3">Item Code / SKU</th>
                <th scope="col">Description</th>
                <th scope="col">Location</th>
                <th scope="col" class="text-end">Qty</th>
                <th scope="col" class="text-center">UOM</th>
                <th scope="col">Category</th>
                <th scope="col">Mfg Date</th>
                <th scope="col">Expiry Date</th>
                <th scope="col">Shelf Life</th>
                <th scope="col">Aging</th>
                <th scope="col" class="pe-3">Traceability ID</th>
              </tr>
            </thead>
            <tbody id="inventory-table-body">
              <tr>
                <td colspan="11" class="text-center py-5">
                  <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                  Querying real-time trace ledgers...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  let fullInventoryData = [];

  async function loadInventory() {
    const tbody = document.getElementById("inventory-table-body");
    try {
      const response = await Api.inventory.getSnapshot();
      fullInventoryData = response.inventory || [];
      computeSummaryMetrics(fullInventoryData);
      renderFilteredTable();
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="text-center text-danger py-4">
            <i class="bi bi-exclamation-triangle-fill me-2"></i> Failed to retrieve inventory: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function computeSummaryMetrics(data) {
    // Metrics now look at discrete physical batch rows
    const totalBatches = data.length;
    const totalUnits = data.reduce(
      (acc, item) => acc + parseFloat(item.quantity || 0),
      0,
    );
    const occupiedLocations = new Set(
      data.map((item) => item.location_id).filter(Boolean),
    ).size;

    document.getElementById("metric-total-skus").innerText = totalBatches;
    document.getElementById("metric-total-units").innerText =
      totalUnits.toLocaleString();
    document.getElementById("metric-total-locations").innerText =
      occupiedLocations;
  }

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
        (item.location_id || "").toLowerCase().includes(query) ||
        (item.shipment_line_item_id || "").toLowerCase().includes(query);

      const qty = parseFloat(item.quantity || 0);
      let matchStatus = true;
      if (statusFilter === "in_stock") matchStatus = qty > 0;
      if (statusFilter === "out_of_stock") matchStatus = qty === 0;

      return matchSearch && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="text-center text-muted py-4">
            No matching batch records found matching the specified criteria.
          </td>
        </tr>
      `;
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tbody.innerHTML = filtered
      .map((item) => {
        const qty = parseFloat(item.quantity || 0);

        // 1. Calculate Dynamic Shelf Life (Current Date -> Expiry Date)
        let shelfLifeDisplay = '<span class="text-muted">-</span>';
        if (item.expiry_date) {
          const expDate = new Date(item.expiry_date);
          expDate.setHours(0, 0, 0, 0);
          const timeDiff = expDate.getTime() - today.getTime();
          const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

          if (daysRemaining < 0) {
            shelfLifeDisplay = `<span class="text-danger fw-bold">Expired (${Math.abs(daysRemaining)} Days ago)</span>`;
          } else {
            shelfLifeDisplay = `<span class="text-dark fw-medium">${daysRemaining} Days</span>`;
          }
        }

        // 2. Calculate Dynamic Aging (Current Date -> Created At)
        let agingDisplay = '<span class="text-muted">-</span>';
        if (item.created_at) {
          const createdDate = new Date(item.created_at);
          createdDate.setHours(0, 0, 0, 0);
          const timeDiff = today.getTime() - createdDate.getTime();
          const daysOld = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
          agingDisplay = `<span class="text-dark">${daysOld <= 0 ? "Today" : daysOld + " Days"}</span>`;
        }

        return `
        <tr>
          <td class="fw-bold text-primary">${item.item_code}</td>
          <td><div class="text-truncate" style="max-width: 180px;" title="${item.item_description || ""}">${item.item_description || '<span class="text-muted small">No description</span>'}</div></td>
          <td>
            <span class="badge bg-secondary font-monospace px-2 py-1">${item.location_id}</span>
          </td>
          <td class="text-end fw-bold">${qty.toLocaleString()}</td>
          
          <!-- Removed default fallback string value loop constraints -->
          <td class="text-center"><small class="text-uppercase text-muted fw-bold">${item.uom || ""}</small></td>
          
          <td><span class="badge bg-light text-dark text-capitalize border">${item.category || "-"}</span></td>
          <td><small class="text-dark">${item.manufacturing_date || "-"}</small></td>
          <td><small class="text-dark">${item.expiry_date || "-"}</small></td>
          <td><small>${shelfLifeDisplay}</small></td>
          <td><small>${agingDisplay}</small></td>
          <td>
            <span class="text-muted font-monospace small" style="font-size: 0.75rem;" title="${item.shipment_line_item_id}">
              ...${(item.shipment_line_item_id || "").slice(-12)}
            </span>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  const root = document.getElementById("inventory-root");
  root.querySelector("#refresh-inv-btn").onclick = () => loadInventory();
  root.querySelector("#inventory-search").oninput = () => renderFilteredTable();
  root.querySelector("#inventory-filter-status").onchange = () =>
    renderFilteredTable();

  await loadInventory();
}
