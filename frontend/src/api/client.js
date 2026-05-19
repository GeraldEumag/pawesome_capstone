export const API_URL =
  process.env.VITE_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  "/api";

export const USE_MOCK_DATA = false;

const AUTH_TOKEN_KEYS = ["token", "access_token", "authToken", "customerToken", "adminToken", "clientToken"];

const getToken = () => {
  return AUTH_TOKEN_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
};

export const clearAuthStorage = () => {
  AUTH_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  ["role", "name", "username", "email", "user", "adminUser"].forEach((key) =>
    localStorage.removeItem(key)
  );
};

const normalizeEndpoint = (endpoint) => {
  if (!endpoint) return API_URL;

  if (endpoint.startsWith("http")) {
    return endpoint;
  }

  const fullUrl = `${API_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  
  return fullUrl;
};

const parseResponseText = (text) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { message: text };
  }
};

/**
 * Supports both:
 * apiRequest("/auth/login", "POST", payload)
 * apiRequest("/auth/login", { method: "POST", body: JSON.stringify(payload) })
 */
export const apiRequest = async (endpoint, methodOrOptions = "GET", data = null, extraOptions = {}) => {
  const token = getToken();
  const url = normalizeEndpoint(endpoint);

  let method = "GET";
  let body = null;
  let customHeaders = {};
  let options = {};

  if (typeof methodOrOptions === "string") {
    method = methodOrOptions.toUpperCase();
    body = data;
    options = extraOptions || {};
    customHeaders = options.headers || {};
  } else if (typeof methodOrOptions === "object" && methodOrOptions !== null) {
    method = (methodOrOptions.method || "GET").toUpperCase();
    body = methodOrOptions.body || data;
    options = methodOrOptions;
    customHeaders = methodOrOptions.headers || {};
  }

  const isFormData = body instanceof FormData;

  const headers = {
    Accept: "application/json",
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...customHeaders,
  };

  const config = {
    ...options,
    method,
    headers,
  };

  if (body !== null && body !== undefined) {
    config.body = isFormData || typeof body === "string" ? body : JSON.stringify(body);
  }

  delete config.params;

  try {
    const response = await fetch(url, config);
    const text = await response.text();
    const result = parseResponseText(text);

    
    if (response.status === 401) {
      // Check if this is a login request to show appropriate error message
      const isLoginRequest = endpoint.includes('/auth/login');
      
      if (!isLoginRequest) {
        clearAuthStorage();
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.assign("/login");
        }
        throw new Error("Your session expired or you are not logged in. Please log in again.");
      } else {
        // For login requests, show invalid credentials message
        throw new Error("Invalid email/username or password.");
      }
    }

    if (response.status === 403) {
      throw new Error("You are not allowed to access this page.");
    }

    if (!response.ok) {
      const message =
        result?.message ||
        result?.error ||
        Object.values(result?.errors || {}).flat().join(" ") ||
        "Request failed.";

      const error = new Error(message);
      error.status = response.status;
      error.response = result;
      error.url = url;
      throw error;
    }

    return result;
  } catch (error) {
    console.error("Network/API error:", error);
    throw error;
  }
};

/**
 * Normalizes API response to handle different response formats
 * Prevents "data.map is not a function" errors
 * @param {*} result - API response object
 * @param {string[]} keys - Priority keys to check for arrays
 * @returns {Array} Normalized array
 */
export const normalizeList = (result, keys = []) => {
  if (Array.isArray(result)) return result;

  for (const key of keys) {
    if (Array.isArray(result?.[key])) return result[key];
  }

  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.orders)) return result.orders;
  if (Array.isArray(result?.requests)) return result.requests;
  if (Array.isArray(result?.appointments)) return result.appointments;
  if (Array.isArray(result?.bookings)) return result.bookings;
  if (Array.isArray(result?.payments)) return result.payments;
  if (Array.isArray(result?.products)) return result.products;
  if (Array.isArray(result?.customers)) return result.customers;
  if (Array.isArray(result?.pets)) return result.pets;
  if (Array.isArray(result?.inventory)) return result.inventory;
  if (Array.isArray(result?.inventory_items)) return result.inventory_items;
  if (Array.isArray(result?.logs)) return result.logs;
  if (Array.isArray(result?.history)) return result.history;
  if (Array.isArray(result?.batches)) return result.batches;
  if (Array.isArray(result?.archived)) return result.archived;

  return [];
};

export const uploadProfilePhoto = async (endpoint, formData) => {
  return apiRequest(endpoint, "POST", formData);
};
