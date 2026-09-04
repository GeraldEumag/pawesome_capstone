import { apiRequest } from "../api/client";

// ─── In-memory TTL cache (per page session) ────────────────────────────────

const _memCache = {};

function getCached(key, ttlMs, fetchFn) {
  const now = Date.now();
  if (_memCache[key] && now - _memCache[key].ts < ttlMs) {
    return Promise.resolve(_memCache[key].data);
  }
  return fetchFn().then((data) => {
    _memCache[key] = { data, ts: Date.now() };
    return data;
  });
}

/** Manually invalidate a cache key (e.g. after a booking is created). */
export function invalidateCache(key) {
  delete _memCache[key];
}

// ─── Authenticated chatbot ─────────────────────────────────────────────────

export async function fetchChatbotWelcome() {
  return apiRequest("/chatbot/welcome");
}

export async function sendChatbotMessage(message, options = {}) {
  return apiRequest("/chatbot/message", {
    method: "POST",
    body: JSON.stringify({
      message,
      channel: options.channel || "web",
      context: options.context || {},
    }),
  });
}

/** Cached for 3 minutes — pets + services rarely change mid-session. */
export function fetchBookingOptions() {
  return getCached("booking_options", 3 * 60 * 1000, () =>
    apiRequest("/chatbot/workflow/booking-options")
  );
}

export async function createChatbotBooking(payload) {
  // payload: { pet_id, service_id, scheduled_at, notes? }
  invalidateCache("booking_options"); // pet list may change after booking
  return apiRequest("/chatbot/workflow/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function lookupChatbotAppointments(query) {
  return apiRequest("/chatbot/workflow/appointments/lookup", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

export async function searchChatbotInventory(query) {
  return apiRequest("/chatbot/workflow/inventory/search", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

// ─── Hotel Booking ─────────────────────────────────────────────────────────

/** Cached for 3 minutes — rooms / pets rarely change mid-session. */
export function fetchHotelOptions() {
  return getCached("hotel_options", 3 * 60 * 1000, () =>
    apiRequest("/chatbot/workflow/hotel-options")
  );
}

export async function checkHotelAvailability(checkIn, checkOut, roomType = null) {
  const params = new URLSearchParams({ check_in: checkIn, check_out: checkOut });
  if (roomType) params.append("room_type", roomType);
  return apiRequest(`/chatbot/workflow/hotel/availability?${params.toString()}`);
}

export async function createChatbotHotelBooking(payload) {
  // payload: { pet_id, hotel_room_id?, check_in, check_out, special_requests? }
  invalidateCache("hotel_options"); // room availability may change after booking
  return apiRequest("/chatbot/workflow/hotel-bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Public chatbot (landing page — no auth) ────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

export async function fetchPublicChatbotWelcome() {
  const res = await fetch(`${API_BASE}/chatbot/public/welcome`);
  if (!res.ok) throw new Error("Failed to reach chatbot.");
  return res.json();
}

export async function sendPublicChatbotMessage(message) {
  const res = await fetch(`${API_BASE}/chatbot/public/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error("Failed to reach chatbot.");
  return res.json();
}
