// =========================================================================
// API GATEWAY CONFIGURATION
// =========================================================================

// Replace this URL string with your actual live Cloudflare Workers deployment domain
const API_BASE_URL = "https://wms.satyaramsl72.workers.dev";

/**
 * Core HTTP Request Wrapper Engine
 * Handles automatic JWT injection, content headers, and unified error parsing.
 */
async function sendRequest(method, endpoint, body = null) {
  const url = `${API_BASE_URL}${endpoint}`;

  // Retrieve the JWT auth session token from storage
  const token = localStorage.getItem("wms_jwt_token");

  const headers = {
    "Content-Type": "application/json",
  };

  // If a valid session token exists, automatically bind it to the request authorization chain
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const options = {
    method: method,
    headers: headers,
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    // Parse response body safely as JSON if content exists.
    // NOTE: some Worker endpoints forget to set Content-Type: application/json
    // (they only send corsHeaders). Rather than silently returning {} in that
    // case, we still attempt to parse the raw text as JSON.
    let data = {};
    const rawText = await response.text();
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        // Response wasn't JSON at all (e.g. plain text error) — leave data as {}
        console.warn(
          `[API Engine] Non-JSON response from ${endpoint}:`,
          rawText,
        );
      }
    }

    // Intercept and handle authorization expirations natively
    if (response.status === 401) {
      localStorage.removeItem("wms_jwt_token");
      localStorage.removeItem("wms_user_profile");
      // Forcefully redirect the user canvas loop back to the entry state if their login session expires
      window.dispatchEvent(new Event("auth-expired"));
      throw new Error(data.error || "Session expired. Please log in again.");
    }

    if (!response.ok) {
      throw new Error(
        data.error || `Server responded with status status ${response.status}`,
      );
    }

    return data;
  } catch (error) {
    console.error(`[API Engine Error] ${method} ${endpoint}:`, error);
    throw error;
  }
}

// =========================================================================
// EXPORTED API MODULES
// =========================================================================

export const Api = {
  // --- AUTH SERVICES ---
  auth: {
    async login(username, password) {
      return sendRequest("POST", "/api/auth/login", { username, password });
    },
  },

  // --- SUPER ADMIN SERVICES (Isolated Ecosystem) ---
  superadmin: {
    async getWarehouses() {
      return sendRequest("GET", "/api/superadmin/warehouses");
    },
    async createWarehouse(company_name, admin_username, admin_password) {
      return sendRequest("POST", "/api/superadmin/warehouses", {
        company_name,
        admin_username,
        admin_password,
      });
    },
    async toggleWarehouseStatus(warehouseId, currentStatus) {
      const nextStatus = currentStatus === "active" ? "suspended" : "active";
      // ALIGNED WITH index.js: Points to subscription endpoint and supplies accurate keys
      return sendRequest("POST", "/api/superadmin/warehouses/subscription", {
        target_warehouse_id: warehouseId,
        set_status: nextStatus,
      });
    },
  },

  // --- WAREHOUSE LOCATIONS MANAGEMENT ---
  locations: {
    async list(specificLocationId = null) {
      const endpoint = specificLocationId
        ? `/api/locations?id=${encodeURIComponent(specificLocationId)}`
        : "/api/locations";
      return sendRequest("GET", endpoint);
    },
    async create(locationId) {
      return sendRequest("POST", "/api/locations", { locationId });
    },
    async toggleStatus(locationId, currentStatus) {
      // If currently available, toggle to unavailable. If not, go back to available.
      const nextStatus =
        currentStatus === "available" ? "unavailable" : "available";
      return sendRequest("POST", "/api/locations/toggle-status", {
        locationId,
        newStatus: nextStatus,
      });
    },
  },

  // Inside api.js
  shipments: {
    async listPending() {
      return sendRequest("GET", "/api/shipments/pending");
    },
    async getStaged(shipmentId) {
      return sendRequest("GET", `/api/shipments/staged?id=${shipmentId}`);
    },
    async upload(formData) {
      const token = localStorage.getItem("wms_jwt_token");
      return await fetch(`${API_BASE_URL}/api/inbound/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }, // No Content-Type for FormData
        body: formData,
      }).then((r) => r.json());
    },
    async commit(payload) {
      return sendRequest("POST", "/api/shipments/commit", payload);
    },
  },

  // --- PARTY MASTER LOOKUP (used during verification to detect existing GSTINs) ---
  parties: {
    async lookup(gstin) {
      return sendRequest(
        "GET",
        `/api/parties/lookup?gstin=${encodeURIComponent(gstin)}`,
      );
    },
  },

  // --- PUTAWAY QUEUE MANAGEMENT ---
  putaway: {
    async getPending() {
      return sendRequest("GET", "/api/putaway/pending");
    },
    async getCompleted() {
      return sendRequest("GET", "/api/putaway/completed");
    },
    async completeTask(putawayTaskId, allocationsArray) {
      return sendRequest("POST", "/api/putaway/complete", {
        putaway_task_id: putawayTaskId,
        allocations: allocationsArray,
      });
    },
  },

  // --- REAL-TIME BALANCES AND TRACKING ---
  inventory: {
    async getSnapshot() {
      return sendRequest("GET", "/api/inventory");
    },
  },

  transactions: {
    async list() {
      return sendRequest("GET", "/api/transactions");
    },
    async getDetails(transactionId) {
      return sendRequest(
        "GET",
        `/api/transactions/${encodeURIComponent(transactionId)}`,
      );
    },
  },

  // --- TEAM MEMBER MANAGEMENT (Admin Role Gated) ---
  users: {
    async list() {
      return sendRequest("GET", "/api/users");
    },
    async create(username, password, role) {
      // ALIGNED WITH index.js: Passes parameters inside request body payload
      return sendRequest("POST", "/api/auth/register-operator", {
        username,
        password,
        role,
      });
    },
    async toggleStatus(targetUserId, currentIsActive) {
      // ALIGNED WITH index.js: Converts integer states (1 -> 0 or 0 -> 1) and matches key mappings
      const nextActiveState = currentIsActive === 1 ? 0 : 1;
      return sendRequest("POST", "/api/auth/toggle-user-status", {
        target_user_id: targetUserId,
        set_active: nextActiveState,
      });
    },
  },
};
