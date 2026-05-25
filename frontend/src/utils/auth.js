/**
 * Centralized authentication module.
 * Wraps localStorage to provide a single source of truth for auth state.
 * Backward-compatible: reads from legacy keys during migration.
 */

const LEGACY_TOKEN_KEYS = [
  "token",
  "access_token",
  "authToken",
  "customerToken",
  "adminToken",
  "clientToken",
];

const STANDARD_TOKEN_KEY = "pawesome_auth_token";
const ROLE_KEY = "role";
const USER_KEYS = ["name", "username", "email", "user", "adminUser"];

/* ─── Token ─── */

export const getToken = () => {
  // Prefer standardized key
  const standard = localStorage.getItem(STANDARD_TOKEN_KEY);
  if (standard) return standard;

  // Fallback to legacy keys (migration path)
  for (const key of LEGACY_TOKEN_KEYS) {
    const value = localStorage.getItem(key);
    if (value) {
      // Migrate to standard key
      localStorage.setItem(STANDARD_TOKEN_KEY, value);
      return value;
    }
  }
  return null;
};

export const setToken = (token) => {
  if (!token) {
    localStorage.removeItem(STANDARD_TOKEN_KEY);
    return;
  }
  localStorage.setItem(STANDARD_TOKEN_KEY, token);
};

/* ─── Role ─── */

export const getRole = () => localStorage.getItem(ROLE_KEY);

export const setRole = (role) => {
  if (!role) {
    localStorage.removeItem(ROLE_KEY);
    return;
  }
  localStorage.setItem(ROLE_KEY, role);
};

/* ─── User Data ─── */

export const getUserData = () => {
  const data = {};
  for (const key of USER_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
};

export const setUserData = (data) => {
  if (!data || typeof data !== "object") return;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      localStorage.setItem(key, String(value));
    }
  }
};

/* ─── Auth State ─── */

export const isAuthenticated = () => !!getToken();

export const clearAuth = () => {
  localStorage.removeItem(STANDARD_TOKEN_KEY);
  for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  localStorage.removeItem(ROLE_KEY);
  for (const key of USER_KEYS) localStorage.removeItem(key);
};

/* ─── Events ─── */

const AUTH_CHANGE_EVENT = "pawesome:auth-change";

export const notifyAuthChange = () => {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
};

export const onAuthChange = (callback) => {
  const handler = () => callback();
  window.addEventListener(AUTH_CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
};
