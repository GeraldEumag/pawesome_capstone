import { apiRequest } from "./client";

/**
 * Process a new transaction
 * @param {Object} transactionData
 */
export const processTransaction = async (transactionData) => {
  const response = await apiRequest("/cashier/pos/transaction", {
    method: "POST",
    body: JSON.stringify(transactionData),
  });
  return response;
};

/**
 * Get available products for POS
 */
export const getPOSProducts = async () => {
  const response = await apiRequest("/cashier/pos/products");
  return response.products || [];
};

/**
 * Get available services for POS
 */
export const getPOSServices = async () => {
  const response = await apiRequest("/cashier/pos/services");
  return response.services || [];
};

/**
 * Lookup a single product by barcode via the server-side endpoint.
 * Used by the POS scanner. Does NOT deduct stock — stock deduction
 * happens only during checkout (POST /cashier/pos/transaction).
 *
 * @param {string} barcode - Raw barcode value (will be trimmed by backend)
 * @returns {Promise<Object>} Resolved item: { id, name, sku, barcode, price, stock, is_sellable, ... }
 * @throws {Error} When barcode is not found, item is non-sellable/archived, or request fails.
 */
export const lookupBarcode = async (barcode) => {
  const trimmed = String(barcode ?? "").trim();
  if (!trimmed) {
    throw new Error("Barcode is empty.");
  }
  const response = await apiRequest(`/products/barcode/${encodeURIComponent(trimmed)}`);
  // Backend returns { success, item }. Fall back to legacy { product } shape.
  return response?.item ?? response?.product ?? null;
};

/**
 * Get transactions with optional filters
 * @param {Object} params - { status, date_from, date_to, customer_id, per_page }
 */
export const getTransactions = async (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  const url = `/cashier/pos/transactions${queryString ? `?${queryString}` : ""}`;
  const response = await apiRequest(url);
  return response;
};

/**
 * Get single transaction details
 * @param {number} id
 */
export const getTransaction = async (id) => {
  const response = await apiRequest(`/cashier/pos/transaction/${id}`);
  return response;
};

/**
 * Void/Refund a transaction
 * @param {number} id
 * @param {string} reason
 */
export const voidTransaction = async (id, reason) => {
  const response = await apiRequest(`/cashier/pos/transaction/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return response;
};

/**
 * Download invoice for a transaction
 * @param {number} id
 */
export const downloadInvoice = async (id) => {
  const response = await apiRequest(`/cashier/pos/invoice/${id}`);
  return response;
};

/**
 * Generate receipt data from transaction
 */
export const generateReceipt = (transaction, items, payment) => {
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.12;
  const discount = payment?.discount || 0;
  const total = subtotal + tax - discount;

  return {
    store_name: "Pawesome Pet Store",
    store_address: "123 Pet Street, Manila, Philippines",
    store_phone: "(02) 8123-4567",
    transaction_number: transaction.transaction_number || `TRX-${Date.now()}`,
    date: new Date().toLocaleString(),
    cashier: transaction.cashier || "Cashier",
    customer: transaction.customer || "Walk-in",
    items: items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total: item.price * item.quantity,
    })),
    subtotal,
    tax,
    discount,
    total,
    payment: {
      method: payment?.method || "cash",
      amount: payment?.cashReceived || total,
      change: payment?.change || 0,
    },
  };
};

// POS API object
export const posApi = {
  processTransaction,
  getPOSProducts,
  getPOSServices,
  lookupBarcode,
  getTransactions,
  getTransaction,
  voidTransaction,
  downloadInvoice,
  generateReceipt,
};

export default posApi;
