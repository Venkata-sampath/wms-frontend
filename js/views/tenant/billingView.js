import { Api } from "../../api.js";

// =========================================================================
// BILLING MODULE — single-file view (List, Create, Details+Edit).
// Hierarchical Billing Entry (Main Item -> Sub-Descriptions).
// Automatically groups taxes by HSN/SAC codes for Tally-style invoices.
// =========================================================================

let jsPdfLoadPromise = null;

/**
 * Number to Words converter (Indian Currency System)
 */
function numberToWordsIndian(num) {
  if (num === null || num === undefined || isNaN(num))
    return "Zero Rupees Only";
  let n = Math.floor(Math.abs(num));
  let paise = Math.round((Math.abs(num) - n) * 100);

  if (n === 0 && paise === 0) return "Zero Rupees Only";

  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function inWords(val) {
    if (val < 20) return a[val];
    if (val < 100)
      return b[Math.floor(val / 10)] + (val % 10 ? " " + a[val % 10] : "");
    if (val < 1000)
      return (
        a[Math.floor(val / 100)] +
        " Hundred" +
        (val % 100 ? " " + inWords(val % 100) : "")
      );
    if (val < 100000)
      return (
        inWords(Math.floor(val / 1000)) +
        " Thousand" +
        (val % 1000 ? " " + inWords(val % 1000) : "")
      );
    if (val < 10000000)
      return (
        inWords(Math.floor(val / 100000)) +
        " Lakh" +
        (val % 100000 ? " " + inWords(val % 100000) : "")
      );
    return (
      inWords(Math.floor(val / 10000000)) +
      " Crore" +
      (val % 10000000 ? " " + inWords(val % 10000000) : "")
    );
  }

  let str = "Indian Rupees " + inWords(n);
  if (paise > 0) {
    str += " and " + inWords(paise) + " paise";
  }
  return str + " Only";
}

/**
 * Module entry point, called by app.js router.
 */
export async function render(container, currentUser) {
  if (currentUser.role !== "admin") {
    container.innerHTML = `
      <div class="container-fluid p-0 p-sm-4">
        <div class="alert alert-danger border-0 shadow-sm" role="alert">
          <h5 class="fw-bold"><i class="bi bi-shield-lock-fill me-2"></i>Access Denied</h5>
          <p class="mb-0 small">Only Warehouse Administrators can access the Billing module.</p>
        </div>
      </div>
    `;
    return;
  }
  await renderList(container, currentUser);
}

// =========================================================================
// SCREEN 1: BILLING LIST
// =========================================================================
async function renderList(container, currentUser) {
  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in">

      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-receipt-cutoff text-primary me-2"></i>Billing
          </h3>
          <p class="text-muted small mb-0">Generate and manage warehouse invoices.</p>
        </div>
        <div class="d-flex gap-2">
          <button id="billing-create-btn" class="btn btn-primary btn-sm fw-semibold shadow-sm">
            <i class="bi bi-plus-circle me-1"></i> Create Bill
          </button>
          <button id="billing-refresh-btn" class="btn btn-light btn-sm border text-muted shadow-sm">
            <i class="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>
      </div>

      <div id="billing-alert-anchor" class="px-3 px-sm-0"></div>

      <div class="card shadow-sm border-0 rounded-0 rounded-sm-3 mx-3 mx-sm-0">
        <div class="card-header bg-white py-3 border-bottom">
          <div class="row g-2 align-items-center">
            <div class="col-12 col-md-5">
              <input type="text" id="billing-search-input" class="form-control form-control-sm bg-light" placeholder="Search bill number or client...">
            </div>
            <div class="col-6 col-md-4">
              <select id="billing-client-filter" class="form-select form-select-sm bg-light">
                <option value="">All Clients</option>
              </select>
            </div>
            <div class="col-6 col-md-3">
              <select id="billing-status-filter" class="form-select form-select-sm bg-light">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0 text-nowrap">
              <thead class="table-light text-secondary small text-uppercase" style="font-size: 0.75rem;">
                <tr>
                  <th class="ps-4 py-3">Bill Number</th>
                  <th class="py-3">Client</th>
                  <th class="py-3">Billing Period</th>
                  <th class="py-3">Invoice Date</th>
                  <th class="py-3">Due Date</th>
                  <th class="py-3 text-end">Grand Total</th>
                  <th class="pe-4 py-3 text-end">Status</th>
                </tr>
              </thead>
              <tbody id="billing-table-body">
                <tr>
                  <td colspan="7" class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Loading bills...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  `;

  const alertAnchor = document.getElementById("billing-alert-anchor");
  const tbody = document.getElementById("billing-table-body");
  const searchInput = document.getElementById("billing-search-input");
  const clientFilter = document.getElementById("billing-client-filter");
  const statusFilter = document.getElementById("billing-status-filter");
  const createBtn = document.getElementById("billing-create-btn");
  const refreshBtn = document.getElementById("billing-refresh-btn");

  let searchDebounce = null;

  try {
    const clients = await Api.clients.list();
    clients
      .filter((c) => c.status === "active")
      .forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name;
        clientFilter.appendChild(opt);
      });
  } catch (err) {
    // Non-fatal
  }

  async function loadBills() {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5 text-muted">
          <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
          Loading bills...
        </td>
      </tr>
    `;
    try {
      const bills = await Api.billing.list({
        search: searchInput.value.trim(),
        client_id: clientFilter.value,
        status: statusFilter.value,
      });

      if (!bills || bills.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-5 text-muted small">
              <i class="bi bi-receipt display-6 d-block mb-2 text-secondary"></i>No bills found.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = "";
      bills.forEach((bill) => {
        const isPaid = bill.status === "paid";
        const badge = isPaid
          ? `<span class="badge bg-success bg-opacity-10 text-success rounded-pill px-2 border border-success border-opacity-20">Paid</span>`
          : `<span class="badge bg-warning bg-opacity-10 text-warning-emphasis rounded-pill px-2 border border-warning border-opacity-20">Pending</span>`;

        const period =
          bill.billing_period_from || bill.billing_period_to
            ? `${bill.billing_period_from || "—"} to ${bill.billing_period_to || "—"}`
            : "—";

        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        tr.innerHTML = `
          <td class="ps-4 fw-bold text-dark">${escapeHtml(bill.bill_number)}</td>
          <td>${escapeHtml(bill.client_name)}</td>
          <td class="text-muted small">${escapeHtml(period)}</td>
          <td class="text-muted small">${escapeHtml(bill.invoice_date || "—")}</td>
          <td class="text-muted small">${escapeHtml(bill.due_date || "—")}</td>
          <td class="text-end fw-semibold">${formatMoney(bill.grand_total)}</td>
          <td class="pe-4 text-end">${badge}</td>
        `;
        tr.addEventListener("click", () => {
          renderDetails(container, currentUser, bill.id);
        });
        tbody.appendChild(tr);
      });
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-danger py-4 small fw-bold">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>Failed to load bills: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  createBtn.addEventListener("click", () => {
    renderCreate(container, currentUser);
  });

  refreshBtn.addEventListener("click", () => {
    alertAnchor.innerHTML = "";
    loadBills();
  });

  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(loadBills, 350);
  });
  clientFilter.addEventListener("change", loadBills);
  statusFilter.addEventListener("change", loadBills);

  await loadBills();
}

