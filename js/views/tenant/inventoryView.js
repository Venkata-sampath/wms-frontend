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

      <!-- Professional WMS Responsive Filter Toolbar -->
      <div class="card p-2 p-sm-3 shadow-sm mb-3 mb-md-4 bg-white border-0">
        <div class="d-flex flex-wrap align-items-center gap-2">
          
          <!-- Expanded Search Box (Largest Control) -->
          <div class="flex-grow-1" style="min-width: 250px;">
            <div class="input-group">
              <span class="input-group-text bg-light border-end-0"><i class="bi bi-search text-muted"></i></span>
              <input type="text" id="inventory-search" class="form-control border-start-0 ps-0" placeholder="Search by SKU, Description, Client, Location, UOM, User, Date, Shipment ID...">
            </div>
          </div>

          <!-- Dynamic Client Filter -->
          <select id="filter-client" class="form-select flex-shrink-0" style="width: 170px;">
            <option value="all">All Clients</option>
          </select>

          <!-- Dynamic Category Filter -->
          <select id="filter-category" class="form-select flex-shrink-0" style="width: 170px;">
            <option value="all">All Categories</option>
          </select>

          <!-- Dynamic Location Filter -->
          <select id="filter-location" class="form-select flex-shrink-0" style="width: 170px;">
            <option value="all">All Locations</option>
          </select>

          <!-- Dynamic Verified By Filter -->
          <select id="filter-verified-by" class="form-select flex-shrink-0" style="width: 170px;">
            <option value="all">All Verified By</option>
          </select>

          <!-- Dynamic Putaway By Filter -->
          <select id="filter-putaway-by" class="form-select flex-shrink-0" style="width: 170px;">
            <option value="all">All Putaway By</option>
          </select>

          <!-- Dynamic UOM Filter -->
          <select id="filter-uom" class="form-select flex-shrink-0" style="width: 170px;">
            <option value="all">All UOMs</option>
          </select>

          <!-- Stock Status Filter -->
          <select id="filter-status" class="form-select flex-shrink-0" style="width: 170px;">
            <option value="all">All Stock Status</option>
            <option value="in_stock">In Stock (> 0)</option>
            <option value="out_of_stock">Out of Stock (0)</option>
          </select>

          <!-- Shelf Life Filter -->
          <select id="filter-shelf-life" class="form-select flex-shrink-0" style="width: 170px;">
            <option value="all">All Shelf Life</option>
            <option value="expired">Expired</option>
            <option value="0_30">0–30 Days</option>
            <option value="31_90">31–90 Days</option>
            <option value="91_180">91–180 Days</option>
            <option value="180_plus">180+ Days</option>
          </select>

          <!-- Aging Filter -->
          <select id="filter-aging" class="form-select flex-shrink-0" style="width: 170px;">
            <option value="all">All Aging</option>
            <option value="0_30">0–30 Days</option>
            <option value="31_90">31–90 Days</option>
            <option value="91_180">91–180 Days</option>
            <option value="180_plus">180+ Days</option>
          </select>

          <!-- Sort Selector -->
          <select id="filter-sort" class="form-select flex-shrink-0" style="width: 180px;">
            <option value="default">Sort: Default</option>
            <option value="item_asc">Item Code (A → Z)</option>
            <option value="location_asc">Location (A → Z)</option>
            <option value="qty_desc">Quantity (High → Low)</option>
            <option value="qty_asc">Quantity (Low → High)</option>
            <option value="exp_asc">Expiry Date (Nearest First)</option>
            <option value="exp_desc">Expiry Date (Latest First)</option>
            <option value="newest">Newest Stock</option>
            <option value="oldest">Oldest Stock</option>
            <option value="shelflife">Shelf Life</option>
            <option value="aging">Aging</option>
          </select>

          <!-- Reset Button -->
          <button id="btn-reset-filters" class="btn btn-outline-secondary flex-shrink-0 ms-auto" type="button">
            <i class="bi bi-arrow-counterclockwise me-1"></i> Reset Filters
          </button>

        </div>
      </div>

      <div class="card shadow-sm border-0 bg-white">
        <div class="table-responsive" style="max-height: 600px; overflow-y: auto;">
          <table class="table table-hover align-middle mb-0" style="font-size: 0.9rem;">
            <thead class="table-light sticky-top" style="z-index: 10;" id="inventory-table-head">
              <tr>
                <th scope="col" class="ps-3">Item Code / SKU</th>
                <th scope="col">Description</th>
                <th scope="col" id="col-header-client-code">Client Code</th>
                <th scope="col">Location</th>
                <th scope="col" class="text-end">Qty</th>
                <th scope="col" class="text-center">UOM</th>
                <th scope="col" class="text-center">Category</th>
                <th scope="col">Mfg Date</th>
                <th scope="col">Expiry Date</th>
                <th scope="col">Verified By</th>
                <th scope="col">Putaway By</th>
                <th scope="col" class="text-center">Shelf Life (Days)</th>
                <th scope="col" class="text-center">Aging (Days)</th>
              </tr>
            </thead>
            <tbody id="inventory-table-body">
              <tr>
                <td colspan="13" class="text-center py-5">
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
      populateDropdownOptions(fullInventoryData);
      renderFilteredTable();
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="13" class="text-center text-danger py-4">
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

  function populateDropdownOptions(data) {
    // Populate Client
    const clientSelect = document.getElementById("filter-client");
    if (clientSelect) {
      const clientMap = new Map();
      data.forEach((item) => {
        if (item.client_id || item.client_code || item.client_name) {
          const id = item.client_id || item.client_code;
          if (!clientMap.has(id)) {
            clientMap.set(id, {
              id: id,
              name: item.client_name || item.client_code || "Unknown Client",
              code: item.client_code || "",
            });
          }
        }
      });
      const sortedClients = Array.from(clientMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      clientSelect.innerHTML =
        '<option value="all">All Clients</option>' +
        sortedClients
          .map(
            (c) =>
              `<option value="${c.id}">${c.name}${c.code ? ` (${c.code})` : ""}</option>`,
          )
          .join("");
    }

    // Helper for simple text selects
    const populateSelect = (selectId, defaultLabel, extractor) => {
      const select = document.getElementById(selectId);
      if (!select) return;
      const valuesSet = new Set();
      data.forEach((item) => {
        const val = extractor(item);
        if (val) valuesSet.add(String(val).trim());
      });
      const sorted = Array.from(valuesSet).sort((a, b) => a.localeCompare(b));
      select.innerHTML =
        `<option value="all">${defaultLabel}</option>` +
        sorted.map((v) => `<option value="${v}">${v}</option>`).join("");
    };

    populateSelect(
      "filter-category",
      "All Categories",
      (item) => item.category,
    );
    populateSelect(
      "filter-location",
      "All Locations",
      (item) => item.location_id,
    );
    populateSelect(
      "filter-verified-by",
      "All Verified By",
      (item) => item.verified_by,
    );
    populateSelect(
      "filter-putaway-by",
      "All Putaway By",
      (item) => item.putaway_by,
    );
    populateSelect("filter-uom", "All UOMs", (item) => item.uom);
  }

  function renderFilteredTable() {
    const query = document
      .getElementById("inventory-search")
      .value.toLowerCase()
      .trim();

    const clientFilter =
      document.getElementById("filter-client")?.value || "all";
    const categoryFilter =
      document.getElementById("filter-category")?.value || "all";
    const locationFilter =
      document.getElementById("filter-location")?.value || "all";
    const verifiedByFilter =
      document.getElementById("filter-verified-by")?.value || "all";
    const putawayByFilter =
      document.getElementById("filter-putaway-by")?.value || "all";
    const uomFilter = document.getElementById("filter-uom")?.value || "all";
    const statusFilter =
      document.getElementById("filter-status")?.value || "all";
    const shelfLifeFilter =
      document.getElementById("filter-shelf-life")?.value || "all";
    const agingFilter = document.getElementById("filter-aging")?.value || "all";
    const sortOption =
      document.getElementById("filter-sort")?.value || "default";

    const tbody = document.getElementById("inventory-table-body");
    const showClientCode = clientFilter === "all";
    const totalCols = showClientCode ? 13 : 12;

    // Update Header dynamic visibility for Client Code
    const thead = document.getElementById("inventory-table-head");
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th scope="col" class="ps-3">Item Code / SKU</th>
          <th scope="col">Description</th>
          ${showClientCode ? '<th scope="col">Client Code</th>' : ""}
          <th scope="col">Location</th>
          <th scope="col" class="text-end">Qty</th>
          <th scope="col" class="text-center">UOM</th>
          <th scope="col" class="text-center">Category</th>
          <th scope="col">Mfg Date</th>
          <th scope="col">Expiry Date</th>
          <th scope="col">Verified By</th>
          <th scope="col">Putaway By</th>
          <th scope="col" class="text-center">Shelf Life (Days)</th>
          <th scope="col" class="text-center">Aging (Days)</th>
        </tr>
      `;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Filtering
    const filtered = fullInventoryData.filter((item) => {
      // Calculate temporary days for filtering
      let daysRemaining = null;
      if (item.expiry_date) {
        const expDate = new Date(item.expiry_date);
        expDate.setHours(0, 0, 0, 0);
        daysRemaining = Math.ceil(
          (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
      }
      item._computedShelfLife = daysRemaining;

      let numericAging = null;
      if (item.created_at) {
        const createdDate = new Date(item.created_at);
        createdDate.setHours(0, 0, 0, 0);
        const daysOld = Math.floor(
          (today.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        numericAging = daysOld <= 0 ? 0 : daysOld;
      }
      item._computedAging = numericAging;

      // Search Query Validation across 12 business fields
      const searchFields = [
        item.item_code,
        item.item_description,
        item.client_code,
        item.client_name,
        item.location_id,
        item.category,
        item.uom,
        item.verified_by,
        item.putaway_by,
        item.manufacturing_date,
        item.expiry_date,
        item.shipment_line_item_id,
      ];
      const matchSearch =
        query === "" ||
        searchFields.some(
          (field) => field && String(field).toLowerCase().includes(query),
        );

      // Client
      const matchClient =
        clientFilter === "all" ||
        item.client_id === clientFilter ||
        item.client_code === clientFilter;

      // Category
      const matchCategory =
        categoryFilter === "all" ||
        (item.category || "").trim() === categoryFilter;

      // Location
      const matchLocation =
        locationFilter === "all" ||
        (item.location_id || "").trim() === locationFilter;

      // Verified By
      const matchVerifiedBy =
        verifiedByFilter === "all" ||
        (item.verified_by || "").trim() === verifiedByFilter;

      // Putaway By
      const matchPutawayBy =
        putawayByFilter === "all" ||
        (item.putaway_by || "").trim() === putawayByFilter;

      // UOM
      const matchUom =
        uomFilter === "all" || (item.uom || "").trim() === uomFilter;

      // Stock Status
      const qty = parseFloat(item.quantity || 0);
      let matchStatus = true;
      if (statusFilter === "in_stock") matchStatus = qty > 0;
      if (statusFilter === "out_of_stock") matchStatus = qty === 0;

      // Shelf Life Range
      let matchShelfLife = true;
      if (shelfLifeFilter !== "all") {
        if (daysRemaining === null) {
          matchShelfLife = false;
        } else if (shelfLifeFilter === "expired") {
          matchShelfLife = daysRemaining < 0;
        } else if (shelfLifeFilter === "0_30") {
          matchShelfLife = daysRemaining >= 0 && daysRemaining <= 30;
        } else if (shelfLifeFilter === "31_90") {
          matchShelfLife = daysRemaining >= 31 && daysRemaining <= 90;
        } else if (shelfLifeFilter === "91_180") {
          matchShelfLife = daysRemaining >= 91 && daysRemaining <= 180;
        } else if (shelfLifeFilter === "180_plus") {
          matchShelfLife = daysRemaining > 180;
        }
      }

      // Aging Range
      let matchAging = true;
      if (agingFilter !== "all") {
        if (numericAging === null) {
          matchAging = false;
        } else if (agingFilter === "0_30") {
          matchAging = numericAging >= 0 && numericAging <= 30;
        } else if (agingFilter === "31_90") {
          matchAging = numericAging >= 31 && numericAging <= 90;
        } else if (agingFilter === "91_180") {
          matchAging = numericAging >= 91 && numericAging <= 180;
        } else if (agingFilter === "180_plus") {
          matchAging = numericAging > 180;
        }
      }

      return (
        matchSearch &&
        matchClient &&
        matchCategory &&
        matchLocation &&
        matchVerifiedBy &&
        matchPutawayBy &&
        matchUom &&
        matchStatus &&
        matchShelfLife &&
        matchAging
      );
    });

    // 2. Frontend Sorting
    filtered.sort((a, b) => {
      switch (sortOption) {
        case "item_asc":
          return (a.item_code || "").localeCompare(b.item_code || "");
        case "location_asc":
          return (a.location_id || "").localeCompare(b.location_id || "");
        case "qty_desc":
          return parseFloat(b.quantity || 0) - parseFloat(a.quantity || 0);
        case "qty_asc":
          return parseFloat(a.quantity || 0) - parseFloat(b.quantity || 0);
        case "exp_asc":
          return (
            new Date(a.expiry_date || "9999-12-31") -
            new Date(b.expiry_date || "9999-12-31")
          );
        case "exp_desc":
          return (
            new Date(b.expiry_date || "1970-01-01") -
            new Date(a.expiry_date || "1970-01-01")
          );
        case "newest":
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        case "oldest":
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        case "shelflife": {
          const aDays = a._computedShelfLife ?? Infinity;
          const bDays = b._computedShelfLife ?? Infinity;
          return aDays - bDays;
        }
        case "aging": {
          const aAging = a._computedAging ?? -1;
          const bAging = b._computedAging ?? -1;
          return bAging - aAging;
        }
        default:
          return 0;
      }
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${totalCols}" class="text-center text-muted py-4">
            No matching batch records found matching the specified criteria.
          </td>
        </tr>
      `;
      return;
    }

    // 3. Render Table Content
    tbody.innerHTML = filtered
      .map((item) => {
        const qty = parseFloat(item.quantity || 0);

        // Dynamic Shelf Life Badge Display
        let shelfLifeDisplay = '<span class="text-muted">-</span>';
        if (item.expiry_date && item._computedShelfLife !== null) {
          const daysRemaining = item._computedShelfLife;
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

        // Dynamic Aging Badge Display
        let agingDisplay = '<span class="text-muted">-</span>';
        if (item.created_at && item._computedAging !== null) {
          const numericAging = item._computedAging;
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

        // Category Custom Styles Logic
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

        // Conditional Client Code Cell
        const clientCodeCell = showClientCode
          ? `<td><span class="badge bg-secondary font-monospace px-2 py-1">${item.client_code || "-"}</span></td>`
          : "";

        return `
        <tr>
          <td class="fw-bold text-primary">${item.item_code}</td>
          <td><div class="text-truncate" style="max-width: 180px;" title="${item.item_description || ""}">${item.item_description || '<span class="text-muted small">No description</span>'}</div></td>
          ${clientCodeCell}
          <td>
            <span class="badge bg-secondary font-monospace px-2 py-1">${item.location_id}</span>
          </td>
          <td class="text-end fw-bold">${qty.toLocaleString()}</td>
          <td class="text-center"><small class="text-uppercase text-muted fw-bold">${item.uom || ""}</small></td>
          <td class="text-center">${categoryDisplay}</td>
          <td><small class="text-dark">${item.manufacturing_date || "-"}</small></td>
          <td><small class="text-dark">${item.expiry_date || "-"}</small></td>
          <td><small class="fw-semibold text-secondary">${item.verified_by || '<span class="text-muted">-</span>'}</small></td>
          <td><small class="fw-semibold text-secondary">${item.putaway_by || '<span class="text-muted">-</span>'}</small></td>
          <td class="text-center">${shelfLifeDisplay}</td>
          <td class="text-center">${agingDisplay}</td>
        </tr>
      `;
      })
      .join("");
  }

  function resetAllFilters() {
    document.getElementById("inventory-search").value = "";
    document.getElementById("filter-client").value = "all";
    document.getElementById("filter-category").value = "all";
    document.getElementById("filter-location").value = "all";
    document.getElementById("filter-verified-by").value = "all";
    document.getElementById("filter-putaway-by").value = "all";
    document.getElementById("filter-uom").value = "all";
    document.getElementById("filter-status").value = "all";
    document.getElementById("filter-shelf-life").value = "all";
    document.getElementById("filter-aging").value = "all";
    document.getElementById("filter-sort").value = "default";
    renderFilteredTable();
  }

  const root = document.getElementById("inventory-root");

  // Event bindings
  root.querySelector("#refresh-inv-btn").onclick = () => loadInventory();
  root.querySelector("#btn-reset-filters").onclick = () => resetAllFilters();

  const filterIds = [
    "inventory-search",
    "filter-client",
    "filter-category",
    "filter-location",
    "filter-verified-by",
    "filter-putaway-by",
    "filter-uom",
    "filter-status",
    "filter-shelf-life",
    "filter-aging",
    "filter-sort",
  ];

  filterIds.forEach((id) => {
    const el = root.querySelector("#" + id);
    if (el) {
      el.addEventListener(
        el.tagName === "INPUT" ? "input" : "change",
        renderFilteredTable,
      );
    }
  });

  await loadInventory();
}
