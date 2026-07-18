import { Api } from "../../api.js";
import { switchWorkspaceView } from "../../app.js";

/**
 * Renders and wires up the Tenant Creation Onboarding Wizard form
 * @param {HTMLElement} container - The target injection workspace viewport
 * @param {Object} user - The active authenticated user session profile
 */
export async function render(container, user) {
  container.innerHTML = `
    <div class="container-fluid p-0 animate-fade-in" style="max-width: 800px; margin: 0 auto;">
      
      <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
        <div>
          <h3 class="fw-bold text-dark mb-1"><i class="bi bi-building-plus me-2 text-primary"></i>Onboard New Warehouse Tenant</h3>
          <p class="text-muted small mb-0">Initialize isolated storage partitions and configure administrative root credentials.</p>
        </div>
        <button id="back-to-registry-btn" class="btn btn-outline-secondary btn-sm fw-semibold shadow-sm">
          <i class="bi bi-arrow-left me-1"></i> Cancel & Exit
        </button>
      </div>

      <div id="create-warehouse-alert-anchor"></div>

      <form id="onboard-tenant-form" novalidate>
        
        <div class="card shadow-sm border-0 rounded-3 mb-4">
          <div class="card-header bg-white py-3 border-bottom">
            <h5 class="fw-bold text-secondary mb-0 d-flex align-items-center">
              <span class="badge bg-primary me-2">1</span> Company Profile Details
            </h5>
          </div>
          <div class="card-body p-4">
            <div class="mb-2">
              <label for="company-name-input" class="form-label small fw-semibold text-muted">Legal Corporate Name</label>
              <div class="input-group">
                <span class="input-group-text bg-light text-muted"><i class="bi bi-briefcase"></i></span>
                <input 
                  type="text" 
                  id="company-name-input" 
                  class="form-control bg-light" 
                  placeholder="e.g., Nexus Logistics Global Pvt Ltd" 
                  required
                >
              </div>
              <div class="form-text text-muted extra-small" style="font-size:0.75rem;">
                This legal designation dictates tenant labeling across system isolation loops.
              </div>
            </div>
          </div>
        </div>

        <div class="card shadow-sm border-0 rounded-3 mb-4">
          <div class="card-header bg-white py-3 border-bottom">
            <h5 class="fw-bold text-secondary mb-0 d-flex align-items-center">
              <span class="badge bg-primary me-2">2</span> Tenant Root Administrator Account
            </h5>
          </div>
          <div class="card-body p-4">
            <div class="row">
              
              <div class="col-12 mb-3">
                <label for="admin-username-input" class="form-label small fw-semibold text-muted">Admin Username Identifier</label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted"><i class="bi bi-person-badge"></i></span>
                  <input 
                    type="text" 
                    id="admin-username-input" 
                    class="form-control bg-light" 
                    placeholder="e.g., nexus_admin" 
                    required 
                    autocomplete="off"
                  >
                </div>
                <div class="form-text text-muted extra-small" style="font-size:0.75rem;">
                  The newly created tenant will use this username to initialize their core infrastructure configurations.
                </div>
              </div>

              <div class="col-md-6 mb-3">
                <label for="admin-password-input" class="form-label small fw-semibold text-muted">Assign Secure Password</label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted"><i class="bi bi-shield-lock"></i></span>
                  <input 
                    type="password" 
                    id="admin-password-input" 
                    class="form-control bg-light" 
                    placeholder="••••••••" 
                    required
                  >
                </div>
              </div>

              <div class="col-md-6 mb-3">
                <label for="admin-confirm-password-input" class="form-label small fw-semibold text-muted">Confirm Password Match</label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted"><i class="bi bi-shield-check"></i></span>
                  <input 
                    type="password" 
                    id="admin-confirm-password-input" 
                    class="form-control bg-light" 
                    placeholder="••••••••" 
                    required
                  >
                </div>
              </div>

            </div>
          </div>
        </div>

        <div class="card bg-transparent border-0">
          <div class="card-body p-0 text-end">
            <button class="btn btn-primary px-5 py-2 fw-semibold shadow-sm d-inline-flex align-items-center" id="submit-wizard-btn" type="submit">
              <i class="bi bi-cloud-arrow-up-fill me-2"></i> Deploy Tenant Cluster
            </button>
          </div>
        </div>

      </form>
    </div>
  `;

  // Capture interactive document references
  const form = document.getElementById("onboard-tenant-form");
  const cancelBtn = document.getElementById("back-to-registry-btn");
  const submitBtn = document.getElementById("submit-wizard-btn");
  const alertAnchor = document.getElementById("create-warehouse-alert-anchor");

  const companyNameInput = document.getElementById("company-name-input");
  const usernameInput = document.getElementById("admin-username-input");
  const passwordInput = document.getElementById("admin-password-input");
  const confirmPasswordInput = document.getElementById(
    "admin-confirm-password-input",
  );

  // Wire up the clean exit bypass handler
  cancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    switchWorkspaceView("super-warehouses");
  });

  // Wire up submission handling
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertAnchor.innerHTML = ""; // Flush legacy alert blocks cleanly

    // Value structural normalization
    const companyName = companyNameInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Phase 1: Local Empty Data Guard Interception
    if (!companyName || !username || !password || !confirmPassword) {
      renderAlert(
        alertAnchor,
        "danger",
        "All wizard layout fields require valid explicit records before processing.",
      );
      return;
    }

    // Phase 2: Client Side Password Parity Check
    if (password !== confirmPassword) {
      renderAlert(
        alertAnchor,
        "warning",
        "Credentials Mismatch: The cryptographic security fields do not mirror each other.",
      );
      confirmPasswordInput.focus();
      return;
    }

    // Phase 3: Password Complexity Minimum Length Validation Check
    if (password.length < 6) {
      renderAlert(
        alertAnchor,
        "warning",
        "Security Threshold: Root administrative passwords must exceed 5 characters.",
      );
      passwordInput.focus();
      return;
    }

    // Lock operational elements to prevent layout double-clicks
    setWizardLoadingState(true);

    try {
      // Stream payload execution directly to Cloudflare backend workers via api gateway
      await Api.superadmin.createWarehouse(companyName, username, password);

      // Render highly visible deployment success notifications
      renderAlert(
        alertAnchor,
        "success",
        `🎉 <strong>Ecosystem Deployment Complete!</strong> Warehouse entity for "${companyName}" has been established with isolated transactional tables.`,
      );

      // Freeze interface controls and clear inputs
      form.reset();
      submitBtn.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i> Successfully Initialized`;
      submitBtn.className =
        "btn btn-success px-5 py-2 fw-semibold shadow-sm disabled";

      // Smooth programmatic automated navigation delay to return to registry board
      setTimeout(() => {
        switchWorkspaceView("super-warehouses");
      }, 2500);
    } catch (err) {
      renderAlert(
        alertAnchor,
        "danger",
        `<strong>Infrastructure Exception:</strong> ${err.message}`,
      );
      setWizardLoadingState(false);
    }
  });

  /**
   * Helper state control system to manage wizard button processing transitions
   */
  function setWizardLoadingState(isLoading) {
    if (isLoading) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status"></span>
        <span>Provisioning Tenant Systems...</span>
      `;
      // Soften inputs visual visibility while loading
      companyNameInput.disabled = true;
      usernameInput.disabled = true;
      passwordInput.disabled = true;
      confirmPasswordInput.disabled = true;
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-2"></i> Deploy Tenant Cluster`;
      companyNameInput.disabled = false;
      usernameInput.disabled = false;
      passwordInput.disabled = false;
      confirmPasswordInput.disabled = false;
    }
  }

  /**
   * Modular layout alert renderer wrapper
   */
  function renderAlert(anchor, bootstrapType, message) {
    const iconMap = {
      danger: "bi-exclamation-octagon-fill",
      warning: "bi-exclamation-triangle-fill",
      success: "bi-check-circle-fill",
    };

    anchor.innerHTML = `
      <div class="alert alert-${bootstrapType} border-0 shadow-sm d-flex align-items-center small py-3 px-3 rounded-3 mb-4" role="alert">
        <i class="bi ${iconMap[bootstrapType]} me-3 fs-4 flex-shrink-0"></i>
        <div>${message}</div>
      </div>
    `;
  }
}
