// =========================================================================
// SPA CORE ROUTING ENGINE & LAYOUT ENGINE
// =========================================================================

// State Tracking Object
const AppState = {
  token: null,
  user: null, // Holds { id, username, role, warehouse_id, company_name }
  currentView: null,
};

// =========================================================================
// 1. INITIALIZATION & AUTH DETECTOR
// =========================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Bind Global Interceptor Hooks
  window.addEventListener("auth-expired", () => {
    clearAuthentication();
    renderApp();
  });

  // Execute Core Render Flow
  renderApp();
});

/**
 * Strips authentication cookies and cache stores instantly
 */
function clearAuthentication() {
  localStorage.removeItem("wms_jwt_token");
  localStorage.removeItem("wms_user_profile");
  localStorage.removeItem("wms_last_view");
  AppState.token = null;
  AppState.user = null;
  AppState.currentView = null;
}

/**
 * Returns the set of view keys valid for a given role, so we never restore
 * a stale/invalid view (e.g. a tenant view saved under a different role).
 */
function getValidViewKeysForRole(role) {
  if (role === "super_admin") {
    return ["super-warehouses", "super-create-warehouse"];
  }
  const keys = [
    "tenant-dashboard",
    "tenant-inventory",
    "tenant-inbound",
    "tenant-putaway",
    "tenant-transactions",
    "tenant-locations",
  ];
  if (role === "admin") {
    keys.push("tenant-users");
    keys.push("tenant-clients"); // Register view access key blueprint
  }
  return keys;
}

/**
 * Primary Core Router Switchboard
 */
export function renderApp() {
  // Sync memory state with localStorage before determining the routing pathway
  AppState.token = localStorage.getItem("wms_jwt_token");
  const savedProfile = localStorage.getItem("wms_user_profile");

  if (AppState.token && savedProfile) {
    try {
      AppState.user = JSON.parse(savedProfile);
    } catch (e) {
      clearAuthentication();
    }
  } else {
    AppState.user = null;
  }

  const root = document.getElementById("app-root");

  // STATE A: Unauthenticated -> Enforce Login Shell View
  if (!AppState.token || !AppState.user) {
    root.innerHTML = `<div id="login-container" class="login-screen-container"></div>`;
    loadView("login", "login-container");
    return;
  }

  // STATE B: Authenticated -> Render Corporate Frame Layout Framework
  if (!document.getElementById("main-layout-frame")) {
    root.innerHTML = buildMasterShellHTML(AppState.user);
    setupLayoutInteractions();

    // Restore whichever view the user was last on
    const validKeys = getValidViewKeysForRole(AppState.user.role);
    const savedView = localStorage.getItem("wms_last_view");
    const fallbackView =
      AppState.user.role === "super_admin"
        ? "super-warehouses"
        : "tenant-dashboard";
    const initialView =
      savedView && validKeys.includes(savedView) ? savedView : fallbackView;

    switchWorkspaceView(initialView);
  }
}

// =========================================================================
// 2. DYNAMIC WORKSPACE VIEW SWITCHER (SPA ROUTER)
// =========================================================================