// =========================================================================
// SCREEN 2: CREATE BILL
// =========================================================================
async function renderCreate(container, currentUser) {
  let clientsData = [];

  try {
    clientsData = await Api.clients.list();
  } catch (err) {
    // Non-fatal
  }

  // Pre-fill Invoice Date with current date (YYYY-MM-DD)
  const todayDate = new Date().toISOString().split("T")[0];

  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in" style="max-width: 1100px; margin: 0 auto;">

      <div class="d-flex justify-content-between align-items-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3"><i class="bi bi-receipt-cutoff text-primary me-2"></i>Create Bill</h3>
          <p class="text-muted small mb-0">Fill in invoice details. Charges, subtotal, and tax breakdowns compute automatically.</p>
        </div>
        <button id="billing-back-btn" class="btn btn-outline-secondary btn-sm fw-semibold shadow-sm">
          <i class="bi bi-arrow-left me-1"></i> Back to List
        </button>
      </div>

      <div id="billing-form-alert-anchor" class="px-3 px-sm-0"></div>

      <form id="billing-create-form" novalidate class="px-3 px-sm-0">

        ${sectionCard(
          "1",
          "Warehouse Details (Prefilled - Edits apply to this bill only)",
          `
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-muted">Company Legal Name</label>
              <input type="text" id="wh-company-name-input" class="form-control bg-light" value="${escapeHtml(currentUser.company_name || "")}">
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-muted">GSTIN / UIN</label>
              <input type="text" id="wh-gstin-input" class="form-control bg-light" value="${escapeHtml(currentUser.gstin || "")}">
            </div>
            <div class="col-md-12">
              <label class="form-label small fw-semibold text-muted">Address</label>
              <input type="text" id="wh-address-input" class="form-control bg-light" value="${escapeHtml(currentUser.address || "")}">
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">FSSAI NO</label>
              <input type="text" id="wh-fssai-input" class="form-control bg-light" placeholder="e.g. 13617012000235">
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Bank Name & A/c No.</label>
              <input type="text" id="wh-bank-input" class="form-control bg-light" placeholder="e.g. KOTAK MAHINDRA BANK 05532970000011">
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Branch & IFSC Code</label>
              <input type="text" id="wh-ifsc-input" class="form-control bg-light" placeholder="e.g. Dilsukhnagar & KKBK0007446">
            </div>
          </div>
        `,
        )}

        ${sectionCard(
          "2",
          "Buyer (Bill To) - Prefilled from Client DB",
          `
          <div class="row g-3 mb-3">
            <div class="col-md-12">
              <label class="form-label small fw-semibold text-muted">Select Client *</label>
              <select id="client-select-input" class="form-select bg-light" required>
                <option value="">Select a client...</option>
                ${clientsData
                  .filter((c) => c.status === "active")
                  .map(
                    (c) =>
                      `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`,
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-muted">Buyer Name</label>
              <input type="text" id="buyer-name-input" class="form-control bg-light">
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-muted">Buyer GSTIN / UIN</label>
              <input type="text" id="buyer-gstin-input" class="form-control bg-light">
            </div>
            <div class="col-md-12">
              <label class="form-label small fw-semibold text-muted">Buyer Address</label>
              <input type="text" id="buyer-address-input" class="form-control bg-light">
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Contact Person</label>
              <input type="text" id="buyer-contact-input" class="form-control bg-light">
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Phone</label>
              <input type="text" id="buyer-phone-input" class="form-control bg-light">
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Email</label>
              <input type="email" id="buyer-email-input" class="form-control bg-light">
            </div>
          </div>
        `,
        )}

        ${sectionCard(
          "3",
          "Invoice Information",
          `
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Bill / Invoice Number *</label>
              <input type="text" id="bill-number-input" class="form-control bg-light" placeholder="e.g. FCS/250/2026-27" required>
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Invoice Date</label>
              <input type="date" id="invoice-date-input" class="form-control bg-light" value="${todayDate}" readonly required>
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Mode / Terms of Payment</label>
              <input type="text" id="due-date-input" class="form-control bg-light" placeholder="e.g. 30 Days">
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-muted">Delivery Note / Reference No. & Date</label>
              <input type="text" id="reference-number-input" class="form-control bg-light" placeholder="e.g. FCS/250/2026-27 dt. 3-Aug-26">
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-muted">Other References (Billing Month)</label>
              <input type="text" id="other-ref-input" class="form-control bg-light" placeholder="e.g. Month of July-2026">
            </div>
          </div>
        `,
        )}

        ${sectionCard(
          "4",
          "Billing Period",
          `
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-muted">From Date</label>
              <input type="date" id="period-from-input" class="form-control bg-light">
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-muted">To Date</label>
              <input type="date" id="period-to-input" class="form-control bg-light">
            </div>
          </div>
        `,
        )}

        ${sectionCard(
          "5",
          "Description of Goods & Services (Main Items & Sub-Descriptions)",
          `
          <div id="main-items-container"></div>
          <button type="button" id="add-main-item-btn" class="btn btn-outline-primary btn-sm fw-semibold mt-2">
            <i class="bi bi-plus-lg me-1"></i> Add Main Item Category
          </button>
        `,
        )}

        ${sectionCard(
          "6",
          "Tax & Financial Summary",
          `
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Subtotal (Auto-Calculated)</label>
              <input type="number" step="0.01" id="subtotal-input" class="form-control bg-light fw-bold" readonly value="0.00">
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Total CGST Amount</label>
              <input type="number" step="0.01" id="cgst-amount-input" class="form-control bg-light" readonly value="0.00">
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Total SGST Amount</label>
              <input type="number" step="0.01" id="sgst-amount-input" class="form-control bg-light" readonly value="0.00">
            </div>
            <div class="col-md-3">
              <label class="form-label small fw-semibold text-muted">Round Off (+ / -)</label>
              <input type="number" step="0.01" id="roundoff-input" class="form-control bg-light" value="0.00">
            </div>
            <div class="col-md-3">
              <label class="form-label small fw-semibold text-muted">Discount</label>
              <input type="number" step="0.01" id="discount-input" class="form-control bg-light" value="0.00">
            </div>
            <div class="col-md-3">
              <label class="form-label small fw-semibold text-muted">Other Charges</label>
              <input type="number" step="0.01" id="other-charges-input" class="form-control bg-light" value="0.00">
            </div>
            <div class="col-md-3">
              <label class="form-label small fw-semibold text-muted">Grand Total</label>
              <input type="number" step="0.01" id="grand-total-input" class="form-control bg-light fw-bold fs-5 text-primary" readonly value="0.00">
            </div>
          </div>
        `,
        )}

        ${sectionCard(
          "7",
          "Notes & Remarks",
          `
          <textarea id="notes-input" class="form-control bg-light" rows="3" placeholder="Additional notes or declarations..."></textarea>
        `,
        )}

        ${sectionCard(
          "8",
          "Attachments (Optional)",
          `
          <input type="file" id="attachments-input" class="form-control bg-light" multiple>
          <div class="form-text text-muted extra-small" style="font-size:0.75rem;">Uploaded after bill creation. You can attach supporting documents anytime.</div>
        `,
        )}

        <div class="text-end mb-5">
          <button type="button" id="cancel-create-btn" class="btn btn-outline-secondary px-4 me-2">Cancel</button>
          <button type="submit" id="submit-bill-btn" class="btn btn-primary px-4 fw-semibold shadow-sm">
            <i class="bi bi-check-circle me-2"></i> Create Bill
          </button>
        </div>

      </form>
    </div>
  `;

  const alertAnchor = document.getElementById("billing-form-alert-anchor");
  const form = document.getElementById("billing-create-form");
  const clientSelect = document.getElementById("client-select-input");
  const mainContainer = document.getElementById("main-items-container");
  const addMainBtn = document.getElementById("add-main-item-btn");
  const submitBtn = document.getElementById("submit-bill-btn");
  const attachmentsInput = document.getElementById("attachments-input");

  document
    .getElementById("billing-back-btn")
    .addEventListener("click", () => renderList(container, currentUser));
  document
    .getElementById("cancel-create-btn")
    .addEventListener("click", () => renderList(container, currentUser));

  // Auto pre-fill buyer information when client is selected
  clientSelect.addEventListener("change", () => {
    const selectedId = clientSelect.value;
    const client = clientsData.find((c) => c.id === selectedId);
    if (client) {
      document.getElementById("buyer-name-input").value = client.name || "";
      document.getElementById("buyer-gstin-input").value = client.gstin || "";
      document.getElementById("buyer-address-input").value =
        client.address || "";
      document.getElementById("buyer-contact-input").value =
        client.contact_person || "";
      document.getElementById("buyer-phone-input").value = client.phone || "";
      document.getElementById("buyer-email-input").value = client.email || "";
    }
  });

  let mainItemCount = 0;

  function createMainItemCard() {
    mainItemCount++;
    const cardId = `main-item-${mainItemCount}`;
    const card = document.createElement("div");
    card.className = "card border mb-3 shadow-none main-item-card";
    card.id = cardId;

    card.innerHTML = `
      <div class="card-header bg-light d-flex justify-content-between align-items-center py-2">
        <span class="fw-bold text-dark small"><i class="bi bi-folder-fill text-primary me-2"></i>Item Category #${mainItemCount}</span>
        <button type="button" class="btn btn-sm btn-outline-danger remove-main-item-btn"><i class="bi bi-trash me-1"></i>Remove Category</button>
      </div>
      <div class="card-body p-3">
        <div class="row g-2 mb-3">
          <div class="col-md-6">
            <label class="form-label extra-small fw-semibold text-muted">Main Description *</label>
            <input type="text" class="form-control form-control-sm main-desc-input" placeholder="e.g. Cooling Charges-18%" required>
          </div>
          <div class="col-md-3">
            <label class="form-label extra-small fw-semibold text-muted">HSN/SAC Code *</label>
            <input type="text" class="form-control form-control-sm hsn-sac-input" placeholder="e.g. 992971" required>
          </div>
          <div class="col-md-3">
            <label class="form-label extra-small fw-semibold text-muted">GST Tax Rate *</label>
            <select class="form-select form-select-sm tax-rate-select">
              <option value="18" selected>18% (9% CGST + 9% SGST)</option>
              <option value="12">12% (6% CGST + 6% SGST)</option>
              <option value="5">5% (2.5% CGST + 2.5% SGST)</option>
              <option value="0">0% (Exempted)</option>
            </select>
          </div>
        </div>

        <div class="small fw-semibold text-secondary mb-2">Sub-Descriptions / Line Breakdowns</div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-2">
            <thead class="table-light extra-small text-uppercase text-secondary">
              <tr>
                <th style="min-width:200px;">Sub-Description Detail</th>
                <th style="width:90px;">Quantity</th>
                <th style="width:80px;">Unit</th>
                <th style="width:90px;">Rate</th>
                <th style="width:110px;">Amount</th>
                <th style="width:40px;"></th>
              </tr>
            </thead>
            <tbody class="sub-items-body"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center">
          <button type="button" class="btn btn-light btn-sm border text-muted add-sub-item-btn">
            <i class="bi bi-plus-lg me-1"></i> Add Sub-Description
          </button>
          <div class="small fw-bold">Main Item Total: ₹<span class="main-item-total-display">0.00</span></div>
        </div>
      </div>
    `;

    const subBody = card.querySelector(".sub-items-body");

    card
      .querySelector(".remove-main-item-btn")
      .addEventListener("click", () => {
        if (mainContainer.children.length > 1) {
          card.remove();
          recalculateFinancials();
        }
      });

    card
      .querySelector(".add-sub-item-btn")
      .addEventListener("click", () => addSubItemRow(subBody));
    card
      .querySelector(".tax-rate-select")
      .addEventListener("change", recalculateFinancials);

    mainContainer.appendChild(card);
    addSubItemRow(subBody);
  }

  function addSubItemRow(tbody, prefill = null) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="form-control form-control-sm sub-desc-input" placeholder="e.g. Frozen--18(+/-2) Degree Celsius" value="${prefill ? escapeHtml(prefill.sub_description || "") : ""}"></td>
      <td><input type="number" step="any" class="form-control form-control-sm sub-qty-input" value="${prefill && prefill.quantity !== null ? prefill.quantity : ""}"></td>
      <td><input type="text" class="form-control form-control-sm sub-unit-input" placeholder="Pallets" value="${prefill ? escapeHtml(prefill.unit || "") : ""}"></td>
      <td><input type="number" step="any" class="form-control form-control-sm sub-rate-input" value="${prefill && prefill.rate !== null ? prefill.rate : ""}"></td>
      <td><input type="number" step="any" class="form-control form-control-sm sub-amount-input" value="${prefill && prefill.amount !== null ? prefill.amount : ""}"></td>
      <td><button type="button" class="btn btn-sm btn-outline-danger remove-sub-row-btn"><i class="bi bi-x"></i></button></td>
    `;

    tr.querySelector(".remove-sub-row-btn").addEventListener("click", () => {
      if (tbody.children.length > 1) {
        tr.remove();
        recalculateFinancials();
      }
    });

    const qtyIn = tr.querySelector(".sub-qty-input");
    const rateIn = tr.querySelector(".sub-rate-input");
    const amtIn = tr.querySelector(".sub-amount-input");

    const autoCalcSubAmount = () => {
      const q = parseFloat(qtyIn.value);
      const r = parseFloat(rateIn.value);
      if (!isNaN(q) && !isNaN(r)) {
        amtIn.value = (q * r).toFixed(2);
      }
      recalculateFinancials();
    };

    qtyIn.addEventListener("input", autoCalcSubAmount);
    rateIn.addEventListener("input", autoCalcSubAmount);
    amtIn.addEventListener("input", recalculateFinancials);

    tbody.appendChild(tr);
  }

  function recalculateFinancials() {
    let grandSubtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;

    mainContainer.querySelectorAll(".main-item-card").forEach((card) => {
      let cardSubtotal = 0;
      card.querySelectorAll(".sub-amount-input").forEach((amtIn) => {
        const val = parseFloat(amtIn.value);
        if (!isNaN(val)) cardSubtotal += val;
      });

      card.querySelector(".main-item-total-display").textContent =
        cardSubtotal.toFixed(2);
      grandSubtotal += cardSubtotal;

      const taxRate =
        parseFloat(card.querySelector(".tax-rate-select").value) || 0;
      const cgstRate = taxRate / 2;
      const sgstRate = taxRate / 2;

      totalCgst += (cardSubtotal * cgstRate) / 100;
      totalSgst += (cardSubtotal * sgstRate) / 100;
    });

    document.getElementById("subtotal-input").value = grandSubtotal.toFixed(2);
    document.getElementById("cgst-amount-input").value = totalCgst.toFixed(2);
    document.getElementById("sgst-amount-input").value = totalSgst.toFixed(2);

    const roundoff =
      parseFloat(document.getElementById("roundoff-input").value) || 0;
    const discount =
      parseFloat(document.getElementById("discount-input").value) || 0;
    const otherCharges =
      parseFloat(document.getElementById("other-charges-input").value) || 0;

    const grandTotal =
      grandSubtotal +
      totalCgst +
      totalSgst +
      roundoff +
      otherCharges -
      discount;
    document.getElementById("grand-total-input").value = grandTotal.toFixed(2);
  }

  addMainBtn.addEventListener("click", createMainItemCard);
  createMainItemCard(); // Initialize with first main category

  document
    .getElementById("roundoff-input")
    .addEventListener("input", recalculateFinancials);
  document
    .getElementById("discount-input")
    .addEventListener("input", recalculateFinancials);
  document
    .getElementById("other-charges-input")
    .addEventListener("input", recalculateFinancials);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertAnchor.innerHTML = "";

    const client_id = clientSelect.value;
    const bill_number = document
      .getElementById("bill-number-input")
      .value.trim();
    const invoice_date = document.getElementById("invoice-date-input").value;

    if (!client_id || !bill_number || !invoice_date) {
      renderAlert(
        alertAnchor,
        "warning",
        "Client, Bill Number, and Invoice Date are mandatory.",
      );
      return;
    }

    // Collect hierarchical item structure
    const items = [];
    let validationFailed = false;

    mainContainer.querySelectorAll(".main-item-card").forEach((card) => {
      const main_description = card
        .querySelector(".main-desc-input")
        .value.trim();
      const hsn_sac = card.querySelector(".hsn-sac-input").value.trim();
      const tax_rate = card.querySelector(".tax-rate-select").value;

      if (!main_description || !hsn_sac) {
        validationFailed = true;
        return;
      }

      const sub_items = [];
      let mainSum = 0;

      card.querySelectorAll("tbody.sub-items-body tr").forEach((tr) => {
        const sub_description = tr
          .querySelector(".sub-desc-input")
          .value.trim();
        const quantity = tr.querySelector(".sub-qty-input").value;
        const unit = tr.querySelector(".sub-unit-input").value.trim();
        const rate = tr.querySelector(".sub-rate-input").value;
        const amount = tr.querySelector(".sub-amount-input").value;

        const numAmt = amount === "" ? 0 : Number(amount);
        mainSum += numAmt;

        if (sub_description || quantity || rate || amount) {
          sub_items.push({
            sub_description,
            quantity: quantity === "" ? null : Number(quantity),
            unit: unit || null,
            rate: rate === "" ? null : Number(rate),
            amount: amount === "" ? null : numAmt,
          });
        }
      });

      items.push({
        main_description,
        hsn_sac,
        tax_rate: Number(tax_rate),
        amount: mainSum,
        sub_items,
      });
    });

    if (validationFailed) {
      renderAlert(
        alertAnchor,
        "warning",
        "Every main category must have a Description and HSN/SAC code.",
      );
      return;
    }

    if (items.length === 0) {
      renderAlert(
        alertAnchor,
        "warning",
        "At least one item category is required.",
      );
      return;
    }

    const payload = {
      client_id,
      bill_number,
      invoice_date,
      due_date: document.getElementById("due-date-input").value.trim() || null,
      billing_period_from:
        document.getElementById("period-from-input").value || null,
      billing_period_to:
        document.getElementById("period-to-input").value || null,
      reference_number:
        document.getElementById("reference-number-input").value.trim() || null,
      subtotal: document.getElementById("subtotal-input").value || 0,
      tax: (
        parseFloat(document.getElementById("cgst-amount-input").value || 0) +
        parseFloat(document.getElementById("sgst-amount-input").value || 0)
      ).toFixed(2),
      discount: document.getElementById("discount-input").value || 0,
      other_charges: document.getElementById("other-charges-input").value || 0,
      grand_total: document.getElementById("grand-total-input").value || 0,
      notes: document.getElementById("notes-input").value.trim() || null,
      items,
      wh_company_name: document
        .getElementById("wh-company-name-input")
        .value.trim(),
      wh_gstin: document.getElementById("wh-gstin-input").value.trim(),
      wh_address: document.getElementById("wh-address-input").value.trim(),
      wh_fssai: document.getElementById("wh-fssai-input").value.trim(),
      wh_bank: document.getElementById("wh-bank-input").value.trim(),
      wh_ifsc: document.getElementById("wh-ifsc-input").value.trim(),
      buyer_name: document.getElementById("buyer-name-input").value.trim(),
      buyer_gstin: document.getElementById("buyer-gstin-input").value.trim(),
      buyer_address: document
        .getElementById("buyer-address-input")
        .value.trim(),
      buyer_contact: document
        .getElementById("buyer-contact-input")
        .value.trim(),
      buyer_phone: document.getElementById("buyer-phone-input").value.trim(),
      buyer_email: document.getElementById("buyer-email-input").value.trim(),
      other_ref: document.getElementById("other-ref-input").value.trim(),
      cgst_amount: document.getElementById("cgst-amount-input").value || 0,
      sgst_amount: document.getElementById("sgst-amount-input").value || 0,
      round_off: document.getElementById("roundoff-input").value || 0,
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Creating...`;

    try {
      const result = await Api.billing.create(payload);
      const billingId = result.billing_id;

      const files = attachmentsInput.files;
      if (files && files.length > 0) {
        for (const file of files) {
          const fd = new FormData();
          fd.append("file", file);
          try {
            await Api.billing.uploadAttachment(billingId, fd);
          } catch (attErr) {
            console.error("Attachment upload failed:", attErr.message);
          }
        }
      }

      await renderDetails(container, currentUser, billingId);
    } catch (err) {
      renderAlert(
        alertAnchor,
        "danger",
        err.message || "Failed to create bill.",
      );
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="bi bi-check-circle me-2"></i> Create Bill`;
    }
  });
}

