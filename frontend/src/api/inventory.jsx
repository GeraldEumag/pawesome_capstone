import { apiRequest } from "./client";

/**
 * Builds a query string from filter parameters.
 * @param {Record<string, any>} params - Query parameters
 * @returns {string} Formatted query string
 */
const buildQueryString = (params) => {
  if (!params || Object.keys(params).length === 0) return "";
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, value);
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

/**
 * Validates an ID parameter.
 * @param {string|number} id - The ID to validate
 * @param {string} paramName - Name of the parameter for error messages
 * @throws {Error} If ID is invalid
 */
const validateId = (id, paramName = "ID") => {
  if (!id || (typeof id !== "string" && typeof id !== "number")) {
    throw new Error(`${paramName} is required and must be a string or number`);
  }
};

/**
 * Validates required data object.
 * @param {Object} data - The data to validate
 * @param {string} operation - Operation name for error messages
 * @throws {Error} If data is invalid
 */
const validateData = (data, operation = "operation") => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Valid data object is required for ${operation}`);
  }
};

const ACTIVE_ITEMS_ENDPOINT = "/inventory/items";
const ARCHIVED_ITEMS_ENDPOINT = "/inventory/items/archived";
const PUBLIC_ITEMS_ENDPOINT = "/inventory/public/items";
const STOCK_HISTORY_ENDPOINT = "/inventory/stock/history";
const STOCK_LOGS_ENDPOINT = "/inventory/logs";

const buildQueryInput = (params = {}) => {
  if (typeof params === "string") {
    return params.startsWith("?") ? params : params ? `?${params}` : "";
  }

  return buildQueryString(params);
};

/**
 * Inventory API service for managing inventory items, stock levels, and reports.
 * @namespace inventoryApi
 */
export const inventoryApi = {
  /**
   * Retrieves a paginated list of inventory items with optional filtering.
   * @async
   * @param {Object} [params={}] - Query parameters
   * @param {number} [params.page] - Page number for pagination
   * @param {number} [params.limit] - Items per page
   * @param {string} [params.category] - Filter by category
   * @param {string} [params.status] - Filter by stock status (in_stock, low_stock, out_of_stock)
   * @param {string} [params.search] - Search query for product name or SKU
   * @param {string} [params.sortBy] - Field to sort by
   * @param {string} [params.sortOrder] - Sort order (asc, desc)
   * @returns {Promise<{data: Array, meta: Object}>} Inventory items with pagination metadata
   * @throws {Error} When the request fails
   */
  getItems: async (params = {}) => {
    try {
      if (params?.status === "archived") {
        const archivedParams = { ...params };
        delete archivedParams.status;
        const queryString = buildQueryInput(archivedParams);
        return await apiRequest(`${ARCHIVED_ITEMS_ENDPOINT}${queryString}`);
      }

      const queryString = buildQueryString(params);
      return await apiRequest(`${ACTIVE_ITEMS_ENDPOINT}${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  getActiveItems: async (params = {}) => {
    try {
      const queryString = buildQueryInput(params);
      return await apiRequest(`${ACTIVE_ITEMS_ENDPOINT}${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves inventory items via PUBLIC endpoint (available to all authenticated users)
   * Used by Customer Store and Cashier POS for read-only access
   * @async
   * @param {Object} [params={}] - Query parameters
   * @param {string} [params.category] - Filter by category
   * @param {string} [params.search] - Search query
   * @param {boolean} [params.in_stock_only] - Only return in-stock items
   * @returns {Promise<{items: Array, count: number, timestamp: string}>} Public inventory items
   * @throws {Error} When the request fails
   */
  getPublicItems: async (params = {}) => {
    try {
      const queryString = buildQueryString(params);
      return await apiRequest(`${PUBLIC_ITEMS_ENDPOINT}${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  getSellableItems: async () => {
    try {
      return await apiRequest("/inventory/sellable");
    } catch (error) {
      throw error;
    }
  },

  getCashierSellableItems: async () => {
    try {
      return await apiRequest("/cashier/inventory/sellable");
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves a single inventory item by ID.
   * @async
   * @param {string|number} id - Inventory item ID
   * @returns {Promise<Object>} Inventory item details
   * @throws {Error} When item not found or request fails
   */
  getItem: async (id) => {
    validateId(id, "Item ID");
    try {
      return await apiRequest(`/inventory/items/${id}`);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Creates a new inventory item.
   * @async
   * @param {Object} data - Item data
   * @param {string} data.name - Product name
   * @param {string} data.sku - Stock keeping unit
   * @param {string} data.category - Product category
   * @param {number} data.stock - Initial stock quantity (or use 'quantity' for frontend compatibility)
   * @param {number} data.price - Unit price
   * @param {string} [data.brand] - Product brand
   * @param {string} [data.supplier] - Supplier name
   * @param {boolean} [data.add_stock] - Optional, for API consistency with update method
   * @returns {Promise<Object>} Created inventory item with stock_action info
   * @throws {Error} When validation fails or request fails
   */
  createItem: async (data) => {
    validateData(data, "create item");
    try {
      return await apiRequest("/inventory/items", {
        method: "POST",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Creates a new inventory item with a photo file (multipart/form-data).
   * @async
   * @param {Object} data - Item data
   * @param {File} [data.photo] - Product photo file
   * @returns {Promise<Object>} Created inventory item
   * @throws {Error} When validation fails or request fails
   */
  createItemWithPhoto: async (data) => {
    validateData(data, "create item");
    try {
      const formData = new FormData();
      let batchProofFile = null;

      Object.entries(data).forEach(([key, value]) => {
        if (value === undefined || value === null) return;

        if (key === "photo" && value instanceof File) {
          formData.append("photo", value);
          return;
        }

        if (key === "batchData" && typeof value === "object") {
          // Extract proof_photo file from batchData before stringifying
          if (value.proof_photo instanceof File) {
            batchProofFile = value.proof_photo;
          }
          const batchClone = { ...value };
          delete batchClone.proof_photo;
          formData.append("batchData", JSON.stringify(batchClone));
          return;
        }

        if (typeof value === "object") {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      });

      if (batchProofFile) {
        formData.append("batch_proof", batchProofFile);
      }

      return await apiRequest("/inventory/items", {
        method: "POST",
        body: formData,
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Updates an existing inventory item.
   * @async
   * @param {string|number} id - Inventory item ID
   * @param {Object} data - Updated item data
   * @param {number} [data.stock] - New stock quantity (replaces by default)
   * @param {number} [data.quantity] - Alternative to stock field
   * @param {boolean} [data.add_stock] - If true, ADDS to existing stock (50 + 25 = 75).
   *                                     Adds to current quantity when this flag is true.
   * @returns {Promise<Object>} Updated inventory item with stock_action info
   * @throws {Error} When item not found, validation fails, or request fails
   */
  updateItem: async (id, data) => {
    validateId(id, "Item ID");
    validateData(data, "update item");
    try {
      return await apiRequest(`/inventory/items/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Updates an existing inventory item with a photo file (multipart/form-data).
   * @async
   * @param {string|number} id - Inventory item ID
   * @param {Object} data - Updated item data
   * @param {File} [data.photo] - Product photo file
   * @returns {Promise<Object>} Updated inventory item
   * @throws {Error} When item not found, validation fails, or request fails
   */
  updateItemWithPhoto: async (id, data) => {
    validateId(id, "Item ID");
    validateData(data, "update item");
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (key === "photo" && value instanceof File) {
            formData.append("photo", value);
          } else {
            formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
          }
        }
      });
      // Laravel method spoofing: PHP doesn't parse multipart files on PUT,
      // so we POST with _method=PUT to route to the PUT handler
      formData.append("_method", "PUT");
      return await apiRequest(`/inventory/items/${id}`, {
        method: "POST",
        body: formData,
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Adds stock to an existing item (50 + 25 = 75).
   * Adds the provided amount to the current stock quantity.
   * @async
   * @param {string|number} id - Inventory item ID
   * @param {number} quantity - Amount to add
   * @param {string} [reason] - Reason for adding stock
   * @returns {Promise<Object>} Updated inventory item
   * @throws {Error} When item not found or request fails
   */
  addStock: async (id, quantity, reason = "Stock restock") => {
    validateId(id, "Item ID");
    if (typeof quantity !== "number" || quantity <= 0) {
      throw new Error("Quantity must be a positive number");
    }
    try {
      return await apiRequest(`/inventory/items/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          stock: quantity,
          add_stock: true, // This tells backend to ADD, not replace
          reason: reason,
        }),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Archives an inventory item (replaces delete).
   * @async
   * @param {string|number} id - Inventory item ID
   * @param {string} [reason] - Archive reason
   * @returns {Promise<Object>} Archive confirmation
   * @throws {Error} When item not found or request fails
   */
  archiveItem: async (id, reason = "Archived via inventory management") => {
    validateId(id, "Item ID");
    try {
      return await apiRequest(`/inventory/items/${id}/archive`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves archived inventory items.
   * @async
   * @param {Object} [params={}] - Query parameters
   * @param {string} [params.search] - Search query
   * @param {number} [params.per_page] - Items per page
   * @returns {Promise<Object>} Archived items with pagination
   * @throws {Error} When request fails
   */
  getArchivedItems: async (params = {}) => {
    try {
      const queryString = buildQueryInput(params);
      return await apiRequest(`${ARCHIVED_ITEMS_ENDPOINT}${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Unarchives an inventory item (restores to active status).
   * @async
   * @param {string|number} id - Inventory item ID
   * @returns {Promise<Object>} Unarchive confirmation
   * @throws {Error} When item not found or request fails
   */
  unarchiveItem: async (id) => {
    validateId(id, "Item ID");
    try {
      return await apiRequest(`/inventory/items/${id}/restore`, {
        method: "PATCH",
      });
    } catch (error) {
      throw error;
    }
  },

  restoreItem: async (id) => {
    validateId(id, "Item ID");
    try {
      return await apiRequest(`/inventory/items/${id}/restore`, {
        method: "PATCH",
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Deletes an inventory item (admin only for items with no history).
   * @async
   * @param {string|number} id - Inventory item ID
   * @returns {Promise<Object>} Deletion confirmation
   * @throws {Error} When item not found or request fails
   */
  deleteItem: async (id) => {
    validateId(id, "Item ID");
    try {
      return await apiRequest(`/inventory/items/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      throw error;
    }
  },

  forceDeleteItem: async (id) => {
    validateId(id, "Item ID");
    try {
      return await apiRequest(`/inventory/items/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves dashboard statistics for inventory overview.
   * @async
   * @returns {Promise<Object>} Dashboard data including counts, values, and alerts
   * @throws {Error} When the request fails
   */
  getDashboard: async () => {
    try {
      return await apiRequest("/inventory/dashboard");
    } catch (error) {
      throw error;
    }
  },

  /**
   * Generates inventory reports with filtering and date ranges.
   * @async
   * @param {Object} [params={}] - Report parameters
   * @param {string} [params.startDate] - Report start date (ISO format)
   * @param {string} [params.endDate] - Report end date (ISO format)
   * @param {string} [params.type] - Report type (summary, detailed, valuation)
   * @param {string} [params.category] - Filter by category
   * @returns {Promise<Object>} Generated report data
   * @throws {Error} When the request fails
   */
  getReports: async (params = {}) => {
    try {
      const queryString = buildQueryString(params);
      return await apiRequest(`/inventory/reports${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves stock history for audit trails.
   * @async
   * @param {Object} [params={}] - History filter parameters
   * @param {string|number} [params.itemId] - Filter by specific item
   * @param {string} [params.startDate] - History start date
   * @param {string} [params.endDate] - History end date
   * @param {string} [params.action] - Filter by action type (adjustment, sale, restock)
   * @returns {Promise<{data: Array, meta: Object}>} Stock history records
   * @throws {Error} When the request fails
   */
  getStockHistory: async (params = {}) => {
    try {
      const queryString = buildQueryInput(params);
      return await apiRequest(`${STOCK_HISTORY_ENDPOINT}${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  getStockLogs: async (params = {}) => {
    try {
      const queryString = buildQueryInput(params);
      return await apiRequest(`${STOCK_LOGS_ENDPOINT}${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Adjusts stock quantity for an item with reason tracking.
   * @async
   * @param {string|number} id - Inventory item ID
   * @param {string} type - Adjustment type: "add", "remove", or "set"
   * @param {number} quantity - Quantity value (adjustment amount for add/remove, final value for set)
   * @param {string} reason - Reason for the adjustment
   * @returns {Promise<Object>} Updated item with adjustment record
   * @throws {Error} When validation fails or request fails
   */
  adjustStock: async (id, typeOrPayload, quantity, reason = "Manual stock adjustment", options = {}) => {
    validateId(id, "Item ID");

    let payload = null;

    if (typeof typeOrPayload === "object" && typeOrPayload !== null && !Array.isArray(typeOrPayload)) {
      payload = {
        type: typeOrPayload.type,
        quantity: Number(typeOrPayload.quantity),
        reason: typeOrPayload.reason || reason,
      };
    } else {
      if (!["add", "remove", "set"].includes(typeOrPayload)) {
        throw new Error("Type must be 'add', 'remove', or 'set'");
      }

      if (typeof quantity !== "number" || isNaN(quantity) || quantity < 0) {
        throw new Error("Quantity must be a valid positive number");
      }

      const adjustmentType = typeOrPayload === "add"
        ? "increment"
        : typeOrPayload === "remove"
          ? "decrement"
          : "set";

      payload = {
        type: typeOrPayload,
        adjustment_type: adjustmentType,
        quantity: Number(quantity),
        reason,
      };
    }

    try {
      return await apiRequest(`/inventory/items/${id}/adjust-stock`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves low stock alerts for inventory management.
   * @async
   * @returns {Promise<{data: Array, count: number}>} Items below threshold with alert count
   * @throws {Error} When the request fails
   */
  getLowStockAlerts: async () => {
    try {
      return await apiRequest("/inventory/low-stock");
    } catch (error) {
      throw error;
    }
  },


  /**
   * Creates a reorder request for low stock items.
   * @async
   * @param {Object} payload - Reorder request data
   * @param {string|number} payload.item_id - Inventory item ID
   * @param {string} payload.item_name - Product name
   * @param {string} payload.sku - Product SKU
   * @param {number} payload.suggested_quantity - Suggested reorder quantity
   * @param {number} payload.current_stock - Current stock level
   * @param {number} payload.reorder_level - Reorder threshold
   * @param {string} payload.priority - Priority level (critical, high, low)
   * @param {string} payload.status - Request status
   * @returns {Promise<Object>} Created reorder request confirmation
   * @throws {Error} When validation fails or request fails
   */
  createReorderRequest: async (payload) => {
    try {
      return await apiRequest("/inventory/reorder-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Creates a notification for inventory alerts (low stock, out of stock).
   * @async
   * @param {Object} payload - Notification data
   * @param {string} payload.title - Notification title
   * @param {string} payload.message - Notification message
   * @param {string} payload.type - Notification type (danger, warning, info)
   * @param {string} payload.module - Source module (inventory)
   * @param {string|number} payload.item_id - Related inventory item ID
   * @param {string} [payload.priority] - Priority level (high, medium, low)
   * @returns {Promise<Object>} Created notification
   * @throws {Error} When notification creation fails
   */
  /**
   * Get all batches for an inventory item.
   * @async
   * @param {string|number} itemId - Inventory item ID
   * @returns {Promise<Object>} Item batches
   * @throws {Error} When request fails
   */
  getItemBatches: async (itemId) => {
    validateId(itemId, "Item ID");
    try {
      return await apiRequest(`/inventory/items/${itemId}/batches`);
    } catch (error) {
      throw error;
    }
  },


  /**
   * Add a new batch to an inventory item.
   * @async
   * @param {string|number} itemId - Inventory item ID
   * @param {Object} batchData - Batch data
   * @param {string} batchData.batch_no - Batch number
   * @param {string} batchData.received_date - Received date (YYYY-MM-DD)
   * @param {number} batchData.quantity - Batch quantity
   * @param {string} [batchData.notes] - Batch notes
   * @returns {Promise<Object>} Created batch
   * @throws {Error} When validation fails or request fails
   */
  addBatch: async (itemId, batchData) => {
    validateId(itemId, "Item ID");
    validateData(batchData, "add batch");
    try {
      return await apiRequest(`/inventory/items/${itemId}/batches`, {
        method: "POST",
        body: JSON.stringify(batchData),
      });
    } catch (error) {
      throw error;
    }
  },

  createBatch: async (itemId, batchData) => {
    validateId(itemId, "Item ID");
    validateData(batchData, "create batch");
    try {
      return await apiRequest(`/inventory/items/${itemId}/batches`, {
        method: "POST",
        body: JSON.stringify(batchData),
      });
    } catch (error) {
      throw error;
    }
  },

  updateBatch: async (batchId, payload) => {
    validateId(batchId, "Batch ID");
    validateData(payload, "update batch");
    try {
      return await apiRequest(`/inventory/batches/${batchId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Dispose of an expired or damaged batch.
   * @async
   * @param {string|number} batchId - Batch ID
   * @param {string} [reason] - Disposal reason
   * @returns {Promise<Object>} Disposal confirmation
   * @throws {Error} When request fails
   */
  disposeBatch: async (batchId, reason = "Expired") => {
    validateId(batchId, "Batch ID");
    try {
      return await apiRequest(`/inventory/batches/${batchId}/dispose`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Adjust batch stock quantity.
   * @async
   * @param {string|number} batchId - Batch ID
   * @param {number} newQuantity - New quantity value
   * @param {string} [reason] - Adjustment reason
   * @returns {Promise<Object>} Updated batch
   * @throws {Error} When request fails
   */
  adjustBatchStock: async (batchId, newQuantity, reason = "Manual adjustment") => {
    validateId(batchId, "Batch ID");
    try {
      return await apiRequest(`/inventory/batches/${batchId}/adjust`, {
        method: "POST",
        body: JSON.stringify({ quantity: newQuantity, reason }),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves monthly audit items for a specific month.
   * @async
   * @param {string} month - Month in YYYY-MM format
   * @returns {Promise<Object>} Monthly audit data
   * @throws {Error} When request fails
   */
  getOrCreateMonthlyAudit: async (month) => {
    try {
      const queryString = buildQueryString({ month });
      return await apiRequest(`/inventory/monthly-audit${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Gets discrepancy reasons breakdown.
   * @async
   * @returns {Promise<Object>} Discrepancy reasons with frequencies
   * @throws {Error} When request fails
   */
  getDiscrepancyReasons: async () => {
    try {
      return await apiRequest("/inventory/monthly-audit/discrepancy-reasons");
    } catch (error) {
      throw error;
    }
  },

  /**
   * Saves monthly audit data.
   * @async
   * @param {Object} payload - Audit data payload
   * @param {string} payload.audit_month - Audit month
   * @param {Array} payload.items - Array of audit items
   * @returns {Promise<Object>} Saved audit data
   * @throws {Error} When request fails
   */
  saveMonthlyAudit: async (payload) => {
    validateData(payload, "monthly audit save");
    try {
      return await apiRequest("/inventory/monthly-audit", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves monthly audit report for a specific month.
   * @async
   * @param {string} month - Month in YYYY-MM format
   * @returns {Promise<Object>} Monthly audit report data
   * @throws {Error} When request fails
   */
  getMonthlyAuditReport: async (month) => {
    try {
      const queryString = buildQueryString({ month });
      return await apiRequest(`/inventory/monthly-audit-report${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves audit analytics data for trend analysis.
   * @async
   * @param {Object} options - Analytics options
   * @param {number} options.months - Number of months to analyze (default: 6)
   * @returns {Promise<Object>} Audit analytics data with trends
   * @throws {Error} When request fails
   */
  getAuditAnalytics: async (options = {}) => {
    try {
      const months = typeof options === "number" ? options : options.months || 6;
      const queryString = buildQueryString({ months });
      return await apiRequest(`/inventory/audit-analytics${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Retrieves the inventory cost/profit report.
   * @async
   * @returns {Promise<Object>} Cost report with summary, category breakdown, top/bottom margins
   * @throws {Error} When request fails
   */
  getCostReport: async () => {
    try {
      return await apiRequest("/admin/inventory/cost-report");
    } catch (error) {
      throw error;
    }
  },

  // ========================
  // Supplier Management
  // ========================

  /**
   * Retrieves all suppliers.
   * @async
   * @param {Object} [params={}] - Query parameters
   * @param {string} [params.search] - Search query
   * @param {boolean} [params.active_only] - Only active suppliers
   * @returns {Promise<Object>} Suppliers list
   * @throws {Error} When request fails
   */
  getSuppliers: async (params = {}) => {
    try {
      const queryString = buildQueryString(params);
      return await apiRequest(`/inventory/suppliers${queryString}`);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Creates a new supplier.
   * @async
   * @param {Object} data - Supplier data
   * @param {string} data.name - Supplier name
   * @param {string} [data.contact_person] - Contact person
   * @param {string} [data.phone] - Phone number
   * @param {string} [data.email] - Email address
   * @param {string} [data.address] - Physical address
   * @param {string} [data.notes] - Additional notes
   * @returns {Promise<Object>} Created supplier
   * @throws {Error} When validation fails or request fails
   */
  createSupplier: async (data) => {
    validateData(data, "create supplier");
    try {
      return await apiRequest("/inventory/suppliers", {
        method: "POST",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Updates an existing supplier.
   * @async
   * @param {string|number} id - Supplier ID
   * @param {Object} data - Updated supplier data
   * @returns {Promise<Object>} Updated supplier
   * @throws {Error} When request fails
   */
  updateSupplier: async (id, data) => {
    validateId(id, "Supplier ID");
    validateData(data, "update supplier");
    try {
      return await apiRequest(`/inventory/suppliers/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Deletes a supplier.
   * @async
   * @param {string|number} id - Supplier ID
   * @returns {Promise<Object>} Deletion confirmation
   * @throws {Error} When request fails
   */
  deleteSupplier: async (id) => {
    validateId(id, "Supplier ID");
    try {
      return await apiRequest(`/inventory/suppliers/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      throw error;
    }
  },
};

export default inventoryApi;

