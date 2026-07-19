import { Api } from "../../api.js";

/**
 * Renders and wires up the Client Master management view component.
 * @param {HTMLElement} container - The target injection workspace viewport canvas frame
 * @param {Object} currentUser - The active authenticated user session profile metadata
 */
export async function render(container, currentUser) {
  // Gating Check: Operational Security Gating
  if (currentUser.role !== "admin") {
    container.innerHTML = `
      <div class="container-fluid p-0 p-sm-4">
        <div class="alert alert-danger border-0 shadow-sm" role="alert">
          <h5 class="fw-bold"><i class="bi bi-shield-lock-fill me-2"></i>Access Denied</h5>
          <p class="mb-0 small">Operational Security Gating: Only Warehouse Administrators can access the Client Master configurations register.</p>
        </div>
      </div>
    `;
    return;
  }

  // Render layout frame matching the usersView.js design language
  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in">
      
      <div class="d-flex justify-content-between align-items-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-briefcase text-primary me-2"></i>Client Master Register
          </h3>
          <p class="text-muted small mb-0">Onboard warehouse client profiles, assign local tracking codes, and manage account portfolios.</p>
        </div>
      </div>

      <div id="clients-alert-anchor" class="px-3 px-sm-0"></div>

      <div class="row g-0 g-sm-4">
        
        <!-- Left Column: Registration Card Panel -->
        <div class="col-12 col-lg-4 mb-4 mb-lg-0">
          <div class="card shadow-sm border-0 rounded-0 rounded-sm-3">
            <div class="card-header bg-white py-3 border-bottom">
              <h5 class="fw-bold text-secondary mb-0"><i class="bi bi-plus-circle me-2"></i>Onboard New Client</h5>
            </div>
            <div class="card-body p-4">
              <form id="create-client-form" novalidate>
                
                <div class="mb-3">
                  <label for="cli-name" class="form-label small fw-semibold text-muted">Client Name *</label>
                  <input type="text" id="cli-name" class="form-control bg-light" placeholder="e.g. Acme Corporation" required>
                </div>

                <div class="mb-3">
                  <label for="cli-code" class="form-label small fw-semibold text-muted">Unique Client Code *</label>
                  <input type="text" id="cli-code" class="form-control bg-light text-uppercase" placeholder="e.g. ACMECORP" required>
                  <div class="form-text text-muted extra-small" style="font-size:0.7rem;">Alphanumeric identifier unique across this warehouse space.</div>
                </div>

                <div class="mb-3">
                  <label for="cli-gstin" class="form-label small fw-semibold text-muted">GSTIN (Optional)</label>
                  <input type="text" id="cli-gstin" class="form-control bg-light text-uppercase" placeholder="15-digit GST identification number">
                </div>

                <div class="mb-3">
                  <label for="cli-contact" class="form-label small fw-semibold text-muted">Contact Person</label>
                  <input type="text" id="cli-contact" class="form-control bg-light" placeholder="Primary point of contact name">
                </div>

                <div class="mb-3">
                  <label for="cli-phone" class="form-label small fw-semibold text-muted">Phone Number</label>
                  <input type="tel" id="cli-phone" class="form-control bg-light" placeholder="e.g. +91 98765 43210">
                </div>

                <div class="mb-4">
                  <label for="cli-email" class="form-label small fw-semibold text-muted">Email Address</label>
                  <input type="email" id="cli-email" class="form-control bg-light" placeholder="e.g. logistics@acme.com">
                </div>

                <button type="submit" id="submit-cli-btn" class="btn btn-primary w-100 py-2 fw-semibold shadow-sm d-flex align-items-center justify-content-center">
                  <i class="bi bi-file-earmark-plus me-2"></i> Complete Client Onboarding
                </button>

              </form>
            </div>
          </div>
        </div>

        <!-- Right Column: Live Master Summary Table -->
        <div class="col-12 col-lg-8">
          <div class="card shadow-sm border-0 rounded-0 rounded-sm-3">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h5 class="fw-bold text-secondary mb-0"><i class="bi bi-collection me-2"></i>Active Portfolio Profiles</h5>
              <button id="refresh-clients-btn" class="btn btn-light btn-sm border text-muted shadow-sm" type="button">
                <i class="bi bi-arrow-clockwise"></i> Refresh
              </button>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-hover align-middle mb-0 text-nowrap">
                  <thead class="table-light text-secondary small text-uppercase" style="font-size: 0.75rem;">
                    <tr>
                      <th class="ps-4 py-3">Client Profile</th>
                      <th class="py-3">Unique Code</th>
                      <th class="py-3">GSTIN Reference</th>
                      <th class="pe-4 py-3 text-end">Status</th>
                    </tr>
                  </thead>
                  <tbody id="clients-matrix-table-body">
                    <tr>
                      <td colspan="4" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                        Querying client register configurations...
                      </td>
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

  // Grab form component layout definitions
  const alertAnchor = document.getElementById("clients-alert-anchor");
  const createForm = document.getElementById("create-client-form");
  const nameIn = document.getElementById("cli-name");
  const codeIn = document.getElementById("cli-code");
  const gstinIn = document.getElementById("cli-gstin");
  const contactIn = document.getElementById("cli-contact");
  const phoneIn = document.getElementById("cli-phone");
  const emailIn = document.getElementById("cli-email");
  const submitBtn = document.getElementById("submit-cli-btn");
  const refreshBtn = document.getElementById("refresh-clients-btn");

  // Load baseline collection
  await loadClientRegistry();

  // Handle onboarding forms submission events loop
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertAnchor.innerHTML = "";

    const name = nameIn.value.trim();
    const code = codeIn.value.trim().toUpperCase();
    const gstin = gstinIn.value.trim().toUpperCase();
    const contact_person = contactIn.value.trim();
    const phone = phoneIn.value.trim();
    const email = emailIn.value.trim();

    if (!name || !code) {
      renderAlert(
        alertAnchor,
        "warning",
        "Validation failure: Complete all mandatory fields before submitting profiles.",
      );
      return;
    }

    setLoadingState(true);

    try {
      const result = await Api.clients.create({
        name,
        code,
        gstin: gstin || null,
        contact_person: contact_person || null,
        phone: phone || null,
        email: email || null,
      });

      renderAlert(
        alertAnchor,
        "success",
        result.message || "Client setup executed successfully.",
      );
      createForm.reset();
      await loadClientRegistry();
    } catch (err) {
      renderAlert(
        alertAnchor,
        "danger",
        err.message ||
          "Ecosystem connector processing fault encountered during creation workflows.",
      );
    } finally {
      setLoadingState(false);
    }
  });

  refreshBtn.onclick = async () => {
    alertAnchor.innerHTML = "";
    await loadClientRegistry();
  };

  async function loadClientRegistry() {
    const tbody = document.getElementById("clients-matrix-table-body");
    if (!tbody) return;

    try {
      const clientsList = await Api.clients.list();

      if (!clientsList || clientsList.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted small">
              <i class="bi bi-briefcase-fill display-6 d-block mb-2 text-secondary"></i>No client configurations found for this tenant footprint.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = "";
      clientsList.forEach((row) => {
        const isAct = row.status === "active";
        const badge = isAct
          ? `<span class="badge bg-success bg-opacity-10 text-success rounded-pill px-2 border border-success border-opacity-20"><i class="bi bi-patch-check-fill me-1"></i>Active</span>`
          : `<span class="badge bg-secondary bg-opacity-10 text-secondary rounded-pill px-2 border border-secondary border-opacity-20"><i class="bi bi-slash-circle-fill me-1"></i>Inactive</span>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="ps-4 fw-bold text-dark">
            <i class="bi bi-building text-muted me-2"></i>${escapeHtml(row.name)}
          </td>
          <td><span class="badge bg-light text-dark border font-monospace px-2">${escapeHtml(row.code)}</span></td>
          <td class="text-muted font-monospace small">${row.gstin ? escapeHtml(row.gstin) : "—"}</td>
          <td class="pe-4 text-end">${badge}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-danger py-4 small fw-bold">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>Failed to synchronise client registers layouts: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function setLoadingState(isL) {
    if (isL) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Creating Client...`;
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="bi bi-file-earmark-plus me-2"></i> Complete Client Onboarding`;
    }
  }

  function renderAlert(anchor, bType, text) {
    const icons = {
      danger: "bi-exclamation-octagon-fill",
      warning: "bi-exclamation-triangle-fill",
      success: "bi-check-circle-fill",
    };
    anchor.innerHTML = `
      <div class="alert alert-${bType} border-0 shadow-sm d-flex align-items-center small py-3 px-3 rounded-3 mb-4 mx-3 mx-sm-0" role="alert">
        <i class="bi ${icons[bType]} me-2 fs-5 flex-shrink-0"></i>
        <div>${text}</div>
      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