// =========================================================================
// SCREEN 3: BILL DETAILS (toggles into Edit mode in place)
// =========================================================================
async function renderDetails(
  container,
  currentUser,
  billingId,
  startInEdit = false,
) {
  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in" style="max-width: 1000px; margin: 0 auto;">
      <div class="d-flex justify-content-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
      </div>
    </div>
  `;

  let data;
  try {
    data = await Api.billing.getDetails(billingId);
  } catch (err) {
    container.innerHTML = `
      <div class="container-fluid p-0 p-sm-4">
        <div class="alert alert-danger border-0 shadow-sm">Failed to load bill: ${escapeHtml(err.message)}</div>
        <button id="billing-back-btn-err" class="btn btn-outline-secondary btn-sm">Back to List</button>
      </div>
    `;
    document
      .getElementById("billing-back-btn-err")
      .addEventListener("click", () => renderList(container, currentUser));
    return;
  }

  const { bill, items, attachments } = data;
  const isPaid = bill.status === "paid";
  const editMode = startInEdit && !isPaid;

  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in" style="max-width: 1000px; margin: 0 auto;">

      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-receipt-cutoff text-primary me-2"></i>${escapeHtml(bill.bill_number)}
          </h3>
          <p class="text-muted small mb-0">
            ${
              isPaid
                ? `<span class="badge bg-success bg-opacity-10 text-success rounded-pill px-2 border border-success border-opacity-20">Paid</span>`
                : `<span class="badge bg-warning bg-opacity-10 text-warning-emphasis rounded-pill px-2 border border-warning border-opacity-20">Pending</span>`
            }
          </p>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <button id="billing-back-btn" class="btn btn-outline-secondary btn-sm fw-semibold shadow-sm">
            <i class="bi bi-arrow-left me-1"></i> Back
          </button>
          <button id="download-invoice-btn" class="btn btn-outline-primary btn-sm fw-semibold shadow-sm">
            <i class="bi bi-download me-1"></i> Download Tally PDF Invoice
          </button>
          ${
            !isPaid
              ? `
            <button id="mark-paid-btn" class="btn btn-success btn-sm fw-semibold shadow-sm">
              <i class="bi bi-check-circle me-1"></i> Mark Paid
            </button>
            <button id="delete-bill-btn" class="btn btn-outline-danger btn-sm fw-semibold shadow-sm">
              <i class="bi bi-trash me-1"></i> Delete
            </button>
          `
              : ""
          }
        </div>
      </div>

      <div id="billing-details-alert-anchor" class="px-3 px-sm-0"></div>

      <div class="px-3 px-sm-0" id="billing-details-body"></div>

    </div>
  `;

  document
    .getElementById("billing-back-btn")
    .addEventListener("click", () => renderList(container, currentUser));

  const alertAnchor = document.getElementById("billing-details-alert-anchor");
  const bodyEl = document.getElementById("billing-details-body");

  document
    .getElementById("download-invoice-btn")
    .addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Generating...`;
      try {
        await generateInvoicePdf(currentUser, bill, items);
      } catch (err) {
        renderAlert(
          alertAnchor,
          "danger",
          "Failed to generate PDF: " + err.message,
        );
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });

  if (!isPaid) {
    document.getElementById("mark-paid-btn").addEventListener("click", () => {
      confirmAction(
        "Mark this bill as Paid?",
        "This cannot be undone — once marked Paid, the bill becomes read-only and can no longer be edited or deleted.",
        async () => {
          try {
            await Api.billing.markPaid(billingId);
            await renderDetails(container, currentUser, billingId);
          } catch (err) {
            renderAlert(
              alertAnchor,
              "danger",
              err.message || "Failed to mark bill as paid.",
            );
          }
        },
      );
    });

    document.getElementById("delete-bill-btn").addEventListener("click", () => {
      confirmAction(
        "Delete this bill?",
        "This will permanently delete the bill, its line items, and any attachments. This cannot be undone.",
        async () => {
          try {
            await Api.billing.remove(billingId);
            await renderList(container, currentUser);
          } catch (err) {
            renderAlert(
              alertAnchor,
              "danger",
              err.message || "Failed to delete bill.",
            );
          }
        },
      );
    });
  }

  renderReadOnlyBody(
    bodyEl,
    bill,
    items,
    attachments,
    alertAnchor,
    container,
    currentUser,
    billingId,
    isPaid,
  );
}

function renderReadOnlyBody(
  bodyEl,
  bill,
  items,
  attachments,
  alertAnchor,
  container,
  currentUser,
  billingId,
  isPaid,
) {
  bodyEl.innerHTML = `
    ${sectionCard(
      "",
      "Invoice Information",
      `
      <div class="row g-3 small">
        <div class="col-md-4"><span class="text-muted d-block">Bill Number</span><span class="fw-semibold">${escapeHtml(bill.bill_number)}</span></div>
        <div class="col-md-4"><span class="text-muted d-block">Invoice Date</span><span class="fw-semibold">${escapeHtml(bill.invoice_date || "—")}</span></div>
        <div class="col-md-4"><span class="text-muted d-block">Due Date / Terms</span><span class="fw-semibold">${escapeHtml(bill.due_date || "—")}</span></div>
        <div class="col-md-6"><span class="text-muted d-block">Reference Number</span><span class="fw-semibold">${escapeHtml(bill.reference_number || "—")}</span></div>
      </div>
    `,
    )}

    ${sectionCard(
      "",
      "Billing Period",
      `
      <div class="row g-3 small">
        <div class="col-md-6"><span class="text-muted d-block">From</span><span class="fw-semibold">${escapeHtml(bill.billing_period_from || "—")}</span></div>
        <div class="col-md-6"><span class="text-muted d-block">To</span><span class="fw-semibold">${escapeHtml(bill.billing_period_to || "—")}</span></div>
      </div>
    `,
    )}

    ${sectionCard(
      "",
      "Buyer (Bill To)",
      `
      <div class="small">
        <div class="fw-semibold">${escapeHtml(bill.buyer_name || bill.client_name)} <span class="text-muted">(${escapeHtml(bill.client_code || "")})</span></div>
        ${bill.buyer_gstin || bill.client_gstin ? `<div class="text-muted">GSTIN: ${escapeHtml(bill.buyer_gstin || bill.client_gstin)}</div>` : ""}
        ${bill.buyer_address ? `<div class="text-muted">Address: ${escapeHtml(bill.buyer_address)}</div>` : ""}
      </div>
    `,
    )}

    ${sectionCard(
      "",
      "Charges Summary",
      `
      <div class="table-responsive border rounded">
        <table class="table table-sm mb-0">
          <thead class="table-light small text-uppercase text-secondary">
            <tr>
              <th class="ps-3">Description</th>
              <th>HSN/SAC</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Rate</th>
              <th class="text-end pe-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (it) => `
              <tr class="table-light">
                <td class="ps-3 fw-bold">${escapeHtml(it.main_description || it.description)}</td>
                <td class="fw-bold">${escapeHtml(it.hsn_sac || "—")}</td>
                <td></td>
                <td></td>
                <td></td>
                <td class="text-end pe-3 fw-bold">${formatMoney(it.amount)}</td>
              </tr>
              ${(it.sub_items || [])
                .map(
                  (sub) => `
                <tr>
                  <td class="ps-4 text-muted border-0 pb-1 pt-1"><small>${escapeHtml(sub.sub_description)}</small></td>
                  <td class="border-0 pb-1 pt-1"></td>
                  <td class="border-0 pb-1 pt-1"><small>${sub.quantity || ""}</small></td>
                  <td class="border-0 pb-1 pt-1"><small>${escapeHtml(sub.unit || "")}</small></td>
                  <td class="border-0 pb-1 pt-1"><small>${sub.rate || ""}</small></td>
                  <td class="text-end pe-3 border-0 pb-1 pt-1"><small>${formatMoney(sub.amount)}</small></td>
                </tr>
              `,
                )
                .join("")}
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `,
    )}

    ${sectionCard(
      "",
      "Summary",
      `
      <div class="row g-3 small">
        <div class="col-md-3"><span class="text-muted d-block">Subtotal</span><span class="fw-semibold">${formatMoney(bill.subtotal)}</span></div>
        <div class="col-md-3"><span class="text-muted d-block">Tax (CGST + SGST)</span><span class="fw-semibold">${formatMoney(bill.tax)}</span></div>
        <div class="col-md-3"><span class="text-muted d-block">Round Off</span><span class="fw-semibold">${formatMoney(bill.round_off)}</span></div>
        <div class="col-md-3"><span class="text-muted d-block">Other Charges</span><span class="fw-semibold">${formatMoney(bill.other_charges)}</span></div>
        <div class="col-md-4"><span class="text-muted d-block">Grand Total</span><span class="fw-bold fs-5 text-primary">${formatMoney(bill.grand_total)}</span></div>
      </div>
    `,
    )}

    ${sectionCard("", "Notes", `<div class="small">${bill.notes ? escapeHtml(bill.notes) : '<span class="text-muted">—</span>'}</div>`)}

    ${sectionCard(
      "",
      "Attachments",
      `
      <div id="attachments-list-readonly">
        ${
          attachments.length === 0
            ? '<span class="text-muted small">No attachments.</span>'
            : attachments
                .map(
                  (a) => `
            <div class="d-flex justify-content-between align-items-center border-bottom py-2 small" data-attachment-id="${a.id}">
              <a href="${a.file_url}" target="_blank" rel="noopener"><i class="bi bi-paperclip me-1"></i>${escapeHtml(a.file_name)}</a>
              ${!isPaid ? `<button class="btn btn-sm btn-outline-danger remove-attachment-btn" data-id="${a.id}"><i class="bi bi-trash"></i></button>` : ""}
            </div>
          `,
                )
                .join("")
        }
      </div>
      ${
        !isPaid
          ? `
        <div class="mt-3">
          <input type="file" id="add-attachment-input" class="form-control form-control-sm bg-light d-inline-block" style="max-width:260px;">
          <button id="add-attachment-btn" class="btn btn-sm btn-light border ms-2">Upload</button>
        </div>
      `
          : ""
      }
    `,
    )}
  `;

  if (!isPaid) {
    bodyEl.querySelectorAll(".remove-attachment-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const attachmentId = btn.getAttribute("data-id");
        confirmAction(
          "Remove this attachment?",
          "This deletes the file permanently.",
          async () => {
            try {
              await Api.billing.removeAttachment(attachmentId);
              await renderDetails(container, currentUser, billingId);
            } catch (err) {
              renderAlert(
                alertAnchor,
                "danger",
                err.message || "Failed to remove attachment.",
              );
            }
          },
        );
      });
    });

    const addBtn = document.getElementById("add-attachment-btn");
    if (addBtn) {
      addBtn.addEventListener("click", async () => {
        const fileInput = document.getElementById("add-attachment-input");
        const file = fileInput.files[0];
        if (!file) return;
        addBtn.disabled = true;
        addBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
        try {
          const fd = new FormData();
          fd.append("file", file);
          await Api.billing.uploadAttachment(billingId, fd);
          await renderDetails(container, currentUser, billingId);
        } catch (err) {
          renderAlert(
            alertAnchor,
            "danger",
            err.message || "Failed to upload attachment.",
          );
          addBtn.disabled = false;
          addBtn.innerHTML = "Upload";
        }
      });
    }
  }
}

