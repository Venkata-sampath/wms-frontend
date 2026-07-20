import { Api } from "../../api.js";

/**
 * Renders and wires up the Ledger Transaction Register snapshot module.
 * @param {HTMLElement} container - The target injection workspace viewport canvas frame
 * @param {Object} user - The active authenticated user session profile metadata
 */
export async function render(container, user) {
  container.innerHTML = `
    <div class="container-fluid p-2 p-sm-4 animate-fade-in" id="ledger-root">
      
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 mb-md-4 pb-2 border-bottom">
        <div class="mb-2 mb-md-0">
          <h4 class="fw-bold text-dark mb-1">
            <i class="bi bi-journal-text text-primary me-2"></i>Transaction Register
          </h4>
          <p class="text-muted small mb-0">One row per business transaction — inbound shipments, and (soon) outbound, transfers, and adjustments.</p>
        </div>
        <div>
          <button id="refresh-ledger-btn" class="btn btn-sm btn-outline-primary shadow-sm px-3 w-100 w-md-auto" type="button">
            <i class="bi bi-arrow-clockwise me-1"></i> Refresh
          </button>
        </div>
      </div>

      <div class="row g-2 g-md-3 mb-3 mb-md-4">
        <div class="col-12 col-sm-6 col-md-4">
          <div class="card p-2.5 p-sm-3 shadow-sm border-start border-primary border-4 rounded-3 h-100 bg-white border-0">
            <small class="text-uppercase fw-bold text-muted d-block text-truncate" style="font-size:0.68rem; letter-spacing:0.5px;">Total Transactions</small>
            <h4 class="fw-bold text-primary mt-1 mb-0" id="metric-total-tx">0</h4>
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-4">
          <div class="card p-2.5 p-sm-3 shadow-sm border-start border-warning border-4 rounded-3 h-100 bg-white border-0">
            <small class="text-uppercase fw-bold text-muted d-block text-truncate" style="font-size:0.68rem; letter-spacing:0.5px;">Pending Putaway</small>
            <h4 class="fw-bold text-warning mt-1 mb-0" id="metric-pending-tx">0</h4>
          </div>
        </div>
        <div class="col-12 col-sm-12 col-md-4">
          <div class="card p-2.5 p-sm-3 shadow-sm border-start border-success border-4 rounded-3 h-100 bg-white border-0">
            <small class="text-uppercase fw-bold text-muted d-block text-truncate" style="font-size:0.68rem; letter-spacing:0.5px;">Completed Balance</small>
            <h4 class="fw-bold text-success mt-1 mb-0" id="metric-completed-tx">0</h4>
          </div>
        </div>
      </div>

      <div class="card p-2 p-sm-3 shadow-sm mb-3 mb-md-4 border-0 bg-white rounded-3">
        <div class="row g-2">
          <div class="col-12 col-md-8">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-search"></i></span>
              <input type="text" id="ledger-search" class="form-control border-start-0 ps-0" style="font-size:0.8rem;" placeholder="Search by Shipment ID, Client Code, Invoice, or Verifier...">
            </div>
          </div>
          <div class="col-12 col-md-4">
            <select id="ledger-filter-type" class="form-select form-select-sm text-secondary fw-medium" style="font-size:0.8rem;">
              <option value="all">All Transaction Types</option>
              <option value="inbound">Inbound Ledger</option>
              <option value="outbound">Outbound Execution</option>
              <option value="transfer">Zone Transfer</option>
              <option value="adjustment">Stock Adjustment</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card shadow-sm border-0 bg-white rounded-3 overflow-hidden">
        <div class="table-responsive" style="max-height: 560px; overflow-y: auto;">
          <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top small text-uppercase text-secondary" style="z-index: 10; font-size: 0.7rem; letter-spacing: 0.3px;">
              <tr>
                <th scope="col" class="ps-3" style="min-width: 120px;">Shipment ID</th>
                <th scope="col" style="min-width: 110px;">Client Code</th>
                <th scope="col" style="min-width: 90px;">Type</th>
                <th scope="col" style="min-width: 140px;">Status</th>
                <th scope="col" style="min-width: 125px;">Invoice Number</th>
                <th scope="col" style="min-width: 120px;">Verified By</th>
                <th scope="col" style="min-width: 145px;">Created At</th>
                <th scope="col" class="pe-3" style="min-width: 145px;">Completed At</th>
              </tr>
            </thead>
            <tbody id="ledger-table-body">
              <tr>
                <td colspan="8" class="text-center py-5 text-muted small">
                  <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                  <div>Loading transaction register tracking matrix...</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="modal fade" id="transaction-detail-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable modal-fullscreen-lg-down">
        <div class="modal-content border-0 shadow-lg rounded-3">
          <div class="modal-header py-2.5 bg-light border-bottom">
            <h5 class="modal-title fw-bold text-dark" id="transaction-detail-title" style="font-size: 0.95rem;">
              <i class="bi bi-receipt text-primary me-2"></i>Transaction Detail
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-2 p-sm-3 bg-light bg-opacity-25" id="transaction-detail-body">
            <div class="text-center py-5 text-muted small">
              <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
              <div>Retrieving shipment manifest ledger profiles...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  let fullLedgerData = [];
  let detailModalInstance = null;

  function getModal() {
    if (!detailModalInstance) {
      const el = document.getElementById("transaction-detail-modal");
      detailModalInstance = new bootstrap.Modal(el);
    }
    return detailModalInstance;
  }

  async function loadLedger() {
    const tbody = document.getElementById("ledger-table-body");
    try {
      const response = await Api.transactions.list();
      fullLedgerData = response.transactions || [];

      computeSummaryMetrics(fullLedgerData);
      renderFilteredTable();
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-danger py-4 small fw-semibold">
            <i class="bi bi-exclamation-octagon-fill me-2 fs-6"></i>Failed to retrieve ledger data columns: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function computeSummaryMetrics(data) {
    document.getElementById("metric-total-tx").innerText =
      data.length.toLocaleString();

    const pending = data.filter(
      (row) => row.status === "pending_putaway",
    ).length;
    const completed = data.filter((row) => row.status === "completed").length;

    document.getElementById("metric-pending-tx").innerText =
      pending.toLocaleString();
    document.getElementById("metric-completed-tx").innerText =
      completed.toLocaleString();
  }

  function statusBadge(status) {
    const norm = (status || "").toLowerCase();
    if (norm === "completed")
      return `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 rounded" style="font-size:0.65rem;">COMPLETED</span>`;
    if (norm === "pending_putaway")
      return `<span class="badge bg-warning-subtle text-warning border border-warning-subtle px-2 py-1 rounded" style="font-size:0.65rem;">PENDING PUTAWAY</span>`;
    return `<span class="badge bg-secondary text-white px-2 py-1 rounded" style="font-size:0.65rem;">${(status || "").toUpperCase()}</span>`;
  }

  function typeBadge(type) {
    const norm = (type || "").toLowerCase();
    if (norm === "inbound")
      return `<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 rounded" style="font-size:0.65rem;">INBOUND</span>`;
    if (norm === "outbound")
      return `<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1 rounded" style="font-size:0.65rem;">OUTBOUND</span>`;
    return `<span class="badge bg-secondary text-white px-2 py-1 rounded" style="font-size:0.65rem;">${(type || "").toUpperCase()}</span>`;
  }

  function renderFilteredTable() {
    const query = document
      .getElementById("ledger-search")
      .value.toLowerCase()
      .trim();
    const typeFilter = document.getElementById("ledger-filter-type").value;
    const tbody = document.getElementById("ledger-table-body");

    const filtered = fullLedgerData.filter((row) => {
      const matchSearch =
        (row.entity_id || "").toLowerCase().includes(query) ||
        (row.client_code || "").toLowerCase().includes(query) ||
        (row.invoice_number || "").toLowerCase().includes(query) ||
        (row.verified_by || "").toLowerCase().includes(query);

      const matchType =
        typeFilter === "all" || row.transaction_type === typeFilter;
      return matchSearch && matchType;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-4 small">
            No transaction records found matching the specified criteria parameters.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered
      .map((row) => {
        const createdStr = formatTimestamp(row.created_at);
        const completedStr = formatTimestamp(row.completed_at);

        return `
        <tr class="ledger-row" style="cursor: pointer;" data-transaction-id="${row.transaction_id}">
          <td class="ps-3"><small class="font-monospace text-dark fw-semibold">${escapeHtml(row.entity_id || "—")}</small></td>
          <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(row.client_code || "—")}</span></td>
          <td>${typeBadge(row.transaction_type)}</td>
          <td>${statusBadge(row.status)}</td>
          <td class="fw-bold text-primary">${escapeHtml(row.invoice_number || "—")}</td>
          <td><span class="small text-dark"><i class="bi bi-person me-1 text-muted"></i>${escapeHtml(row.verified_by || "System")}</span></td>
          <td class="text-muted small" style="font-size:0.75rem;">${createdStr}</td>
          <td class="pe-3 text-muted small" style="font-size:0.75rem;">${completedStr}</td>
        </tr>
      `;
      })
      .join("");

    tbody.querySelectorAll(".ledger-row").forEach((tr) => {
      tr.addEventListener("click", () =>
        openTransactionDetail(tr.dataset.transactionId),
      );
    });
  }

  async function openTransactionDetail(transactionId) {
    const modal = getModal();
    const titleEl = document.getElementById("transaction-detail-title");
    const bodyEl = document.getElementById("transaction-detail-body");

    titleEl.innerHTML = `<i class="bi bi-receipt text-primary me-2"></i>Transaction Framework Reference ID: <span class="font-monospace text-secondary" style="font-size:0.85rem;">${transactionId}</span>`;
    bodyEl.innerHTML = `
      <div class="text-center py-5 text-muted small">
        <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
        <div>Loading extended itemization audits...</div>
      </div>
    `;
    modal.show();

    try {
      const detail = await Api.transactions.getDetails(transactionId);
      bodyEl.innerHTML = renderInboundDetail(detail);
    } catch (err) {
      bodyEl.innerHTML = `
        <div class="text-center text-danger py-4 small fw-semibold">
          <i class="bi bi-exclamation-triangle-fill me-2 fs-6"></i>Failed to load transaction detail: ${err.message}
        </div>
      `;
    }
  }

  function fmt(val) {
    if (val === null || val === undefined || val === "") return "—";
    const num = Number(val);
    if (Number.isNaN(num)) return String(val);
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function txt(val) {
    return val === null || val === undefined || val === "" ? "—" : val;
  }

  function infoField(label, value, colClass = "col-6 col-sm-4 col-md-3") {
    return `
      <div class="${colClass} mb-1.5">
        <small class="text-uppercase fw-bold text-muted d-block mb-0.5" style="font-size:0.68rem; letter-spacing:0.3px;">${label}</small>
        <span class="text-dark fw-medium" style="font-size:0.82rem;">${value}</span>
      </div>
    `;
  }

  function partyCard(label, party) {
    if (!party || Object.keys(party).length === 0) return "";

    const legalName = party.legal_name || party.LEGAL_NAME;
    const gstin = party.gstin || party.GSTIN;
    const pan = party.pan || party.PAN;
    const msme = party.msme || party.MSME;
    const address =
      party.physical_address || party.PHYSICAL_ADDRESS || party.address;

    const rows = [
      ["Legal Name", legalName],
      ["GSTIN", gstin],
      ["PAN", pan],
      ["MSME", msme],
      ["Address", address],
    ].filter(
      ([, v]) => v !== null && v !== undefined && String(v).trim() !== "",
    );

    if (rows.length === 0) return "";

    return `
    <div class="col-12 col-sm-6 col-md-4 mb-2">
      <div class="card h-100 border-0 shadow-sm rounded-3 overflow-hidden">
        <div class="card-header bg-white fw-bold text-primary small text-uppercase py-2" style="font-size:0.68rem;">
          ${label}
        </div>
        <div class="card-body p-2.5" style="font-size:0.8rem;">
          ${rows
            .map(
              ([l, v]) => `
                <div class="mb-1.5">
                  <small class="text-uppercase fw-bold text-muted d-block mb-0.5" style="font-size:0.62rem;">${l}</small>
                  <span class="text-dark">${v}</span>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
  }

  function discrepancyBadge(label, qty, badgeClass) {
    const num = Number(qty || 0);
    if (!num) return "";
    return `<span class="badge ${badgeClass} me-1" style="font-size:0.65rem;">${label}: ${num}</span>`;
  }

  function renderInboundDetail(detail) {
    const txn = detail.transaction || {};
    const header = detail.shipment_header || {};
    const items = detail.shipment_line_items || [];
    const parties = detail.parties || {};

    const createdStr = formatTimestamp(txn.created_at);
    const completedStr = formatTimestamp(txn.completed_at);

    // Section 1 — Transaction Information
    const transactionInfoSection = `
      <div class="card border-0 shadow-sm mb-3 rounded-3 overflow-hidden">
        <div class="card-header bg-white fw-bold text-uppercase small text-muted py-2.5">
          Transaction Information
        </div>
        <div class="card-body p-3">
          <div class="row g-2">
            ${infoField("Transaction ID", `<code class="font-monospace text-primary text-break" style="font-size:0.75rem;">${txt(txn.id)}</code>`, "col-12 col-sm-6 col-md-4")}
            ${infoField("Transaction Type", typeBadge(txn.transaction_type))}
            ${infoField("Status", statusBadge(txn.status))}
            ${infoField("Warehouse Zone", `<span class="badge bg-light text-secondary border font-monospace">${txt(txn.warehouse_id)}</span>`)}
            ${infoField("Created At", createdStr)}
            ${infoField("Completed At", completedStr)}
            ${infoField("Verified By", txt(header.verified_by))}
          </div>
        </div>
      </div>
    `;

    // Section 2 — Shipment Information (MODIFIED: added Client Name and Client Code)
    const shipmentInfoSection = `
      <div class="card border-0 shadow-sm mb-3 rounded-3 overflow-hidden">
        <div class="card-header bg-white fw-bold text-uppercase small text-muted py-2.5">
          Shipment Information
        </div>
        <div class="card-body p-3">
          <div class="row g-2">
            ${infoField("Shipment ID", `<code class="font-monospace text-muted text-break" style="font-size:0.75rem;">${txt(header.id)}</code>`, "col-12 col-sm-6 col-md-4")}
            ${infoField("Client Name", `<span class="fw-semibold text-dark">${txt(header.client_name || txn.client_name)}</span>`)}
            ${infoField("Client Code", `<span class="badge bg-light text-dark border font-monospace">${txt(header.client_code || txn.client_code)}</span>`)}
            ${infoField("Invoice Number", `<span class="fw-bold text-primary">${txt(header.invoice_number)}</span>`)}
            ${infoField("Invoice Date", txt(header.invoice_date))}
            ${infoField("PO Number", txt(header.po_number))}
            ${infoField("LR Number", txt(header.lr_number))}
            ${infoField("E-Way Bill", txt(header.e_way_bill_number))}
            ${infoField("Vehicle ID", txt(header.vehicle_number))}
            ${infoField("Driver Name", txt(header.driver_name))}
            ${infoField("Driver Phone Number", txt(header.driver_phone_number))}
          </div>
        </div>
      </div>
    `;

    // Section 3 — Business Parties
    const partyCards = [
      partyCard("Seller Party", parties.seller),
      partyCard("Buyer Profile", parties.buyer),
      partyCard("Bill To Location", parties.bill_to),
      partyCard("Ship To Destination", parties.ship_to),
      partyCard("Biller Gateway", parties.biller),
      partyCard("Shipper Carrier", parties.shipper),
    ]
      .filter((card) => card !== "")
      .join("");

    const businessPartiesSection = `
      <div class="mb-3">
        <small class="text-uppercase fw-bold text-muted mb-1.5 d-block" style="font-size:0.7rem; letter-spacing:0.3px;">Business Parties</small>
        <div class="row g-2">
          ${partyCards || `<div class="col-12"><div class="card p-3 border-0 shadow-sm text-center text-muted small">No verified business identity blocks logged.</div></div>`}
        </div>
      </div>
    `;

    // Section 4 — Shipment Line Items
    const lineItemRows = items
      .map(
        (item) => `
        <tr>
          <td>${txt(item.sl_no)}</td>
          <td><code class="small fw-bold text-primary font-monospace">${txt(item.item_code)}</code></td>
          <td><div class="text-truncate text-secondary" style="max-width:140px;" title="${escapeHtml(item.item_description)}">${txt(item.item_description)}</div></td>
          <td><small class="font-monospace text-muted">${txt(item.hsn_sac)}</small></td>
          <td class="text-end fw-semibold text-dark">${txt(item.ordered_quantity)}</td>
          <td class="text-end fw-bold text-success">${txt(item.received_quantity)}</td>
          <td class="text-end text-danger">${txt(item.damaged_quantity)}</td>
          <td class="text-end text-warning">${txt(item.shortage_quantity)}</td>
          <td class="text-end text-info">${txt(item.excess_quantity)}</td>
          <td><span class="badge bg-info-subtle text-info border border-info-subtle text-capitalize">${txt(item.category)}</span></td>
          <td class="small">${txt(item.manufacturing_date)}</td>
          <td class="small">${txt(item.expiry_date)}</td>
          <td><small class="text-uppercase font-monospace text-muted fw-bold">${txt(item.uom)}</small></td>
          <td class="text-end">${fmt(item.rate)}</td>
          <td class="text-end">${fmt(item.gross_amount)}</td>
          <td class="text-end text-muted">${fmt(item.discount_amount)}</td>
          <td class="text-end fw-medium">${fmt(item.taxable_amount)}</td>
          <td class="text-end small">${txt(item.tax_rate_percent)}%</td>
          <td class="text-end text-muted">${fmt(item.cgst)}</td>
          <td class="text-end text-muted">${fmt(item.sgst)}</td>
          <td class="text-end text-muted">${fmt(item.igst)}</td>
          <td class="text-end text-muted">${fmt(item.cess)}</td>
          <td class="text-end fw-bold text-dark">${fmt(item.total_amount)}</td>
        </tr>
      `,
      )
      .join("");

    const lineItemsSection = `
      <div class="mb-3">
        <small class="text-uppercase fw-bold text-muted mb-1.5 d-block" style="font-size:0.7rem; letter-spacing:0.3px;">Shipment Line Items</small>
        <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
          <div class="table-responsive">
            <table class="table table-sm table-bordered align-middle mb-0" style="font-size:0.8rem;">
              <thead class="table-light small text-uppercase" style="font-size:0.68rem;">
                <tr>
                  <th>#</th>
                  <th>SKU Code</th>
                  <th>Description</th>
                  <th>HSN/SAC</th>
                  <th class="text-end">Ord</th>
                  <th class="text-end">Rec</th>
                  <th class="text-end">Dmg</th>
                  <th class="text-end">Sht</th>
                  <th class="text-end">Exc</th>
                  <th>Category</th>
                  <th>Mfg Date</th>
                  <th>Expiry</th>
                  <th>UOM</th>
                  <th class="text-end">Rate</th>
                  <th class="text-end">Gross</th>
                  <th class="text-end">Disc</th>
                  <th class="text-end">Taxable</th>
                  <th class="text-end">Tax%</th>
                  <th class="text-end">CGST</th>
                  <th class="text-end">SGST</th>
                  <th class="text-end">IGST</th>
                  <th class="text-end">CESS</th>
                  <th class="text-end">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                ${lineItemRows || `<tr><td colspan="23" class="text-center text-muted py-3 small">No item rows compiled inside manifest registries.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Section 5 — Discrepancies
    const discrepancyRows = items
      .map((item) => {
        const hasDiscrepancy =
          Number(item.damaged_quantity || 0) > 0 ||
          Number(item.shortage_quantity || 0) > 0 ||
          Number(item.excess_quantity || 0) > 0 ||
          (item.discrepancy_notes &&
            String(item.discrepancy_notes).trim() !== "");

        return `
        <tr class="${hasDiscrepancy ? "table-warning bg-warning bg-opacity-10" : ""}">
          <td>${txt(item.sl_no)}</td>
          <td class="fw-medium">${txt(item.item_description)}</td>
          <td>
            ${discrepancyBadge("Damaged", item.damaged_quantity, "bg-danger-subtle text-danger border border-danger-subtle px-2 py-0.5 rounded")}
            ${discrepancyBadge("Shortage", item.shortage_quantity, "bg-warning-subtle text-warning border border-warning-subtle px-2 py-0.5 rounded")}
            ${discrepancyBadge("Excess", item.excess_quantity, "bg-info-subtle text-info border border-info-subtle px-2 py-0.5 rounded")}
            ${!hasDiscrepancy ? '<span class="text-muted small">—</span>' : ""}
          </td>
          <td><div class="small text-secondary text-truncate" style="max-width:200px;" title="${escapeHtml(item.discrepancy_notes)}">${txt(item.discrepancy_notes)}</div></td>
        </tr>
      `;
      })
      .join("");

    const discrepanciesSection = `
      <div class="mb-1">
        <small class="text-uppercase fw-bold text-muted mb-1.5 d-block" style="font-size:0.7rem; letter-spacing:0.3px;">Discrepancies Ledger Log</small>
        <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0" style="font-size:0.8rem;">
              <thead class="table-light small text-uppercase" style="font-size:0.68rem;">
                <tr>
                  <th style="width:50px;">#</th>
                  <th>Item Title / Label</th>
                  <th style="min-width:180px;">Discrepancy Quantities</th>
                  <th>Operational Inspector Notes</th>
                </tr>
              </thead>
              <tbody>
                ${discrepancyRows || `<tr><td colspan="4" class="text-center text-muted py-3 small">No exceptions reported on entries.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    return (
      transactionInfoSection +
      shipmentInfoSection +
      businessPartiesSection +
      lineItemsSection +
      discrepanciesSection
    );
  }

  function formatTimestamp(raw) {
    if (!raw) return "—";

    let isoString = String(raw).trim();
    if (isoString.includes(" ") && !isoString.includes("T")) {
      isoString = isoString.replace(" ", "T");
    }
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(isoString)) {
      isoString += "Z";
    }

    const date = new Date(isoString);
    if (isNaN(date.getTime())) return String(raw);

    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(value) {
    if (value === undefined || value === null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  const root = document.getElementById("ledger-root");
  root.querySelector("#refresh-ledger-btn").onclick = () => loadLedger();
  root.querySelector("#ledger-search").oninput = () => renderFilteredTable();
  root.querySelector("#ledger-filter-type").onchange = () =>
    renderFilteredTable();

  await loadLedger();
}
