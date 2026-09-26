import { API_URL } from "./client";
import { getToken } from "../utils/auth";

const UNLOCK_KEY = "pawesome_kiosk_unlocked";
const PIN_KEY = "pawesome_kiosk_pin";

// localStorage (not sessionStorage) so the unlock survives page refreshes,
// new tabs, and preview-proxy sessions on a shared kiosk machine.
export const isKioskUnlocked = () =>
  localStorage.getItem(UNLOCK_KEY) === "1";

export const getKioskPin = () => localStorage.getItem(PIN_KEY) || "";

export const unlockKiosk = (pin) => {
  localStorage.setItem(UNLOCK_KEY, "1");
  localStorage.setItem(PIN_KEY, pin);
};

export const lockKiosk = () => {
  localStorage.removeItem(UNLOCK_KEY);
  localStorage.removeItem(PIN_KEY);
};

/**
 * Kiosk-specific request helper. Unlike apiRequest it never clears auth state
 * or fires the auth-expired redirect — the kiosk page is public and a missing
 * PIN must not bounce a logged-in manager to /login.
 */
export const kioskRequest = async (endpoint, { method = "GET", body } = {}) => {
  const token = getToken();
  const pin = getKioskPin();

  const res = await fetch(`${API_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(pin ? { "X-Kiosk-Pin": pin } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.message || "Request failed.");
    err.status = res.status;
    err.response = data;
    throw err;
  }

  return data;
};
