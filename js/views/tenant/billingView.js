import { Api } from "../../api.js";

// =========================================================================
// BILLING MODULE — single-file view (List, Create, Details+Edit).
// Manual entry only. Nothing here calculates charges automatically.
// Sub-screens are swapped into the same container directly rather than
// through app.js routing, so there's only one sidebar entry: "Billing".
// =========================================================================

let jsPdfLoadPromise = null;

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
    // Non-fatal: filter just stays empty if this fails
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
  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in" style="max-width: 1000px; margin: 0 auto;">

      <div class="d-flex justify-content-between align-items-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3"><i class="bi bi-receipt-cutoff text-primary me-2"></i>Create Bill</h3>
          <p class="text-muted small mb-0">Every field below is entered manually. Nothing is auto-calculated.</p>
        </div>
        <button id="billing-back-btn" class="btn btn-outline-secondary btn-sm fw-semibold shadow-sm">
          <i class="bi bi-arrow-left me-1"></i> Back to List
        </button>
      </div>

      <div id="billing-form-alert-anchor" class="px-3 px-sm-0"></div>

      <form id="billing-create-form" novalidate class="px-3 px-sm-0">

        ${sectionCard(
          "1",
          "Invoice Information",
          `
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Bill Number *</label>
              <input type="text" id="bill-number-input" class="form-control bg-light" required>
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Invoice Date *</label>
              <input type="date" id="invoice-date-input" class="form-control bg-light" required>
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Due Date</label>
              <input type="date" id="due-date-input" class="form-control bg-light">
            </div>
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-muted">Reference Number</label>
              <input type="text" id="reference-number-input" class="form-control bg-light">
            </div>
          </div>
        `,
        )}

        ${sectionCard(
          "2",
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
          "3",
          "Client",
          `
          <label class="form-label small fw-semibold text-muted">Select Client *</label>
          <select id="client-select-input" class="form-select bg-light" required>
            <option value="">Loading clients...</option>
          </select>
        `,
        )}

        ${sectionCard(
          "4",
          "Charges",
          `
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-2" id="charges-table">
              <thead class="table-light small text-uppercase text-secondary">
                <tr>
                  <th style="min-width:220px;">Description</th>
                  <th style="width:100px;">Quantity</th>
                  <th style="width:100px;">Unit</th>
                  <th style="width:120px;">Rate</th>
                  <th style="width:120px;">Amount</th>
                  <th style="width:40px;"></th>
                </tr>
              </thead>
              <tbody id="charges-table-body"></tbody>
            </table>
          </div>
          <button type="button" id="add-charge-row-btn" class="btn btn-light btn-sm border text-muted">
            <i class="bi bi-plus-lg me-1"></i> Add Row
          </button>
        `,
        )}

        ${sectionCard(
          "5",
          "Summary",
          `
          <div class="row g-3">
            <div class="col-md-3">
              <label class="form-label small fw-semibold text-muted">Subtotal</label>
              <input type="number" step="0.01" id="subtotal-input" class="form-control bg-light">
            </div>
            <div class="col-md-3">
              <label class="form-label small fw-semibold text-muted">Tax</label>
              <input type="number" step="0.01" id="tax-input" class="form-control bg-light">
            </div>
            <div class="col-md-3">
              <label class="form-label small fw-semibold text-muted">Discount</label>
              <input type="number" step="0.01" id="discount-input" class="form-control bg-light">
            </div>
            <div class="col-md-3">
              <label class="form-label small fw-semibold text-muted">Other Charges</label>
              <input type="number" step="0.01" id="other-charges-input" class="form-control bg-light">
            </div>
            <div class="col-md-4">
              <label class="form-label small fw-semibold text-muted">Grand Total</label>
              <input type="number" step="0.01" id="grand-total-input" class="form-control bg-light fw-bold">
            </div>
          </div>
        `,
        )}

        ${sectionCard(
          "6",
          "Notes",
          `
          <textarea id="notes-input" class="form-control bg-light" rows="4"></textarea>
        `,
        )}

        ${sectionCard(
          "7",
          "Attachments (Optional)",
          `
          <input type="file" id="attachments-input" class="form-control bg-light" multiple>
          <div class="form-text text-muted extra-small" style="font-size:0.75rem;">Uploaded after the bill is created. You can add more later from Bill Details.</div>
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
  const chargesBody = document.getElementById("charges-table-body");
  const addRowBtn = document.getElementById("add-charge-row-btn");
  const submitBtn = document.getElementById("submit-bill-btn");
  const attachmentsInput = document.getElementById("attachments-input");

  document
    .getElementById("billing-back-btn")
    .addEventListener("click", () => renderList(container, currentUser));
  document
    .getElementById("cancel-create-btn")
    .addEventListener("click", () => renderList(container, currentUser));

  try {
    const clients = await Api.clients.list();
    const activeClients = clients.filter((c) => c.status === "active");
    clientSelect.innerHTML =
      `<option value="">Select a client...</option>` +
      activeClients
        .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join("");
  } catch (err) {
    clientSelect.innerHTML = `<option value="">Failed to load clients</option>`;
  }

  addRowBtn.addEventListener("click", () => addChargeRow(chargesBody));
  addChargeRow(chargesBody);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertAnchor.innerHTML = "";

    const items = collectChargeRows(chargesBody);
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
    if (items.length === 0) {
      renderAlert(
        alertAnchor,
        "warning",
        "At least one billing item is required.",
      );
      return;
    }

    const payload = {
      client_id,
      bill_number,
      invoice_date,
      due_date: document.getElementById("due-date-input").value || null,
      billing_period_from:
        document.getElementById("period-from-input").value || null,
      billing_period_to:
        document.getElementById("period-to-input").value || null,
      reference_number:
        document.getElementById("reference-number-input").value.trim() || null,
      subtotal: document.getElementById("subtotal-input").value || 0,
      tax: document.getElementById("tax-input").value || 0,
      discount: document.getElementById("discount-input").value || 0,
      other_charges: document.getElementById("other-charges-input").value || 0,
      grand_total: document.getElementById("grand-total-input").value || 0,
      notes: document.getElementById("notes-input").value.trim() || null,
      items,
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
            // Non-fatal — bill is already created; surface but don't block navigation
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
            <i class="bi bi-download me-1"></i> Download Invoice
          </button>
          ${
            !isPaid
              ? `
            <button id="edit-bill-btn" class="btn btn-outline-secondary btn-sm fw-semibold shadow-sm">
              <i class="bi bi-pencil me-1"></i> ${editMode ? "Cancel Edit" : "Edit"}
            </button>
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
    document.getElementById("edit-bill-btn").addEventListener("click", () => {
      renderDetails(container, currentUser, billingId, !editMode);
    });

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

  if (editMode) {
    renderEditForm(
      bodyEl,
      alertAnchor,
      container,
      currentUser,
      bill,
      items,
      attachments,
      billingId,
    );
  } else {
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
        <div class="col-md-4"><span class="text-muted d-block">Due Date</span><span class="fw-semibold">${escapeHtml(bill.due_date || "—")}</span></div>
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
      "Client",
      `
      <div class="small">
        <div class="fw-semibold">${escapeHtml(bill.client_name)} <span class="text-muted">(${escapeHtml(bill.client_code || "")})</span></div>
        ${bill.client_gstin ? `<div class="text-muted">GSTIN: ${escapeHtml(bill.client_gstin)}</div>` : ""}
      </div>
    `,
    )}

    ${sectionCard(
      "",
      "Charges",
      `
      <div class="table-responsive">
        <table class="table table-sm mb-0">
          <thead class="table-light small text-uppercase text-secondary">
            <tr><th>Description</th><th>Quantity</th><th>Unit</th><th>Rate</th><th>Amount</th></tr>
          </thead>
          <tbody>
            ${items
              .map(
                (it) => `
              <tr>
                <td>${escapeHtml(it.description)}</td>
                <td>${it.quantity ?? "—"}</td>
                <td>${escapeHtml(it.unit || "—")}</td>
                <td>${it.rate ?? "—"}</td>
                <td>${it.amount ?? "—"}</td>
              </tr>
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
        <div class="col-md-3"><span class="text-muted d-block">Tax</span><span class="fw-semibold">${formatMoney(bill.tax)}</span></div>
        <div class="col-md-3"><span class="text-muted d-block">Discount</span><span class="fw-semibold">${formatMoney(bill.discount)}</span></div>
        <div class="col-md-3"><span class="text-muted d-block">Other Charges</span><span class="fw-semibold">${formatMoney(bill.other_charges)}</span></div>
        <div class="col-md-4"><span class="text-muted d-block">Grand Total</span><span class="fw-bold fs-5">${formatMoney(bill.grand_total)}</span></div>
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
  bodyEl.innerHTML = `
    <form id="billing-edit-form" novalidate>
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
            <label class="form-label small fw-semibold text-muted">Due Date</label>
            <input type="date" id="edit-due-date-input" class="form-control bg-light" value="${bill.due_date || ""}">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-semibold text-muted">Reference Number</label>
            <input type="text" id="edit-reference-number-input" class="form-control bg-light" value="${escapeHtml(bill.reference_number || "")}">
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
        "Client",
        `
        <label class="form-label small fw-semibold text-muted">Select Client *</label>
        <select id="edit-client-select-input" class="form-select bg-light" required>
          <option value="">Loading clients...</option>
        </select>
      `,
      )}

      ${sectionCard(
        "",
        "Charges",
        `
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-2" id="edit-charges-table">
            <thead class="table-light small text-uppercase text-secondary">
              <tr>
                <th style="min-width:220px;">Description</th>
                <th style="width:100px;">Quantity</th>
                <th style="width:100px;">Unit</th>
                <th style="width:120px;">Rate</th>
                <th style="width:120px;">Amount</th>
                <th style="width:40px;"></th>
              </tr>
            </thead>
            <tbody id="edit-charges-table-body"></tbody>
          </table>
        </div>
        <button type="button" id="edit-add-charge-row-btn" class="btn btn-light btn-sm border text-muted">
          <i class="bi bi-plus-lg me-1"></i> Add Row
        </button>
      `,
      )}

      ${sectionCard(
        "",
        "Summary",
        `
        <div class="row g-3">
          <div class="col-md-3">
            <label class="form-label small fw-semibold text-muted">Subtotal</label>
            <input type="number" step="0.01" id="edit-subtotal-input" class="form-control bg-light" value="${bill.subtotal ?? 0}">
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold text-muted">Tax</label>
            <input type="number" step="0.01" id="edit-tax-input" class="form-control bg-light" value="${bill.tax ?? 0}">
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold text-muted">Discount</label>
            <input type="number" step="0.01" id="edit-discount-input" class="form-control bg-light" value="${bill.discount ?? 0}">
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold text-muted">Other Charges</label>
            <input type="number" step="0.01" id="edit-other-charges-input" class="form-control bg-light" value="${bill.other_charges ?? 0}">
          </div>
          <div class="col-md-4">
            <label class="form-label small fw-semibold text-muted">Grand Total</label>
            <input type="number" step="0.01" id="edit-grand-total-input" class="form-control bg-light fw-bold" value="${bill.grand_total ?? 0}">
          </div>
        </div>
      `,
      )}

      ${sectionCard(
        "",
        "Notes",
        `
        <textarea id="edit-notes-input" class="form-control bg-light" rows="4">${escapeHtml(bill.notes || "")}</textarea>
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
  const editChargesBody = document.getElementById("edit-charges-table-body");

  try {
    const clients = await Api.clients.list();
    const activeClients = clients.filter(
      (c) => c.status === "active" || c.id === bill.client_id,
    );
    editClientSelect.innerHTML = activeClients
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === bill.client_id ? "selected" : ""}>${escapeHtml(c.name)}</option>`,
      )
      .join("");
  } catch (err) {
    editClientSelect.innerHTML = `<option value="${bill.client_id}">${escapeHtml(bill.client_name)}</option>`;
  }

  if (items.length === 0) {
    addChargeRow(editChargesBody);
  } else {
    items.forEach((it) => addChargeRow(editChargesBody, it));
  }

  document
    .getElementById("edit-add-charge-row-btn")
    .addEventListener("click", () => addChargeRow(editChargesBody));
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

      const editItems = collectChargeRows(editChargesBody);
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
      if (editItems.length === 0) {
        renderAlert(
          alertAnchor,
          "warning",
          "At least one billing item is required.",
        );
        return;
      }

      const payload = {
        client_id,
        bill_number,
        invoice_date,
        due_date: document.getElementById("edit-due-date-input").value || null,
        billing_period_from:
          document.getElementById("edit-period-from-input").value || null,
        billing_period_to:
          document.getElementById("edit-period-to-input").value || null,
        reference_number:
          document.getElementById("edit-reference-number-input").value.trim() ||
          null,
        subtotal: document.getElementById("edit-subtotal-input").value || 0,
        tax: document.getElementById("edit-tax-input").value || 0,
        discount: document.getElementById("edit-discount-input").value || 0,
        other_charges:
          document.getElementById("edit-other-charges-input").value || 0,
        grand_total:
          document.getElementById("edit-grand-total-input").value || 0,
        notes: document.getElementById("edit-notes-input").value.trim() || null,
        items: editItems,
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

function addChargeRow(tbody, prefill = null) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="form-control form-control-sm charge-description" value="${prefill ? escapeHtml(prefill.description || "") : ""}"></td>
    <td><input type="number" step="any" class="form-control form-control-sm charge-quantity" value="${prefill && prefill.quantity !== null && prefill.quantity !== undefined ? prefill.quantity : ""}"></td>
    <td><input type="text" class="form-control form-control-sm charge-unit" value="${prefill ? escapeHtml(prefill.unit || "") : ""}"></td>
    <td><input type="number" step="any" class="form-control form-control-sm charge-rate" value="${prefill && prefill.rate !== null && prefill.rate !== undefined ? prefill.rate : ""}"></td>
    <td><input type="number" step="any" class="form-control form-control-sm charge-amount" value="${prefill && prefill.amount !== null && prefill.amount !== undefined ? prefill.amount : ""}"></td>
    <td><button type="button" class="btn btn-sm btn-outline-danger remove-charge-row-btn"><i class="bi bi-x"></i></button></td>
  `;
  tr.querySelector(".remove-charge-row-btn").addEventListener("click", () => {
    if (tbody.children.length > 1) tr.remove();
  });
  tbody.appendChild(tr);
}

function collectChargeRows(tbody) {
  const rows = [];
  tbody.querySelectorAll("tr").forEach((tr) => {
    const description = tr.querySelector(".charge-description").value.trim();
    const quantity = tr.querySelector(".charge-quantity").value;
    const unit = tr.querySelector(".charge-unit").value.trim();
    const rate = tr.querySelector(".charge-rate").value;
    const amount = tr.querySelector(".charge-amount").value;
    if (!description && !quantity && !unit && !rate && !amount) return; // skip fully empty rows
    rows.push({
      description,
      quantity: quantity === "" ? null : Number(quantity),
      unit: unit || null,
      rate: rate === "" ? null : Number(rate),
      amount: amount === "" ? null : Number(amount),
    });
  });
  return rows;
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
  return num.toLocaleString(undefined, {
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
// CLIENT-SIDE PDF GENERATION — nothing sent to or generated by the backend.
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
  const margin = 40;
  let y = 50;

  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text(currentUser.company_name || "Warehouse", margin, y);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  y += 16;
  if (currentUser.address) {
    doc.text(currentUser.address, margin, y);
    y += 12;
  }
  if (currentUser.gstin) {
    doc.text(`GSTIN: ${currentUser.gstin}`, margin, y);
    y += 12;
  }

  y += 10;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("INVOICE", margin, y);
  y += 20;

  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  const infoLines = [
    [
      `Invoice Number: ${bill.bill_number}`,
      `Invoice Date: ${bill.invoice_date || "—"}`,
    ],
    [
      `Due Date: ${bill.due_date || "—"}`,
      `Billing Period: ${bill.billing_period_from || "—"} to ${bill.billing_period_to || "—"}`,
    ],
  ];
  infoLines.forEach((pair) => {
    doc.text(pair[0], margin, y);
    doc.text(pair[1], margin + 260, y);
    y += 16;
  });

  y += 8;
  doc.setFont(undefined, "bold");
  doc.text("Bill To:", margin, y);
  doc.setFont(undefined, "normal");
  y += 14;
  doc.text(bill.client_name || "", margin, y);
  y += 14;
  if (bill.client_gstin) {
    doc.text(`GSTIN: ${bill.client_gstin}`, margin, y);
    y += 14;
  }

  y += 12;
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const colX = [margin, margin + 220, margin + 300, margin + 370, margin + 450];
  doc.setFont(undefined, "bold");
  doc.text("Description", colX[0], y);
  doc.text("Qty", colX[1], y);
  doc.text("Unit", colX[2], y);
  doc.text("Rate", colX[3], y);
  doc.text("Amount", colX[4], y);
  y += 8;
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;
  doc.setFont(undefined, "normal");

  items.forEach((it) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    doc.text(String(it.description || ""), colX[0], y, { maxWidth: 200 });
    doc.text(
      it.quantity !== null && it.quantity !== undefined
        ? String(it.quantity)
        : "—",
      colX[1],
      y,
    );
    doc.text(it.unit || "—", colX[2], y);
    doc.text(
      it.rate !== null && it.rate !== undefined ? String(it.rate) : "—",
      colX[3],
      y,
    );
    doc.text(
      it.amount !== null && it.amount !== undefined ? String(it.amount) : "—",
      colX[4],
      y,
    );
    y += 18;
  });

  y += 8;
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const summaryX = pageWidth - margin - 160;
  const summaryRows = [
    ["Subtotal", bill.subtotal],
    ["Tax", bill.tax],
    ["Discount", bill.discount],
    ["Other Charges", bill.other_charges],
  ];
  summaryRows.forEach(([label, val]) => {
    doc.text(label, summaryX, y);
    doc.text(formatMoney(val), pageWidth - margin - 10, y, { align: "right" });
    y += 16;
  });
  doc.setFont(undefined, "bold");
  doc.setFontSize(12);
  doc.text("Grand Total", summaryX, y);
  doc.text(formatMoney(bill.grand_total), pageWidth - margin - 10, y, {
    align: "right",
  });
  y += 30;

  if (bill.notes) {
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text("Notes:", margin, y);
    y += 14;
    doc.setFont(undefined, "normal");
    const splitNotes = doc.splitTextToSize(bill.notes, pageWidth - margin * 2);
    doc.text(splitNotes, margin, y);
    y += splitNotes.length * 12 + 20;
  }

  y = Math.max(y, doc.internal.pageSize.getHeight() - 100);
  doc.line(pageWidth - margin - 160, y, pageWidth - margin, y);
  doc.setFontSize(9);
  doc.text("Authorised Signature", pageWidth - margin - 160, y + 14);

  doc.save(`${bill.bill_number || "invoice"}.pdf`);
}
