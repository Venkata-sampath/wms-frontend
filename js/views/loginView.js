import { Api } from "../api.js";
import { renderApp } from "../app.js";

/**
 * Renders and wires up the Login screen interface component
 * @param {HTMLElement} container - The target injection container element
 */
export async function render(container) {
  // Construct the template string using semantic Bootstrap 5 elements
  container.innerHTML = `
    <div class="row justify-content-center w-100 m-0 px-2">
      <div class="col-10 col-sm-8 col-md-6 col-lg-4 col-xl-3">
        
        <div class="text-center mb-4">
          <i class="bi bi-layers-half text-primary display-4 mb-2"></i>
          <h2 class="fw-bold text-dark tracking-tight mb-1">FC WMS</h2>
        </div>

        <div class="card shadow border-light rounded-3">
          <div class="card-body p-4 p-sm-5">
            <h4 class="fw-bold mb-4 text-center">Sign In</h4>
            
            <div id="login-alert-anchor"></div>

            <form id="wms-login-form" novalidate>
              
              <div class="mb-3">
                <label for="username-input" class="form-label small fw-semibold text-muted">Username</label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted border-end-0"><i class="bi bi-lock"></i></span>
                  <input 
                    type="text" 
                    id="username-input" 
                    class="form-control bg-light border-start-0" 
                    placeholder="Enter account identity" 
                    required 
                    autocomplete="username"
                  >
                </div>
              </div>

              <div class="mb-4">
                <div class="d-flex justify-content-between align-items-center">
                  <label for="password-input" class="form-label small fw-semibold text-muted mb-1">Password</label>
                </div>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted border-end-0"><i class="bi bi-lock"></i></span>
                  <input 
                    type="password" 
                    id="password-input" 
                    class="form-control bg-light border-start-0" 
                    placeholder="••••••••" 
                    required 
                    autocomplete="current-password"
                  >
                </div>
              </div>

              <button class="btn btn-primary w-100 py-2 fw-semibold d-flex align-items-center justify-content-center" id="submit-auth-btn" type="submit">
                <span>Access Workspace</span>
              </button>

            </form>
          </div>
        </div>

      </div>
    </div>
  `;

  const loginForm = document.getElementById("wms-login-form");
  const usernameInput = document.getElementById("username-input");
  const passwordInput = document.getElementById("password-input");
  const submitBtn = document.getElementById("submit-auth-btn");
  const alertAnchor = document.getElementById("login-alert-anchor");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertAnchor.innerHTML = "";

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      renderErrorAlert(
        alertAnchor,
        "Please fill in all identity credentials to proceed.",
      );
      return;
    }

    setButtonLoadingState(submitBtn, true);

    try {
      const responseData = await Api.auth.login(username, password);

      if (responseData && responseData.token && responseData.user) {
        localStorage.setItem("wms_jwt_token", responseData.token);
        localStorage.setItem(
          "wms_user_profile",
          JSON.stringify(responseData.user),
        );

        // Re-evaluate authorization rules and switch screens immediately
        renderApp();
      } else {
        throw new Error(
          "Malformatted authentication token payload parsed from cluster edge.",
        );
      }
    } catch (err) {
      renderErrorAlert(
        alertAnchor,
        err.message || "Network request failed. Ensure your worker is running.",
      );
      setButtonLoadingState(submitBtn, false);
    }
  });
}

function renderErrorAlert(anchor, message) {
  anchor.innerHTML = `
    <div class="alert alert-danger d-flex align-items-center small py-2 border-0 px-3 shadow-sm rounded-2 mb-3" role="alert">
      <i class="bi bi-exclamation-octagon-fill me-2 fs-5 flex-shrink-0"></i>
      <div>${message}</div>
    </div>
  `;
}

function setButtonLoadingState(buttonElement, isLoading) {
  if (isLoading) {
    buttonElement.disabled = true;
    buttonElement.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>Authenticating...</span>
    `;
  } else {
    buttonElement.disabled = false;
    buttonElement.innerHTML = `<span>Access Workspace</span>`;
  }
}
