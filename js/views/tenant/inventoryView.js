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
                <th scope="col" class="text-center">Category</th>
                <th scope="col">Mfg Date</th>
                <th scope="col">Expiry Date</th>
                <!-- MODIFIED: Appended New Columns -->
                <th scope="col">Verified By</th>
                <th scope="col">Putaway By</th>
                <th scope="col" class="text-center">Shelf Life (Days)</th>
                <th scope="col" class="text-center">Aging (Days)</th>
              </tr>
            </thead>
            <tbody id="inventory-table-body">
              <tr>
                <!-- MODIFIED: Bumped colspan to 12 -->
                <td colspan="12" class="text-center py-5">
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
      // MODIFIED: Bumped colspan to 12
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="text-center text-danger py-4">
            <i class="bi bi-exclamation-triangle-fill me-2"></i> Failed to retrieve inventory: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function computeSummaryMetrics(data) {
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
      // MODIFIED: Bumped colspan to 12
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="text-center text-muted py-4">
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

          let bg = "";
          let color = "";

          if (daysRemaining < 0) {
            bg = "#8b0000"; // Dark Red
            color = "#ffffff"; // White
          } else if (daysRemaining <= 30) {
            bg = "#f8d7da"; // Light Red
            color = "#842029"; // Dark Red
          } else if (daysRemaining <= 90) {
            bg = "#ffe8cc"; // Light Orange
            color = "#d9480f"; // Dark Orange
          } else if (daysRemaining <= 180) {
            bg = "#fef3c7"; // Light Yellow
            color = "#b45309"; // Dark Gold
          } else {
            bg = "#d1e7dd"; // Light Green
            color = "#0f5132"; // Dark Green
          }

          shelfLifeDisplay = `<span class="badge rounded-pill px-3 py-1 fw-bold" style="background-color: ${bg}; color: ${color}; border: none; display: inline-block;">${daysRemaining}</span>`;
        }

        // 2. Calculate Dynamic Aging (Current Date -> Created At)
        let agingDisplay = '<span class="text-muted">-</span>';
        if (item.created_at) {
          const createdDate = new Date(item.created_at);
          createdDate.setHours(0, 0, 0, 0);
          const timeDiff = today.getTime() - createdDate.getTime();
          const daysOld = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
          const numericAging = daysOld <= 0 ? 0 : daysOld;

          let bg = "";
          let color = "";

          if (numericAging <= 30) {
            bg = "#e7f1ff"; // Very Light Blue
            color = "#0a58ca"; // Dark Blue
          } else if (numericAging <= 90) {
            bg = "#cff4fc"; // Light Cyan
            color = "#087990"; // Dark Cyan
          } else if (numericAging <= 180) {
            bg = "#e0dbff"; // Light Indigo
            color = "#4f46e5"; // Indigo
          } else {
            bg = "#f3e5f5"; // Light Purple
            color = "#4a148c"; // Dark Purple
          }

          agingDisplay = `<span class="badge rounded-pill px-3 py-1 fw-bold" style="background-color: ${bg}; color: ${color}; border: none; display: inline-block;">${numericAging}</span>`;
        }

        // 3. Category Custom Styles Logic
        const categoryVal = item.category || "-";
        const categoryLower = categoryVal.toLowerCase().trim();
        let catBg = "#e2e8f0"; // Neutral Light Gray
        let catColor = "#475569"; // Neutral Dark Gray Text

        if (categoryLower === "ambient") {
          catBg = "#f5ebe0"; // Light Beige / Sand
          catColor = "#4e342e"; // Dark Brown
        } else if (categoryLower === "chiller") {
          catBg = "#cfe2ff"; // Light Blue
          catColor = "#084298"; // Dark Blue
        } else if (categoryLower === "frozen") {
          catBg = "#e0f7fa"; // Light Cyan / Ice Blue
          catColor = "#006064"; // Dark Teal
        }

        const categoryDisplay = `<span class="badge rounded-pill px-3 py-1 text-capitalize fw-bold" style="background-color: ${catBg}; color: ${catColor}; border: none; display: inline-block;">${categoryVal}</span>`;

        return `
        <tr>
          <td class="fw-bold text-primary">${item.item_code}</td>
          <td><div class="text-truncate" style="max-width: 180px;" title="${item.item_description || ""}">${item.item_description || '<span class="text-muted small">No description</span>'}</div></td>
          <td>
            <span class="badge bg-secondary font-monospace px-2 py-1">${item.location_id}</span>
          </td>
          <td class="text-end fw-bold">${qty.toLocaleString()}</td>
          <td class="text-center"><small class="text-uppercase text-muted fw-bold">${item.uom || ""}</small></td>
          <td class="text-center">${categoryDisplay}</td>
          <td><small class="text-dark">${item.manufacturing_date || "-"}</small></td>
          <td><small class="text-dark">${item.expiry_date || "-"}</small></td>
          <!-- MODIFIED: Injected Verified By and Putaway By Data elements -->
          <td><small class="fw-semibold text-secondary">${item.verified_by || '<span class="text-muted">-</span>'}</small></td>
          <td><small class="fw-semibold text-secondary">${item.putaway_by || '<span class="text-muted">-</span>'}</small></td>
          <td class="text-center">${shelfLifeDisplay}</td>
          <td class="text-center">${agingDisplay}</td>
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