export async function switchWorkspaceView(viewKey) {
  const viewport = document.getElementById("workspace-viewport");
  if (!viewport) return;

  document.querySelectorAll(".wms-sidebar .nav-link").forEach((link) => {
    if (link.getAttribute("data-view") === viewKey) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  viewport.innerHTML = `
    <div class="d-flex justify-content-center align-items-center h-100 py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading system asset snapshots...</span>
      </div>
    </div>
  `;

  AppState.currentView = viewKey;
  localStorage.setItem("wms_last_view", viewKey);

  const sidebar = document.getElementById("sidebar-wrapper");
  if (sidebar) sidebar.classList.remove("mobile-show");

  try {
    await loadView(viewKey, "workspace-viewport");
  } catch (err) {
    viewport.innerHTML = `
      <div class="alert alert-danger m-3" role="alert">
        <h4 class="alert-heading"><i class="bi bi-exclamation-triangle-fill"></i> View Loading Failure</h4>
        <p class="mb-0"><strong>Error Details:</strong> ${err.message}</p>
      </div>
    `;
  }
}

async function loadView(viewKey, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let modulePath = "";

  switch (viewKey) {
    case "login":
      modulePath = "./views/loginView.js";
      break;
    case "super-warehouses":
      modulePath = "./views/superadmin/warehousesView.js";
      break;
    case "super-create-warehouse":
      modulePath = "./views/superadmin/createWarehouseView.js";
      break;
    case "tenant-dashboard":
      modulePath = "./views/tenant/dashboardView.js";
      break;
    case "tenant-inventory":
      modulePath = "./views/tenant/inventoryView.js";
      break;
    case "tenant-inbound":
      modulePath = "./views/tenant/inboundView.js";
      break;
    case "tenant-putaway":
      modulePath = "./views/tenant/putawayView.js";
      break;
    case "tenant-transactions":
      modulePath = "./views/tenant/transactionsView.js";
      break;
    case "tenant-locations":
      modulePath = "./views/tenant/locationsView.js";
      break;
    case "tenant-users":
      modulePath = "./views/tenant/usersView.js";
      break;
    case "tenant-clients":
      modulePath = "./views/tenant/clientsView.js";
      break;
    default:
      throw new Error(
        `The requested view blueprint "${viewKey}" cannot be found.`,
      );
  }

  const viewModule = await import(modulePath);
  await viewModule.render(container, AppState.user);
}

// =========================================================================
// 3. CORE FRAMEWORK HTML AND COMPONENT GENERATORS
// =========================================================================

function buildMasterShellHTML(user) {
  const isSuper = user.role === "super_admin";
  let sidebarNavHTML = "";

  if (isSuper) {
    sidebarNavHTML = `
      <a class="nav-link" href="#" data-view="super-warehouses"><i class="bi bi-building-gear"></i> <span>Warehouses</span></a>
      <a class="nav-link" href="#" data-view="super-create-warehouse"><i class="bi bi-building-plus"></i> <span>Onboard Tenant</span></a>
    `;
  } else {
    sidebarNavHTML = `
      <a class="nav-link" href="#" data-view="tenant-dashboard"><i class="bi bi-speedometer2"></i> <span>Dashboard</span></a>
      <a class="nav-link" href="#" data-view="tenant-inventory"><i class="bi bi-boxes"></i> <span>Live Inventory</span></a>
      <a class="nav-link" href="#" data-view="tenant-inbound"><i class="bi bi-truck-flatbed"></i> <span>Inbound Dock</span></a>
      <a class="nav-link" href="#" data-view="tenant-putaway"><i class="bi bi-arrow-down-left-square"></i> <span>Putaway Tasks</span></a>
      <a class="nav-link" href="#" data-view="tenant-transactions"><i class="bi bi-journal-text"></i> <span>Audit Ledger</span></a>
      <a class="nav-link" href="#" data-view="tenant-locations"><i class="bi bi-grid-3x3-gap"></i> <span>Locations Blueprint</span></a>
    `;

    if (user.role === "admin") {
      sidebarNavHTML += `
        <a class="nav-link" href="#" data-view="tenant-users"><i class="bi bi-people"></i> <span>Team Directory</span></a>
        <a class="nav-link" href="#" data-view="tenant-clients"><i class="bi bi-briefcase"></i> <span>Client Master</span></a>
      `;
    }
  }

  // Uses the company_name column pulled via the backend JOIN
  const contextEntityName = isSuper
    ? "Global Console"
    : user.company_name || "Loading Warehouse Context...";

  return `
    <div class="app-wrapper" id="main-layout-frame">
      <aside class="wms-sidebar" id="sidebar-wrapper">
        <div class="sidebar-brand">
          <i class="bi bi-layers-half text-primary fs-3 me-2"></i>
          <span class="fw-bold fs-5 tracking-tight text-white">FC WMS</span>
        </div>
        <nav class="nav flex-column flex-grow-1 pt-2">
          ${sidebarNavHTML}
        </nav>
      </aside>

      <div class="main-workspace">
        <header class="top-app-bar shadow-sm">
          <button class="btn btn-light border-0 me-3" id="sidebar-hamburger" type="button">
            <i class="bi bi-list fs-4"></i>
          </button>
          
          <div class="d-flex align-items-center">
            <span class="fw-bold text-dark header-context-label" id="header-context-label">${contextEntityName}</span>
          </div>

          <div class="ms-auto d-flex align-items-center">
            <div class="d-flex flex-column text-end me-2 me-sm-3 user-info-block">
              <span class="fw-semibold text-dark mb-0 user-name-text">${user.username}</span>
              <span class="text-muted small text-capitalize user-role-text" style="font-size: 0.75rem;">Role: ${user.role.replace("_", " ")}</span>
            </div>
            <div class="dropdown">
              <button class="btn btn-outline-secondary btn-sm rounded-circle p-1" style="width: 32px; height: 32px;" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                <i class="bi bi-person-fill"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end shadow border-light">
                <li><h6 class="dropdown-header">Active Session</h6></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger" id="app-logout-action" href="#"><i class="bi bi-box-arrow-right me-2"></i> Sign Out</a></li>
              </ul>
            </div>
          </div>
        </header>

        <main class="workspace-viewport bg-light" id="workspace-viewport"></main>
      </div>
    </div>
  `;
}

function setupLayoutInteractions() {
  const hamburger = document.getElementById("sidebar-hamburger");
  const sidebar = document.getElementById("sidebar-wrapper");
  const logoutBtn = document.getElementById("app-logout-action");

  if (hamburger && sidebar) {
    hamburger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation(); // prevent this click from also triggering the outside-click handler below
      if (window.innerWidth <= 768) {
        sidebar.classList.toggle("mobile-show");
      } else {
        sidebar.classList.toggle("collapsed");
      }
    });
  }

  // NEW: Close the mobile sidebar when tapping/clicking anywhere outside of it
  document.addEventListener("click", (e) => {
    if (window.innerWidth > 768) return;
    if (!sidebar || !sidebar.classList.contains("mobile-show")) return;

    const clickedInsideSidebar = sidebar.contains(e.target);
    const clickedHamburger = hamburger && hamburger.contains(e.target);

    if (!clickedInsideSidebar && !clickedHamburger) {
      sidebar.classList.remove("mobile-show");
    }
  });

  document.querySelectorAll(".wms-sidebar .nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetView = link.getAttribute("data-view");
      if (targetView) switchWorkspaceView(targetView);
    });
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      clearAuthentication();
      renderApp();
    });
  }
}
