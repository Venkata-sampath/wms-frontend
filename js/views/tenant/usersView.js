import { Api } from "../../api.js";

/**
 * Renders and wires up the Team Directory management view component.
 * @param {HTMLElement} container - The target injection workspace viewport canvas frame
 * @param {Object} currentUser - The active authenticated user session profile metadata
 */
export async function render(container, currentUser) {
  // Gating Check: Fallback safety if non-admin tries to force access this module
  if (currentUser.role !== "admin") {
    container.innerHTML = `
      <div class="container-fluid p-0 p-sm-4">
        <div class="alert alert-danger border-0 shadow-sm" role="alert">
          <h5 class="fw-bold"><i class="bi bi-shield-lock-fill me-2"></i>Access Denied</h5>
          <p class="mb-0 small">Operational Security Gating: Only Warehouse Administrators can access the Team Directory.</p>
        </div>
      </div>
    `;
    return;
  }

  // Draw core structural layout split framework instantly
  container.innerHTML = `
    <div class="container-fluid p-0 p-sm-4 animate-fade-in">
      
      <div class="d-flex justify-content-between align-items-center mt-3 mt-sm-0 mb-4 pb-2 px-3 px-sm-0 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1 fs-4 fs-sm-3">
            <i class="bi bi-people text-primary me-2"></i>Team Directory Control Panel
          </h3>
          <p class="text-muted small mb-0">Provision workforce operational identities and manage active system session tokens.</p>
        </div>
      </div>

      <div id="users-alert-anchor" class="px-3 px-sm-0"></div>

      <div class="row g-0 g-sm-4">
        
        <div class="col-12 col-lg-4 mb-4 mb-lg-0">
          <div class="card shadow-sm border-0 rounded-0 rounded-sm-3">
            <div class="card-header bg-white py-3 border-bottom">
              <h5 class="fw-bold text-secondary mb-0"><i class="bi bi-person-plus me-2"></i>Provision New Account</h5>
            </div>
            <div class="card-body p-4">
              <form id="create-operator-form" novalidate>
                
                <div class="mb-3">
                  <label for="op-username" class="form-label small fw-semibold text-muted">Username</label>
                  <div class="input-group">
                    <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-person"></i></span>
                    <input type="text" id="op-username" class="form-control bg-light border-start-0" placeholder="e.g. jsmith_wh1" required autocomplete="off">
                  </div>
                </div>

                <div class="mb-3">
                  <label for="op-password" class="form-label small fw-semibold text-muted">Password</label>
                  <div class="input-group">
                    <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-lock"></i></span>
                    <input type="password" id="op-password" class="form-control bg-light border-start-0" placeholder="Minimum 6 characters" required>
                  </div>
                </div>

                <div class="mb-4">
                  <label for="op-role" class="form-label small fw-semibold text-muted">Workspace Authorization Role</label>
                  <div class="input-group">
                    <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-shield-check"></i></span>
                    <select id="op-role" class="form-select bg-light border-start-0" required>
                      <option value="operator" selected>Warehouse Operator (Standard Access)</option>
                      <option value="admin">Warehouse Administrator (Full Workspace Control)</option>
                    </select>
                  </div>
                  <div class="form-text extra-small text-muted mt-1" style="font-size:0.75rem;">
                    Operators can manage shipments and inventory tasks but cannot access settings or directory catalogs.
                  </div>
                </div>

                <button type="submit" id="submit-op-btn" class="btn btn-primary w-100 py-2 fw-semibold shadow-sm d-flex align-items-center justify-content-center">
                  <i class="bi bi-user-plus-fill me-2"></i> Activate Account Identity
                </button>

              </form>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-8">
          <div class="card shadow-sm border-0 rounded-0 rounded-sm-3">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h5 class="fw-bold text-secondary mb-0"><i class="bi bi-person-workspace me-2"></i>Registered Workspace Identities</h5>
              <button id="refresh-users-btn" class="btn btn-light btn-sm border text-muted shadow-sm" type="button">
                <i class="bi bi-arrow-clockwise"></i> Sync
              </button>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-hover align-middle mb-0 text-nowrap">
                  <thead class="table-light text-secondary small text-uppercase" style="font-size: 0.75rem;">
                    <tr>
                      <th class="ps-4 py-3">Account Username</th>
                      <th class="py-3">Role Group</th>
                      <th class="py-3">Status Badge</th>
                      <th class="pe-4 py-3 text-end">Action Interface</th>
                    </tr>
                  </thead>
                  <tbody id="users-matrix-table-body">
                    <tr>
                      <td colspan="4" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                        Querying workspace registration records...
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

  // Capture Document Input Objects
  const alertAnchor = document.getElementById("users-alert-anchor");
  const createForm = document.getElementById("create-operator-form");
  const usernameInput = document.getElementById("op-username");
  const passwordInput = document.getElementById("op-password");
  const roleSelect = document.getElementById("op-role");
  const submitBtn = document.getElementById("submit-op-btn");
  const refreshBtn = document.getElementById("refresh-users-btn");

  // Initial Data Load
  await loadTeamRegistry();

  // Wire Event Hooks: Add Member Transaction
  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertAnchor.innerHTML = "";

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const role = roleSelect.value;

    if (!username || !password) {
      renderAlert(
        alertAnchor,
        "warning",
        "Validation failure: Complete all parameters before provisioning identities.",
      );
      return;
    }

    setLoadingState(true);

    try {
      // Execute pipeline delivery matching POST /api/auth/register-operator
      const result = await Api.users.create(username, password, role);
      renderAlert(
        alertAnchor,
        "success",
        result.message || "Account created successfully.",
      );
      createForm.reset();
      await loadTeamRegistry();
    } catch (err) {
      renderAlert(
        alertAnchor,
        "danger",
        err.message ||
          "Ecosystem connection error encountered during onboarding transaction.",
      );
    } finally {
      setLoadingState(false);
    }
  });

  // Wire Event Hooks: Manual Refresh
  refreshBtn.addEventListener("click", async () => {
    alertAnchor.innerHTML = "";
    await loadTeamRegistry();
  });

  /**
   * Orchestrates the GET list call and draws rows dynamically into the document table body canvas
   */
  async function loadTeamRegistry() {
    const tableBody = document.getElementById("users-matrix-table-body");
    if (!tableBody) return;

    try {
      const dataRows = await Api.users.list();

      if (!dataRows || dataRows.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted small">
              <i class="bi bi-person-fill-slash display-6 d-block mb-2 text-secondary"></i>No auxiliary operational users found.
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = "";

      dataRows.forEach((row) => {
        // Parse status layout properties (Note: is_active handles integers 1 or 0)
        const isActive = row.is_active === 1;
        const statusBadge = isActive
          ? `<span class="badge bg-success bg-opacity-10 text-success rounded-pill px-2 border border-success border-opacity-20"><i class="bi bi-patch-check-fill me-1"></i>Active</span>`
          : `<span class="badge bg-secondary bg-opacity-10 text-secondary rounded-pill px-2 border border-secondary border-opacity-20"><i class="bi bi-slash-circle-fill me-1"></i>Suspended</span>`;

        const actionBtnLabel = isActive ? "Suspend" : "Activate";
        const actionBtnClass = isActive
          ? "btn-outline-danger"
          : "btn-outline-success";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="ps-4 fw-bold text-dark">
            <i class="bi bi-person-circle text-muted me-2"></i>${escapeHtml(row.username)}
            ${row.id === currentUser.id ? '<span class="badge bg-light text-muted border ms-1 small extra-small">You</span>' : ""}
          </td>
          <td>
            <span class="badge bg-light text-dark border text-capitalize px-2">${escapeHtml(row.role.replace("_", " "))}</span>
          </td>
          <td>${statusBadge}</td>
          <td class="pe-4 text-end">
            <button class="btn btn-sm ${actionBtnClass} toggle-status-action-btn fw-semibold rounded-2 px-3 shadow-xs" 
                    data-user-id="${row.id}" 
                    data-active-state="${row.is_active}"
                    ${row.id === currentUser.id ? "disabled" : ""}>
              ${actionBtnLabel}
            </button>
          </td>
        `;

        // Wire Up contextual inline operational activity action listener
        const toggleBtn = tr.querySelector(".toggle-status-action-btn");
        if (toggleBtn) {
          toggleBtn.addEventListener("click", async () => {
            alertAnchor.innerHTML = "";
            toggleBtn.disabled = true;
            toggleBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status"></span>`;

            try {
              // Execute operational payload targeting POST /api/auth/toggle-user-status
              await Api.users.toggleStatus(row.id, row.is_active);
              await loadTeamRegistry();
            } catch (err) {
              renderAlert(
                alertAnchor,
                "danger",
                err.message ||
                  "Failed to update member status lifecycle states.",
              );
              toggleBtn.disabled = false;
              toggleBtn.innerHTML = actionBtnLabel;
            }
          });
        }

        tableBody.appendChild(tr);
      });
    } catch (err) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-danger py-4 small fw-bold">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>Failed to synchronise workforce directories: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function setLoadingState(isLoading) {
    if (isLoading) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Provisioning Account...`;
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="bi bi-user-plus-fill me-2"></i> Activate Account Identity`;
    }
  }

  function renderAlert(anchor, bootstrapType, message) {
    const iconMap = {
      danger: "bi-exclamation-octagon-fill",
      warning: "bi-exclamation-triangle-fill",
      success: "bi-check-circle-fill",
    };
    anchor.innerHTML = `
      <div class="alert alert-${bootstrapType} border-0 shadow-sm d-flex align-items-center small py-3 px-3 rounded-3 mb-4 mx-3 mx-sm-0" role="alert">
        <i class="bi ${iconMap[bootstrapType]} me-2 fs-5 flex-shrink-0"></i>
        <div>${message}</div>
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