async function renderEditForm(
  bodyEl,
  alertAnchor,
  container,
  currentUser,
  bill,
  items,
  attachments,
  billingId,
) {
  let clientsData = [];
  try {
    clientsData = await Api.clients.list();
  } catch (e) {}

  bodyEl.innerHTML = `
    <form id="billing-edit-form" novalidate>
      ${sectionCard(
        "",
        "Warehouse Header Details (Current Bill Only)",
        `
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label small fw-semibold text-muted">Company Legal Name</label>
            <input type="text" id="edit-wh-company-name-input" class="form-control bg-light" value="${escapeHtml(bill.wh_company_name || currentUser.company_name || "")}">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-semibold text-muted">GSTIN / UIN</label>
            <input type="text" id="edit-wh-gstin-input" class="form-control bg-light" value="${escapeHtml(bill.wh_gstin || currentUser.gstin || "")}">
          </div>
          <div class="col-md-12">
            <label class="form-label small fw-semibold text-muted">Address</label>
            <input type="text" id="edit-wh-address-input" class="form-control bg-light" value="${escapeHtml(bill.wh_address || currentUser.address || "")}">
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">FSSAI NO</label>
            <input type="text" id="edit-wh-fssai-input" class="form-control bg-light" value="${escapeHtml(bill.wh_fssai || "")}" placeholder="e.g. 13617012000235">
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Bank Name & A/c No.</label>
            <input type="text" id="edit-wh-bank-input" class="form-control bg-light" value="${escapeHtml(bill.wh_bank || "")}">
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Branch & IFSC Code</label>
            <input type="text" id="edit-wh-ifsc-input" class="form-control bg-light" value="${escapeHtml(bill.wh_ifsc || "")}">
          </div>
        </div>
      `,
      )}

      ${sectionCard(
        "",
        "Buyer (Bill To) - Prefilled from Client DB",
        `
        <div class="row g-3 mb-3">
          <div class="col-md-12">
            <label class="form-label small fw-semibold text-muted">Select Client *</label>
            <select id="edit-client-select-input" class="form-select bg-light" required>
              <option value="">Select a client...</option>
              ${clientsData
                .filter((c) => c.status === "active" || c.id === bill.client_id)
                .map(
                  (c) =>
                    `<option value="${c.id}" ${c.id === bill.client_id ? "selected" : ""}>${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`,
                )
                .join("")}
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label small fw-semibold text-muted">Buyer Name</label>
            <input type="text" id="edit-buyer-name-input" class="form-control bg-light" value="${escapeHtml(bill.buyer_name || "")}">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-semibold text-muted">Buyer GSTIN / UIN</label>
            <input type="text" id="edit-buyer-gstin-input" class="form-control bg-light" value="${escapeHtml(bill.buyer_gstin || "")}">
          </div>
          <div class="col-md-12">
            <label class="form-label small fw-semibold text-muted">Buyer Address</label>
            <input type="text" id="edit-buyer-address-input" class="form-control bg-light" value="${escapeHtml(bill.buyer_address || "")}">
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Contact Person</label>
            <input type="text" id="edit-buyer-contact-input" class="form-control bg-light" value="${escapeHtml(bill.buyer_contact || "")}">
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Phone</label>
            <input type="text" id="edit-buyer-phone-input" class="form-control bg-light" value="${escapeHtml(bill.buyer_phone || "")}">
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Email</label>
            <input type="email" id="edit-buyer-email-input" class="form-control bg-light" value="${escapeHtml(bill.buyer_email || "")}">
          </div>
        </div>
      `,
      )}

      ${sectionCard(
        "",
        "Invoice Information",
        `
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Bill Number *</label>
            <input type="text" id="edit-bill-number-input" class="form-control bg-light" value="${escapeHtml(bill.bill_number)}" required>
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Invoice Date *</label>
            <input type="date" id="edit-invoice-date-input" class="form-control bg-light" value="${bill.invoice_date || ""}" required>
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Due Date / Terms</label>
            <input type="text" id="edit-due-date-input" class="form-control bg-light" value="${escapeHtml(bill.due_date || "")}">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-semibold text-muted">Delivery Note / Reference No. & Date</label>
            <input type="text" id="edit-reference-number-input" class="form-control bg-light" value="${escapeHtml(bill.reference_number || "")}">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-semibold text-muted">Other References (Billing Month)</label>
            <input type="text" id="edit-other-ref-input" class="form-control bg-light" value="${escapeHtml(bill.other_ref || "")}">
          </div>
        </div>
      `,
      )}

      ${sectionCard(
        "",
        "Billing Period",
        `
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label small fw-semibold text-muted">From Date</label>
            <input type="date" id="edit-period-from-input" class="form-control bg-light" value="${bill.billing_period_from || ""}">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-semibold text-muted">To Date</label>
            <input type="date" id="edit-period-to-input" class="form-control bg-light" value="${bill.billing_period_to || ""}">
          </div>
        </div>
      `,
      )}

      ${sectionCard(
        "",
        "Description of Goods & Services (Main Items & Sub-Descriptions)",
        `
        <div id="edit-main-items-container"></div>
        <button type="button" id="edit-add-main-item-btn" class="btn btn-outline-primary btn-sm fw-semibold mt-2">
          <i class="bi bi-plus-lg me-1"></i> Add Main Item Category
        </button>
      `,
      )}

      ${sectionCard(
        "",
        "Summary",
        `
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Subtotal</label>
            <input type="number" step="0.01" id="edit-subtotal-input" class="form-control bg-light fw-bold" value="${bill.subtotal ?? 0}" readonly>
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Total CGST Amount</label>
            <input type="number" step="0.01" id="edit-cgst-amount-input" class="form-control bg-light" value="${bill.cgst_amount ?? 0}" readonly>
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Total SGST Amount</label>
            <input type="number" step="0.01" id="edit-sgst-amount-input" class="form-control bg-light" value="${bill.sgst_amount ?? 0}" readonly>
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold text-muted">Round Off (+ / -)</label>
            <input type="number" step="0.01" id="edit-roundoff-input" class="form-control bg-light" value="${bill.round_off ?? 0}">
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold text-muted">Discount</label>
            <input type="number" step="0.01" id="edit-discount-input" class="form-control bg-light" value="${bill.discount ?? 0}">
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold text-muted">Other Charges</label>
            <input type="number" step="0.01" id="edit-other-charges-input" class="form-control bg-light" value="${bill.other_charges ?? 0}">
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold text-muted">Grand Total</label>
            <input type="number" step="0.01" id="edit-grand-total-input" class="form-control bg-light fw-bold fs-5 text-primary" value="${bill.grand_total ?? 0}" readonly>
          </div>
        </div>
      `,
      )}

      ${sectionCard(
        "",
        "Notes",
        `
        <textarea id="edit-notes-input" class="form-control bg-light" rows="3">${escapeHtml(bill.notes || "")}</textarea>
      `,
      )}

      <div class="text-end mb-5">
        <button type="button" id="edit-cancel-btn" class="btn btn-outline-secondary px-4 me-2">Cancel</button>
        <button type="submit" id="edit-save-btn" class="btn btn-primary px-4 fw-semibold shadow-sm">
          <i class="bi bi-check-circle me-2"></i> Save Changes
        </button>
      </div>
    </form>
  `;

  const editClientSelect = document.getElementById("edit-client-select-input");
  const editMainContainer = document.getElementById(
    "edit-main-items-container",
  );

  editClientSelect.addEventListener("change", () => {
    const selectedId = editClientSelect.value;
    const client = clientsData.find((c) => c.id === selectedId);
    if (client) {
      document.getElementById("edit-buyer-name-input").value =
        client.name || "";
      document.getElementById("edit-buyer-gstin-input").value =
        client.gstin || "";
      document.getElementById("edit-buyer-address-input").value =
        client.address || "";
      document.getElementById("edit-buyer-contact-input").value =
        client.contact_person || "";
      document.getElementById("edit-buyer-phone-input").value =
        client.phone || "";
      document.getElementById("edit-buyer-email-input").value =
        client.email || "";
    }
  });

  let editMainItemCount = 0;

  function createEditMainItemCard(prefill = null) {
    editMainItemCount++;
    const cardId = `edit-main-item-${editMainItemCount}`;
    const card = document.createElement("div");
    card.className = "card border mb-3 shadow-none main-item-card";
    card.id = cardId;

    const taxRate = prefill ? prefill.tax_rate : 18;

    card.innerHTML = `
      <div class="card-header bg-light d-flex justify-content-between align-items-center py-2">
        <span class="fw-bold text-dark small"><i class="bi bi-folder-fill text-primary me-2"></i>Item Category #${editMainItemCount}</span>
        <button type="button" class="btn btn-sm btn-outline-danger remove-main-item-btn"><i class="bi bi-trash me-1"></i>Remove</button>
      </div>
      <div class="card-body p-3">
        <div class="row g-2 mb-3">
          <div class="col-md-6">
            <label class="form-label extra-small fw-semibold text-muted">Main Description *</label>
            <input type="text" class="form-control form-control-sm main-desc-input" value="${escapeHtml(prefill ? prefill.main_description || prefill.description : "")}" required>
          </div>
          <div class="col-md-3">
            <label class="form-label extra-small fw-semibold text-muted">HSN/SAC Code (Manual) *</label>
            <input type="text" class="form-control form-control-sm hsn-sac-input" value="${escapeHtml(prefill ? prefill.hsn_sac : "")}" required>
          </div>
          <div class="col-md-3">
            <label class="form-label extra-small fw-semibold text-muted">GST Tax Rate *</label>
            <select class="form-select form-select-sm tax-rate-select">
              <option value="18" ${taxRate == 18 ? "selected" : ""}>18% (9% CGST + 9% SGST)</option>
              <option value="12" ${taxRate == 12 ? "selected" : ""}>12% (6% CGST + 6% SGST)</option>
              <option value="5"  ${taxRate == 5 ? "selected" : ""}>5% (2.5% CGST + 2.5% SGST)</option>
              <option value="0"  ${taxRate == 0 ? "selected" : ""}>0% (Exempted)</option>
            </select>
          </div>
        </div>

        <div class="small fw-semibold text-secondary mb-2">Sub-Descriptions / Line Breakdowns</div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-2">
            <thead class="table-light extra-small text-uppercase text-secondary">
              <tr>
                <th style="min-width:200px;">Sub-Description Detail</th>
                <th style="width:90px;">Quantity</th>
                <th style="width:80px;">Unit</th>
                <th style="width:90px;">Rate</th>
                <th style="width:110px;">Amount</th>
                <th style="width:40px;"></th>
              </tr>
            </thead>
            <tbody class="sub-items-body"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center">
          <button type="button" class="btn btn-light btn-sm border text-muted add-sub-item-btn">
            <i class="bi bi-plus-lg me-1"></i> Add Sub-Description
          </button>
          <div class="small fw-bold">Main Item Total: ₹<span class="main-item-total-display">0.00</span></div>
        </div>
      </div>
    `;

    const subBody = card.querySelector(".sub-items-body");

    card
      .querySelector(".remove-main-item-btn")
      .addEventListener("click", () => {
        if (editMainContainer.children.length > 1) {
          card.remove();
          recalculateEditFinancials();
        }
      });

    card
      .querySelector(".add-sub-item-btn")
      .addEventListener("click", () => addEditSubItemRow(subBody));
    card
      .querySelector(".tax-rate-select")
      .addEventListener("change", recalculateEditFinancials);

    editMainContainer.appendChild(card);

    if (prefill && prefill.sub_items && prefill.sub_items.length > 0) {
      prefill.sub_items.forEach((sub) => addEditSubItemRow(subBody, sub));
    } else {
      addEditSubItemRow(subBody);
    }
  }

  function addEditSubItemRow(tbody, prefill = null) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="form-control form-control-sm sub-desc-input" value="${prefill ? escapeHtml(prefill.sub_description || "") : ""}"></td>
      <td><input type="number" step="any" class="form-control form-control-sm sub-qty-input" value="${prefill && prefill.quantity !== null && prefill.quantity !== undefined ? prefill.quantity : ""}"></td>
      <td><input type="text" class="form-control form-control-sm sub-unit-input" value="${prefill ? escapeHtml(prefill.unit || "") : ""}"></td>
      <td><input type="number" step="any" class="form-control form-control-sm sub-rate-input" value="${prefill && prefill.rate !== null && prefill.rate !== undefined ? prefill.rate : ""}"></td>
      <td><input type="number" step="any" class="form-control form-control-sm sub-amount-input" value="${prefill && prefill.amount !== null && prefill.amount !== undefined ? prefill.amount : ""}"></td>
      <td><button type="button" class="btn btn-sm btn-outline-danger remove-sub-row-btn"><i class="bi bi-x"></i></button></td>
    `;

    tr.querySelector(".remove-sub-row-btn").addEventListener("click", () => {
      if (tbody.children.length > 1) {
        tr.remove();
        recalculateEditFinancials();
      }
    });

    const qtyIn = tr.querySelector(".sub-qty-input");
    const rateIn = tr.querySelector(".sub-rate-input");
    const amtIn = tr.querySelector(".sub-amount-input");

    const autoCalcSubAmount = () => {
      const q = parseFloat(qtyIn.value);
      const r = parseFloat(rateIn.value);
      if (!isNaN(q) && !isNaN(r)) {
        amtIn.value = (q * r).toFixed(2);
      }
      recalculateEditFinancials();
    };

    qtyIn.addEventListener("input", autoCalcSubAmount);
    rateIn.addEventListener("input", autoCalcSubAmount);
    amtIn.addEventListener("input", recalculateEditFinancials);

    tbody.appendChild(tr);
  }

  function recalculateEditFinancials() {
    let grandSubtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;

    editMainContainer.querySelectorAll(".main-item-card").forEach((card) => {
      let cardSubtotal = 0;
      card.querySelectorAll(".sub-amount-input").forEach((amtIn) => {
        const val = parseFloat(amtIn.value);
        if (!isNaN(val)) cardSubtotal += val;
      });

      card.querySelector(".main-item-total-display").textContent =
        cardSubtotal.toFixed(2);
      grandSubtotal += cardSubtotal;

      const taxRate =
        parseFloat(card.querySelector(".tax-rate-select").value) || 0;
      const cgstRate = taxRate / 2;
      const sgstRate = taxRate / 2;

      totalCgst += (cardSubtotal * cgstRate) / 100;
      totalSgst += (cardSubtotal * sgstRate) / 100;
    });

    document.getElementById("edit-subtotal-input").value =
      grandSubtotal.toFixed(2);
    document.getElementById("edit-cgst-amount-input").value =
      totalCgst.toFixed(2);
    document.getElementById("edit-sgst-amount-input").value =
      totalSgst.toFixed(2);

    const roundoff =
      parseFloat(document.getElementById("edit-roundoff-input").value) || 0;
    const discount =
      parseFloat(document.getElementById("edit-discount-input").value) || 0;
    const otherCharges =
      parseFloat(document.getElementById("edit-other-charges-input").value) ||
      0;

    const grandTotal =
      grandSubtotal +
      totalCgst +
      totalSgst +
      roundoff +
      otherCharges -
      discount;
    document.getElementById("edit-grand-total-input").value =
      grandTotal.toFixed(2);
  }

  if (!items || items.length === 0) {
    createEditMainItemCard();
  } else {
    items.forEach((it) => createEditMainItemCard(it));
  }

  document
    .getElementById("edit-add-main-item-btn")
    .addEventListener("click", () => createEditMainItemCard());
  document
    .getElementById("edit-roundoff-input")
    .addEventListener("input", recalculateEditFinancials);
  document
    .getElementById("edit-discount-input")
    .addEventListener("input", recalculateEditFinancials);
  document
    .getElementById("edit-other-charges-input")
    .addEventListener("input", recalculateEditFinancials);

  document
    .getElementById("edit-cancel-btn")
    .addEventListener("click", () =>
      renderDetails(container, currentUser, billingId, false),
    );

  document
    .getElementById("billing-edit-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      alertAnchor.innerHTML = "";

      const client_id = editClientSelect.value;
      const bill_number = document
        .getElementById("edit-bill-number-input")
        .value.trim();
      const invoice_date = document.getElementById(
        "edit-invoice-date-input",
      ).value;

      if (!client_id || !bill_number || !invoice_date) {
        renderAlert(
          alertAnchor,
          "warning",
          "Client, Bill Number, and Invoice Date are mandatory.",
        );
        return;
      }

      const updatedItems = [];
      let validationFailed = false;

      editMainContainer.querySelectorAll(".main-item-card").forEach((card) => {
        const main_description = card
          .querySelector(".main-desc-input")
          .value.trim();
        const hsn_sac = card.querySelector(".hsn-sac-input").value.trim();
        const tax_rate = card.querySelector(".tax-rate-select").value;

        if (!main_description || !hsn_sac) {
          validationFailed = true;
          return;
        }

        const sub_items = [];
        let mainSum = 0;

        card.querySelectorAll("tbody.sub-items-body tr").forEach((tr) => {
          const sub_description = tr
            .querySelector(".sub-desc-input")
            .value.trim();
          const quantity = tr.querySelector(".sub-qty-input").value;
          const unit = tr.querySelector(".sub-unit-input").value.trim();
          const rate = tr.querySelector(".sub-rate-input").value;
          const amount = tr.querySelector(".sub-amount-input").value;

          const numAmt = amount === "" ? 0 : Number(amount);
          mainSum += numAmt;

          if (sub_description || quantity || rate || amount) {
            sub_items.push({
              sub_description,
              quantity: quantity === "" ? null : Number(quantity),
              unit: unit || null,
              rate: rate === "" ? null : Number(rate),
              amount: amount === "" ? null : numAmt,
            });
          }
        });

        updatedItems.push({
          main_description,
          hsn_sac,
          tax_rate: Number(tax_rate),
          amount: mainSum,
          sub_items,
        });
      });

      if (validationFailed) {
        renderAlert(
          alertAnchor,
          "warning",
          "Every main category must have a Description and HSN/SAC code.",
        );
        return;
      }

      const payload = {
        client_id,
        bill_number,
        invoice_date,
        due_date:
          document.getElementById("edit-due-date-input").value.trim() || null,
        billing_period_from:
          document.getElementById("edit-period-from-input").value || null,
        billing_period_to:
          document.getElementById("edit-period-to-input").value || null,
        reference_number:
          document.getElementById("edit-reference-number-input").value.trim() ||
          null,
        subtotal: document.getElementById("edit-subtotal-input").value || 0,
        tax: (
          parseFloat(
            document.getElementById("edit-cgst-amount-input").value || 0,
          ) +
          parseFloat(
            document.getElementById("edit-sgst-amount-input").value || 0,
          )
        ).toFixed(2),
        discount: document.getElementById("edit-discount-input").value || 0,
        other_charges:
          document.getElementById("edit-other-charges-input").value || 0,
        grand_total:
          document.getElementById("edit-grand-total-input").value || 0,
        notes: document.getElementById("edit-notes-input").value.trim() || null,
        items: updatedItems,
        wh_company_name: document
          .getElementById("edit-wh-company-name-input")
          .value.trim(),
        wh_gstin: document.getElementById("edit-wh-gstin-input").value.trim(),
        wh_address: document
          .getElementById("edit-wh-address-input")
          .value.trim(),
        wh_fssai: document.getElementById("edit-wh-fssai-input").value.trim(),
        wh_bank: document.getElementById("edit-wh-bank-input").value.trim(),
        wh_ifsc: document.getElementById("edit-wh-ifsc-input").value.trim(),
        buyer_name: document
          .getElementById("edit-buyer-name-input")
          .value.trim(),
        buyer_gstin: document
          .getElementById("edit-buyer-gstin-input")
          .value.trim(),
        buyer_address: document
          .getElementById("edit-buyer-address-input")
          .value.trim(),
        buyer_contact: document
          .getElementById("edit-buyer-contact-input")
          .value.trim(),
        buyer_phone: document
          .getElementById("edit-buyer-phone-input")
          .value.trim(),
        buyer_email: document
          .getElementById("edit-buyer-email-input")
          .value.trim(),
        other_ref: document.getElementById("edit-other-ref-input").value.trim(),
        cgst_amount:
          document.getElementById("edit-cgst-amount-input").value || 0,
        sgst_amount:
          document.getElementById("edit-sgst-amount-input").value || 0,
        round_off: document.getElementById("edit-roundoff-input").value || 0,
      };

      const saveBtn = document.getElementById("edit-save-btn");
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Saving...`;

      try {
        await Api.billing.update(billingId, payload);
        await renderDetails(container, currentUser, billingId, false);
      } catch (err) {
        renderAlert(
          alertAnchor,
          "danger",
          err.message || "Failed to save changes.",
        );
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="bi bi-check-circle me-2"></i> Save Changes`;
      }
    });
}

// =========================================================================
// SHARED HELPERS
// =========================================================================

function sectionCard(badge, title, innerHtml) {
  return `
    <div class="card shadow-sm border-0 rounded-3 mb-3">
      <div class="card-header bg-white py-3 border-bottom">
        <h6 class="fw-bold text-secondary mb-0">${badge ? `<span class="badge bg-primary me-2">${badge}</span>` : ""}${title}</h6>
      </div>
      <div class="card-body p-4">${innerHtml}</div>
    </div>
  `;
}

function confirmAction(title, message, onConfirm) {
  const modalId = "billing-confirm-modal";
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();

  const modalHtml = `
    <div class="modal fade" id="${modalId}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title fw-bold">${escapeHtml(title)}</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body small text-muted">${escapeHtml(message)}</div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
            <button type="button" id="billing-confirm-action-btn" class="btn btn-danger btn-sm">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const modalEl = document.getElementById(modalId);
  const modal = new bootstrap.Modal(modalEl);

  document
    .getElementById("billing-confirm-action-btn")
    .addEventListener("click", async () => {
      modal.hide();
      await onConfirm();
    });

  modalEl.addEventListener("hidden.bs.modal", () => modalEl.remove());
  modal.show();
}

function renderAlert(anchor, type, message) {
  const icons = {
    danger: "bi-exclamation-octagon-fill",
    warning: "bi-exclamation-triangle-fill",
    success: "bi-check-circle-fill",
  };
  anchor.innerHTML = `
    <div class="alert alert-${type} border-0 shadow-sm d-flex align-items-center small py-3 px-3 rounded-3 mb-4" role="alert">
      <i class="bi ${icons[type]} me-2 fs-5 flex-shrink-0"></i>
      <div>${escapeHtml(message)}</div>
    </div>
  `;
}

function formatMoney(val) {
  const num = Number(val) || 0;
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =========================================================================
// FULL TALLY PDF GENERATION — CLIENT-SIDE (MULTI-PAGE & HSN AGGREGATION SUPPORT)
// =========================================================================
function loadJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
  if (jsPdfLoadPromise) return jsPdfLoadPromise;

  jsPdfLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load PDF generator library."));
    document.head.appendChild(script);
  });
  return jsPdfLoadPromise;
}

