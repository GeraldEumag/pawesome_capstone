import { API_URL } from "./client";
import { getToken } from "../utils/auth";

const UNLOCK_KEY = "pawesome_kiosk_unlocked";
const PIN_KEY = "pawesome_kiosk_pin";

// Keep the shared kiosk secret scoped to one browser tab/session.
if (typeof window !== "undefined") {
  window.localStorage.removeItem(UNLOCK_KEY);
  window.localStorage.removeItem(PIN_KEY);
}

export const isKioskUnlocked = () =>
  sessionStorage.getItem(UNLOCK_KEY) === "1";

export const getKioskPin = () => sessionStorage.getItem(PIN_KEY) || "";

export const unlockKiosk = (pin) => {
  sessionStorage.setItem(UNLOCK_KEY, "1");
  sessionStorage.setItem(PIN_KEY, pin);
};

export const lockKiosk = () => {
  sessionStorage.removeItem(UNLOCK_KEY);
  sessionStorage.removeItem(PIN_KEY);
};

/**
 * Kiosk-specific request helper. Unlike apiRequest it never clears auth state
 * or fires the auth-expired redirect — the kiosk page is public and a missing
 * PIN must not bounce a logged-in manager to /login.
 */
export const kioskRequest = async (endpoint, { method = "GET", body, idempotencyKey } = {}) => {
  const token = getToken();
  const pin = getKioskPin();
  const punchKey = method.toUpperCase() === "POST" && endpoint.endsWith("/punch")
    ? (idempotencyKey || window.crypto.randomUUID())
    : null;

  const res = await fetch(`${API_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(pin ? { "X-Kiosk-Pin": pin } : {}),
      ...(punchKey ? { "Idempotency-Key": punchKey } : {}),
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
