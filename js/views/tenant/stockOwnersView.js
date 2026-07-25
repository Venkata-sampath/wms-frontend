import { Api } from "../../api.js";

export async function render(container, currentUser) {
  if (currentUser.role !== "admin") {
    container.innerHTML = `
      <div class="container-fluid p-0 p-sm-4">
        <div class="alert alert-danger border-0 shadow-sm" role="alert">
          <h5 class="fw-bold"><i class="bi bi-shield-lock-fill me-2"></i>Access Denied</h5>
          <p class="mb-0 small">Operational Security Gating: Only Warehouse Administrators can access Stock Owner configurations.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in">
      <div class="d-flex justify-content-between align-items-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-person-badge text-primary me-2"></i>Stock Owners Master
          </h3>
          <p class="text-muted small mb-0">Manage inventory stock owners and multi-supplier profiles mapped to parent clients.</p>
        </div>
      </div>

      <div id="so-alert-anchor" class="px-3 px-sm-0"></div>

      <div class="row g-0 g-sm-4">
        <!-- Form Column -->
        <div class="col-12 col-lg-4 mb-4 mb-lg-0">
          <div class="card shadow-sm border-0 rounded-0 rounded-sm-3">
            <div class="card-header bg-white py-3 border-bottom">
              <h5 class="fw-bold text-secondary mb-0"><i class="bi bi-plus-circle me-2"></i>Create Stock Owner</h5>
            </div>
            <div class="card-body p-4">
              <form id="create-so-form" novalidate>
                
                <div class="mb-3">
                  <label for="so-client-id" class="form-label small fw-semibold text-muted">Parent Client *</label>
                  <select id="so-client-id" class="form-select bg-light" required>
                    <option value="" selected disabled>-- Select Parent Client --</option>
                  </select>
                </div>

                <div class="mb-3">
                  <label for="so-name" class="form-label small fw-semibold text-muted">Stock Owner Name *</label>
                  <input type="text" id="so-name" class="form-control bg-light" placeholder="e.g. Britannia Supplier A" required>
                </div>

                <div class="mb-3">
                  <label for="so-code" class="form-label small fw-semibold text-muted">Unique Code *</label>
                  <input type="text" id="so-code" class="form-control bg-light text-uppercase" placeholder="e.g. BRIT-SUP-A" required>
                </div>

                <div class="mb-3">
                  <label for="so-gstin" class="form-label small fw-semibold text-muted">GSTIN</label>
                  <input type="text" id="so-gstin" class="form-control bg-light text-uppercase" placeholder="15-digit GSTIN">
                </div>

                <div class="mb-3">
                  <label for="so-contact" class="form-label small fw-semibold text-muted">Contact Person</label>
                  <input type="text" id="so-contact" class="form-control bg-light" placeholder="Contact person name">
                </div>

                <div class="mb-3">
                  <label for="so-phone" class="form-label small fw-semibold text-muted">Phone Number</label>
                  <input type="tel" id="so-phone" class="form-control bg-light" placeholder="e.g. +91 98765 43210">
                </div>

                <div class="mb-4">
                  <label for="so-email" class="form-label small fw-semibold text-muted">Email Address</label>
                  <input type="email" id="so-email" class="form-control bg-light" placeholder="e.g. supplier@domain.com">
                </div>

                <button type="submit" id="submit-so-btn" class="btn btn-primary w-100 py-2 fw-semibold shadow-sm">
                  <i class="bi bi-file-earmark-plus me-2"></i> Create Stock Owner
                </button>
              </form>
            </div>
          </div>
        </div>

        <!-- Table Column -->
        <div class="col-12 col-lg-8">
          <div class="card shadow-sm border-0 rounded-0 rounded-sm-3">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h5 class="fw-bold text-secondary mb-0"><i class="bi bi-collection me-2"></i>Stock Owner Directory</h5>
              <button id="refresh-so-btn" class="btn btn-light btn-sm border text-muted shadow-sm" type="button">
                <i class="bi bi-arrow-clockwise"></i> Refresh
              </button>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-hover align-middle mb-0 text-nowrap">
                  <thead class="table-light text-secondary small text-uppercase" style="font-size: 0.75rem;">
                    <tr>
                      <th class="ps-4 py-3">Stock Owner</th>
                      <th class="py-3">Client</th>
                      <th class="py-3">Code</th>
                      <th class="py-3">GSTIN</th>
                      <th class="pe-4 py-3 text-end">Status</th>
                    </tr>
                  </thead>
                  <tbody id="so-matrix-table-body">
                    <tr>
                      <td colspan="5" class="text-center py-5 text-muted">Loading register...</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  let allClients = [];
  const alertAnchor = document.getElementById("so-alert-anchor");
  const clientSelect = document.getElementById("so-client-id");
  const form = document.getElementById("create-so-form");

  await Promise.all([loadClients(), loadStockOwners()]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertAnchor.innerHTML = "";

    const client_id = clientSelect.value;
    const name = document.getElementById("so-name").value.trim();
    const code = document.getElementById("so-code").value.trim().toUpperCase();
    const gstin = document
      .getElementById("so-gstin")
      .value.trim()
      .toUpperCase();
    const contact_person = document.getElementById("so-contact").value.trim();
    const phone = document.getElementById("so-phone").value.trim();
    const email = document.getElementById("so-email").value.trim();

    if (!client_id || !name || !code) {
      renderAlert(
        "warning",
        "Client, Stock Owner Name, and Unique Code are mandatory.",
      );
      return;
    }

    try {
      const res = await Api.stockOwners.create({
        client_id,
        name,
        code,
        gstin: gstin || null,
        contact_person: contact_person || null,
        phone: phone || null,
        email: email || null,
      });
      renderAlert(
        "success",
        res.message || "Stock Owner created successfully.",
      );
      form.reset();
      await loadClients();
      await loadStockOwners();
    } catch (err) {
      renderAlert("danger", err.message);
    }
  });

  document.getElementById("refresh-so-btn").onclick = loadStockOwners;

  async function loadClients() {
    try {
      allClients = await Api.clients.list();
      clientSelect.innerHTML = `<option value="" selected disabled>-- Select Parent Client --</option>`;

      allClients.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.code})`;
        clientSelect.appendChild(opt);
      });
    } catch (err) {
      clientSelect.innerHTML = `<option value="" disabled>Error loading clients</option>`;
    }
  }

  async function loadStockOwners() {
    const tbody = document.getElementById("so-matrix-table-body");
    try {
      const list = await Api.stockOwners.list();
      if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No Stock Owners registered.</td></tr>`;
        return;
      }
      tbody.innerHTML = list
        .map(
          (so) => `
        <tr>
          <td class="ps-4 fw-bold text-dark"><i class="bi bi-building text-muted me-2"></i>${escapeHtml(so.name)}</td>
          <td><span class="badge bg-light text-dark border">${escapeHtml(so.client_name)}</span></td>
          <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(so.code)}</span></td>
          <td class="text-muted font-monospace small">${so.gstin ? escapeHtml(so.gstin) : "—"}</td>
          <td class="pe-4 text-end">
            <span class="badge bg-success bg-opacity-10 text-success rounded-pill px-2 border border-success border-opacity-20">
              <i class="bi bi-patch-check-fill me-1"></i>Active
            </span>
          </td>
        </tr>
      `,
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Error loading data: ${err.message}</td></tr>`;
    }
  }

  function renderAlert(bType, text) {
    alertAnchor.innerHTML = `
      <div class="alert alert-${bType} border-0 shadow-sm d-flex align-items-center small py-3 px-3 rounded-3 mb-4" role="alert">
        <i class="bi bi-exclamation-circle-fill me-2 fs-5"></i>
        <div>${text}</div>
      </div>
    `;
  }

  function escapeHtml(str) {
    return str
      ? String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
      : "";
  }
}