async function generateInvoicePdf(currentUser, bill, items) {
  await loadJsPdf();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const boxWidth = pageWidth - margin * 2;

  let y = margin;

  function addHeaderAndOuterBox() {
    doc.setLineWidth(0.75);
    doc.setDrawColor(0);
    doc.rect(margin, margin, boxWidth, pageHeight - margin * 2);

    y = margin;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TAX INVOICE", pageWidth / 2, y + 12, { align: "center" });
    y += 18;
    doc.line(margin, y, pageWidth - margin, y);
  }

  addHeaderAndOuterBox();

  // Header Left Block (Warehouse Info)
  const midX = margin + 260;
  const headerTopY = y;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const compName =
    bill.wh_company_name ||
    currentUser.company_name ||
    "FOSTER COLD STORAGE PVT LTD";
  doc.text(compName, margin + 6, y + 12);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  let leftY = y + 23;
  if (bill.wh_address || currentUser.address) {
    const addrLines = doc.splitTextToSize(
      bill.wh_address || currentUser.address,
      245,
    );
    doc.text(addrLines, margin + 6, leftY);
    leftY += addrLines.length * 9;
  }
  doc.text(`FSSAI NO: ${bill.wh_fssai || "13617012000235"}`, margin + 6, leftY);
  leftY += 10;
  doc.text(
    `GSTIN/UIN: ${bill.wh_gstin || currentUser.gstin || "36AAACF5063D2ZY"}`,
    margin + 6,
    leftY,
  );
  leftY += 10;
  doc.text(`State Name: Telangana, Code: 36`, margin + 6, leftY);
  leftY += 10;

  // Header Right Block Grid
  doc.line(midX, headerTopY, midX, headerTopY + 120);

  let rightY = headerTopY;
  const metaCols = [midX, midX + 130];

  doc.text(`Invoice No.`, metaCols[0] + 4, rightY + 10);
  doc.setFont("helvetica", "bold");
  doc.text(`${bill.bill_number}`, metaCols[0] + 4, rightY + 19);
  doc.setFont("helvetica", "normal");

  doc.text(`Dated`, metaCols[1] + 4, rightY + 10);
  doc.setFont("helvetica", "bold");
  doc.text(`${bill.invoice_date || "—"}`, metaCols[1] + 4, rightY + 19);
  doc.setFont("helvetica", "normal");

  rightY += 24;
  doc.line(midX, rightY, pageWidth - margin, rightY);

  doc.text(`Delivery Note`, metaCols[0] + 4, rightY + 10);
  doc.text(`Mode/Terms of Payment`, metaCols[1] + 4, rightY + 10);
  doc.setFont("helvetica", "bold");
  doc.text(`${bill.due_date || "30 Days"}`, metaCols[1] + 4, rightY + 19);
  doc.setFont("helvetica", "normal");

  rightY += 24;
  doc.line(midX, rightY, pageWidth - margin, rightY);

  doc.text(`Reference No. & Date.`, metaCols[0] + 4, rightY + 10);
  doc.text(`${bill.reference_number || "—"}`, metaCols[0] + 4, rightY + 19);

  doc.text(`Other References`, metaCols[1] + 4, rightY + 10);
  doc.text(
    `${bill.other_ref || bill.notes || "—"}`,
    metaCols[1] + 4,
    rightY + 19,
  );

  rightY += 24;
  doc.line(midX, rightY, pageWidth - margin, rightY);

  doc.text(`Buyer's Order No.`, metaCols[0] + 4, rightY + 10);
  doc.text(`Dated`, metaCols[1] + 4, rightY + 10);

  rightY += 24;
  doc.line(midX, rightY, pageWidth - margin, rightY);

  doc.text(`Dispatch Doc No.`, metaCols[0] + 4, rightY + 10);
  doc.text(`Delivery Note Date`, metaCols[1] + 4, rightY + 10);

  y = headerTopY + 120;
  doc.line(margin, y, pageWidth - margin, y);

  // Buyer Block Section
  const buyerTopY = y;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("Buyer (Bill to)", margin + 6, y + 10);
  doc.setFont("helvetica", "bold");
  doc.text(`${bill.buyer_name || bill.client_name || ""}`, margin + 6, y + 20);
  doc.setFont("helvetica", "normal");

  let buyerY = y + 29;
  const buyerAddr = bill.buyer_address || bill.client_address;
  if (buyerAddr) {
    const clientAddrLines = doc.splitTextToSize(buyerAddr, 245);
    doc.text(clientAddrLines, margin + 6, buyerY);
    buyerY += clientAddrLines.length * 9;
  }
  doc.text(
    `GSTIN/UIN: ${bill.buyer_gstin || bill.client_gstin || "—"}`,
    margin + 6,
    buyerY,
  );
  buyerY += 10;
  doc.text(`State Name: Telangana, Code: 36`, margin + 6, buyerY);
  buyerY += 10;

  // Buyer Right Block
  doc.line(midX, buyerTopY, midX, buyerTopY + 50);
  doc.text(`Dispatched through`, metaCols[0] + 4, buyerTopY + 10);
  doc.text(`Destination`, metaCols[1] + 4, buyerTopY + 10);
  doc.line(midX, buyerTopY + 25, pageWidth - margin, buyerTopY + 25);
  doc.text(`Terms of Delivery`, metaCols[0] + 4, buyerTopY + 35);

  y = buyerTopY + 50;
  doc.line(margin, y, pageWidth - margin, y);

  // Tally Table Columns Definitions
  const cols = [
    { name: "SI No", x: margin, width: 22, align: "center" },
    {
      name: "Description of Goods and Services",
      x: margin + 22,
      width: 218,
      align: "left",
    },
    { name: "HSN/SAC", x: margin + 240, width: 52, align: "center" },
    { name: "MRP/Marginal", x: margin + 292, width: 45, align: "center" },
    { name: "Quantity", x: margin + 337, width: 50, align: "right" },
    { name: "Rate", x: margin + 387, width: 55, align: "right" },
    { name: "per", x: margin + 442, width: 32, align: "center" },
    { name: "Amount", x: margin + 474, width: boxWidth - 474, align: "right" },
  ];

  let tableHeaderTopY = y;

  function drawTableHeaders() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    cols.forEach((col, idx) => {
      let textX = col.x + col.width / 2;
      if (col.align === "left") textX = col.x + 4;
      if (col.align === "right") textX = col.x + col.width - 4;

      if (col.name.includes("Description")) {
        doc.text("Description of", col.x + 4, tableHeaderTopY + 9);
        doc.text("Goods and Services", col.x + 4, tableHeaderTopY + 18);
      } else {
        doc.text(col.name, textX, tableHeaderTopY + 14, { align: col.align });
      }

      if (idx > 0) {
        doc.line(col.x, tableHeaderTopY, col.x, tableHeaderTopY + 24);
      }
    });

    y = tableHeaderTopY + 24;
    doc.line(margin, y, pageWidth - margin, y);
  }

  drawTableHeaders();

  let tableContentTopY = y;
  let itemIndex = 1;

  // Track dynamic HSN tax map
  const hsnMap = {};

  items.forEach((item) => {
    // Page Break Check for Main Item
    if (y > pageHeight - margin - 150) {
      cols.forEach((col, idx) => {
        if (idx > 0) doc.line(col.x, tableContentTopY - 24, col.x, y);
      });
      doc.addPage();
      addHeaderAndOuterBox();
      tableHeaderTopY = y;
      drawTableHeaders();
      tableContentTopY = y;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);

    doc.text(String(itemIndex++), cols[0].x + cols[0].width / 2, y + 10, {
      align: "center",
    });
    doc.text(item.main_description || item.description, cols[1].x + 4, y + 10);
    doc.text(item.hsn_sac || "992971", cols[2].x + cols[2].width / 2, y + 10, {
      align: "center",
    });

    if (item.amount) {
      doc.text(
        formatMoney(item.amount),
        cols[7].x + cols[7].width - 4,
        y + 10,
        { align: "right" },
      );
    }

    // Accumulate HSN Tax Map
    const hsnCode = item.hsn_sac || "992971";
    const taxRate = Number(item.tax_rate) || 18;
    const itemAmount = Number(item.amount) || 0;

    if (!hsnMap[hsnCode]) {
      hsnMap[hsnCode] = { taxable: 0, taxRate };
    }
    hsnMap[hsnCode].taxable += itemAmount;

    y += 14;

    // Sub-descriptions rendering
    if (item.sub_items && item.sub_items.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);

      item.sub_items.forEach((sub) => {
        if (y > pageHeight - margin - 150) {
          cols.forEach((col, idx) => {
            if (idx > 0) doc.line(col.x, tableContentTopY - 24, col.x, y);
          });
          doc.addPage();
          addHeaderAndOuterBox();
          tableHeaderTopY = y;
          drawTableHeaders();
          tableContentTopY = y;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
        }

        if (sub.sub_description) {
          doc.text(sub.sub_description, cols[1].x + 4, y + 9);
          y += 11;
        }

        // Auto-generated breakdown text line
        if (sub.quantity && sub.rate) {
          const breakdownStr = `${sub.quantity} ${sub.unit || "Units"} X ${sub.rate}/- Per ${sub.unit || "Unit"}`;
          doc.text(breakdownStr, cols[1].x + 4, y + 9);
          y += 11;
        }
      });
    }

    y += 4;
  });

  if (y > pageHeight - margin - 180) {
    cols.forEach((col, idx) => {
      if (idx > 0) doc.line(col.x, tableContentTopY - 24, col.x, y);
    });
    doc.addPage();
    addHeaderAndOuterBox();
    tableHeaderTopY = y;
    drawTableHeaders();
    tableContentTopY = y;
  }

  // Calculate totals and CGST / SGST breakdown
  const subtotal = Number(bill.subtotal) || 0;

  let totalCgst = 0;
  let totalSgst = 0;

  Object.keys(hsnMap).forEach((code) => {
    const entry = hsnMap[code];
    const cgst = (entry.taxable * (entry.taxRate / 2)) / 100;
    const sgst = (entry.taxable * (entry.taxRate / 2)) / 100;
    entry.cgst = cgst;
    entry.sgst = sgst;
    totalCgst += cgst;
    totalSgst += sgst;
  });

  const roundoff = Number(bill.round_off) || 0;
  const grandTotal =
    Number(bill.grand_total) || subtotal + totalCgst + totalSgst + roundoff;

  // Render Subtotal & Taxes right under items list
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);

  doc.text("CGST", cols[1].x + 4, y + 10);
  doc.text(formatMoney(totalCgst), cols[7].x + cols[7].width - 4, y + 10, {
    align: "right",
  });
  y += 12;

  doc.text("SGST", cols[1].x + 4, y + 10);
  doc.text(formatMoney(totalSgst), cols[7].x + cols[7].width - 4, y + 10, {
    align: "right",
  });
  y += 12;

  if (roundoff !== 0) {
    doc.text("Less: ROUND OFF", cols[1].x + 4, y + 10);
    doc.text(
      `${roundoff < 0 ? "(-)" : ""}${formatMoney(Math.abs(roundoff))}`,
      cols[7].x + cols[7].width - 4,
      y + 10,
      { align: "right" },
    );
    y += 12;
  }

  let tableBottomY = Math.max(y + 10, margin + 450);

  if (tableBottomY > pageHeight - margin - 220) {
    tableBottomY = y + 10;
  }

  cols.forEach((col, idx) => {
    if (idx > 0) {
      doc.line(col.x, tableContentTopY - 24, col.x, tableBottomY);
    }
  });

  y = tableBottomY;
  doc.line(margin, y, pageWidth - margin, y);

  // Grand Total Row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Total", cols[1].x + 4, y + 12);
  doc.text(
    `Rs. ${formatMoney(grandTotal)}`,
    cols[7].x + cols[7].width - 4,
    y + 12,
    { align: "right" },
  );
  y += 16;
  doc.line(margin, y, pageWidth - margin, y);

  // Amount Chargeable in Words
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("Amount Chargeable (in words)", margin + 6, y + 10);
  doc.setFont("helvetica", "bold");
  doc.text(numberToWordsIndian(grandTotal), margin + 6, y + 20);
  y += 28;
  doc.line(margin, y, pageWidth - margin, y);

  // HSN/SAC Tax Summary Table
  const hsnTableTopY = y;
  const hsnCols = [
    { name: "HSN/SAC", x: margin, width: 70, align: "center" },
    { name: "Taxable Value", x: margin + 70, width: 85, align: "right" },
    { name: "CGST Rate", x: margin + 155, width: 55, align: "center" },
    { name: "CGST Amount", x: margin + 210, width: 80, align: "right" },
    { name: "SGST Rate", x: margin + 290, width: 55, align: "center" },
    { name: "SGST Amount", x: margin + 345, width: 80, align: "right" },
    {
      name: "Total Tax Amount",
      x: margin + 425,
      width: boxWidth - 425,
      align: "right",
    },
  ];

  doc.setFont("helvetica", "bold");
  hsnCols.forEach((col, idx) => {
    let textX = col.x + col.width / 2;
    if (col.align === "right") textX = col.x + col.width - 4;
    doc.text(col.name, textX, hsnTableTopY + 10, { align: col.align });
    if (idx > 0) doc.line(col.x, hsnTableTopY, col.x, hsnTableTopY + 30);
  });

  y += 14;
  doc.line(margin, y, pageWidth - margin, y);

  let hsnTaxSum = 0;
  doc.setFont("helvetica", "normal");

  Object.keys(hsnMap).forEach((code) => {
    const row = hsnMap[code];
    const rowTaxTotal = row.cgst + row.sgst;
    hsnTaxSum += rowTaxTotal;

    doc.text(code, hsnCols[0].x + hsnCols[0].width / 2, y + 10, {
      align: "center",
    });
    doc.text(
      formatMoney(row.taxable),
      hsnCols[1].x + hsnCols[1].width - 4,
      y + 10,
      { align: "right" },
    );
    doc.text(
      `${row.taxRate / 2}%`,
      hsnCols[2].x + hsnCols[2].width / 2,
      y + 10,
      { align: "center" },
    );
    doc.text(
      formatMoney(row.cgst),
      hsnCols[3].x + hsnCols[3].width - 4,
      y + 10,
      { align: "right" },
    );
    doc.text(
      `${row.taxRate / 2}%`,
      hsnCols[4].x + hsnCols[4].width / 2,
      y + 10,
      { align: "center" },
    );
    doc.text(
      formatMoney(row.sgst),
      hsnCols[5].x + hsnCols[5].width - 4,
      y + 10,
      { align: "right" },
    );
    doc.text(
      formatMoney(rowTaxTotal),
      hsnCols[6].x + hsnCols[6].width - 4,
      y + 10,
      { align: "right" },
    );

    y += 14;
  });

  doc.line(margin, y, pageWidth - margin, y);

  // HSN Table Total Summary
  doc.setFont("helvetica", "bold");
  doc.text("Total", hsnCols[0].x + 6, y + 10);
  doc.text(formatMoney(subtotal), hsnCols[1].x + hsnCols[1].width - 4, y + 10, {
    align: "right",
  });
  doc.text(
    formatMoney(totalCgst),
    hsnCols[3].x + hsnCols[3].width - 4,
    y + 10,
    { align: "right" },
  );
  doc.text(
    formatMoney(totalSgst),
    hsnCols[5].x + hsnCols[5].width - 4,
    y + 10,
    { align: "right" },
  );
  doc.text(
    formatMoney(hsnTaxSum),
    hsnCols[6].x + hsnCols[6].width - 4,
    y + 10,
    { align: "right" },
  );

  y += 14;
  doc.line(margin, y, pageWidth - margin, y);

  // Tax Amount in Words
  doc.setFont("helvetica", "normal");
  doc.text("Tax Amount (in words):", margin + 6, y + 10);
  doc.setFont("helvetica", "bold");
  doc.text(numberToWordsIndian(hsnTaxSum), margin + 100, y + 10);

  y += 16;
  doc.line(margin, y, pageWidth - margin, y);

  if (y > pageHeight - margin - 80) {
    doc.addPage();
    addHeaderAndOuterBox();
  }

  // Legal Declarations & Bank Details Footer
  const footerTopY = y;
  doc.setFont("helvetica", "normal");
  doc.text(`Company's PAN: AAACF5063D`, margin + 6, footerTopY + 10);
  doc.setFont("helvetica", "bold");
  doc.text("Declaration", margin + 6, footerTopY + 20);
  doc.setFont("helvetica", "normal");
  doc.text(
    "We declare that this invoice shows the actual price of the goods",
    margin + 6,
    footerTopY + 30,
  );
  doc.text(
    "described and that all particulars are true and correct.",
    margin + 6,
    footerTopY + 40,
  );

  doc.setFont("helvetica", "bold");
  doc.text("Company's Bank Details", margin + 6, footerTopY + 54);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Bank Name: ${bill.wh_bank || "KOTAK MAHINDRA BANK 05532970000011"}`,
    margin + 6,
    footerTopY + 64,
  );
  doc.text(
    `Branch & IFS Code: ${bill.wh_ifsc || "Dilsukhnagar & KKBK0007446"}`,
    margin + 6,
    footerTopY + 74,
  );

  // Authorised Signatory Block
  const sigX = pageWidth - margin - 200;
  doc.line(sigX, footerTopY, sigX, pageHeight - margin);

  doc.text(
    `for ${bill.wh_company_name || currentUser.company_name || "FOSTER COLD STORAGE PVT LTD"}`,
    sigX + 10,
    footerTopY + 14,
  );
  doc.setFont("helvetica", "italic");
  doc.text(
    "This is a Computer Generated Invoice",
    margin + 6,
    pageHeight - margin - 8,
  );

  doc.setFont("helvetica", "normal");
  doc.text("Authorised Signatory", sigX + 50, pageHeight - margin - 8);

  doc.save(`${bill.bill_number || "Invoice"}.pdf`);
}
