// api.js

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
  const token = localStorage.getItem("wms_jwt_token");

  const headers = {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const options = {
    method: method,
    headers: headers,
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    if (body instanceof FormData) {
      // Do NOT set Content-Type header when sending FormData!
      // The browser will automatically set 'multipart/form-data; boundary=...'
      options.body = body;
    } else {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
  }

  try {
    const response = await fetch(url, options);

    let data = {};
    const rawText = await response.text();
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.warn(
          `[API Engine] Non-JSON response from ${endpoint}:`,
          rawText,
        );
      }
    }

    if (response.status === 401) {
      localStorage.removeItem("wms_jwt_token");
      localStorage.removeItem("wms_user_profile");
      window.dispatchEvent(new Event("auth-expired"));
      throw new Error(data.error || "Session expired. Please log in again.");
    }

    if (!response.ok) {
      throw new Error(
        data.error || `Server responded with status ${response.status}`,
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
    async login(warehouseId, username, password) {
      return sendRequest("POST", "/api/auth/login", {
        warehouse_id: warehouseId,
        username,
        password,
      });
    },
  },

  // --- CLIENT MASTER SERVICE INTERFACE ---
  clients: {
    async list() {
      const res = await sendRequest("GET", "/api/clients");
      return res.clients || [];
    },
    async create(payload) {
      return sendRequest("POST", "/api/clients", payload);
    },
  },

  // --- BILLING MODULE SERVICE INTERFACE ---
  billing: {
    async list(filters = {}) {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.client_id) params.set("client_id", filters.client_id);
      if (filters.status) params.set("status", filters.status);
      const qs = params.toString();
      const res = await sendRequest("GET", `/api/billing${qs ? `?${qs}` : ""}`);
      return res.bills || [];
    },
    async getDetails(billingId) {
      return sendRequest(
        "GET",
        `/api/billing/${encodeURIComponent(billingId)}`,
      );
    },
    async create(payload) {
      return sendRequest("POST", "/api/billing", payload);
    },
    async update(billingId, payload) {
      return sendRequest(
        "PUT",
        `/api/billing/${encodeURIComponent(billingId)}`,
        payload,
      );
    },
    async remove(billingId) {
      return sendRequest(
        "DELETE",
        `/api/billing/${encodeURIComponent(billingId)}`,
      );
    },
    async markPaid(billingId) {
      return sendRequest(
        "POST",
        `/api/billing/${encodeURIComponent(billingId)}/mark-paid`,
      );
    },
    async uploadAttachment(billingId, formData) {
      return sendRequest(
        "POST",
        `/api/billing/${encodeURIComponent(billingId)}/attachments`,
        formData,
      );
    },
    async removeAttachment(attachmentId) {
      return sendRequest(
        "DELETE",
        `/api/billing/attachments/${encodeURIComponent(attachmentId)}`,
      );
    },
  },

  // --- REAL-TIME BALANCES AND TRACKING ---
  inventory: {
    async getSnapshot() {
      return sendRequest("GET", "/api/inventory");
    },
    async adjust(payload) {
      return sendRequest("POST", "/api/inventory/adjust", payload);
    },
  },

  // --- STOCK OWNER SERVICE INTERFACE ---
  stockOwners: {
    async list(clientId = null) {
      const endpoint = clientId
        ? `/api/stock-owners?client_id=${encodeURIComponent(clientId)}`
        : "/api/stock-owners";
      const res = await sendRequest("GET", endpoint);
      return res.stock_owners || [];
    },
    async create(payload) {
      return sendRequest("POST", "/api/stock-owners", payload);
    },
  },

  // --- OPENING STOCK INGESTION ENGINE ---
  openingStock: {
    async validate(formData) {
      return sendRequest("POST", "/api/opening-stock/validate", formData);
    },
    async import(formData) {
      return sendRequest("POST", "/api/opening-stock/import", formData);
    },
  },

  // --- SUPER ADMIN SERVICES (Isolated Ecosystem) ---
  superadmin: {
    async getWarehouses() {
      return sendRequest("GET", "/api/superadmin/warehouses");
    },
    async createWarehouse(
      warehouseId,
      company_name,
      admin_username,
      admin_password,
      gstin = null,
      address = null,
    ) {
      return sendRequest("POST", "/api/superadmin/warehouses", {
        warehouse_id: warehouseId,
        company_name,
        admin_username,
        admin_password,
        gstin,
        address,
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
  inbound: {
    async listPending() {
      return sendRequest("GET", "/api/inbound/pending");
    },
    async getStaged(shipmentId) {
      return sendRequest("GET", `/api/inbound/staged?id=${shipmentId}`);
    },
    async upload(formData) {
      return sendRequest("POST", "/api/inbound/upload", formData);
    },
    async commit(payload) {
      return sendRequest("POST", "/api/inbound/commit", payload);
    },
    async remove(shipmentId) {
      return sendRequest(
        "DELETE",
        `/api/inbound/${encodeURIComponent(shipmentId)}`,
      );
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

  // --- OUTBOUND SHIPMENT SERVICE INTERFACE (AI Upload + Manual Entry share verify/commit) ---
  outbound: {
    async listPending() {
      return sendRequest("GET", "/api/outbound/pending");
    },
    async getStaged(shipmentId) {
      return sendRequest("GET", `/api/outbound/staged?id=${shipmentId}`);
    },
    async upload(formData) {
      return sendRequest("POST", "/api/outbound/upload", formData);
    },
    async verify(payload) {
      return sendRequest("POST", "/api/outbound/verify", payload);
    },
    async commit(payload) {
      return sendRequest("POST", "/api/outbound/commit", payload);
    },
    async remove(shipmentId) {
      return sendRequest(
        "DELETE",
        `/api/outbound/${encodeURIComponent(shipmentId)}`,
      );
    },
  },

  // --- PICKING TASK QUEUE MANAGEMENT ---
  picking: {
    async getPending() {
      return sendRequest("GET", "/api/picking/pending");
    },
    async getCompleted() {
      return sendRequest("GET", "/api/picking/completed");
    },
    async completeTask(pickingTaskId, pickedItemsArray) {
      return sendRequest("POST", "/api/picking/complete", {
        picking_task_id: pickingTaskId,
        picked_items: pickedItemsArray,
      });
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
