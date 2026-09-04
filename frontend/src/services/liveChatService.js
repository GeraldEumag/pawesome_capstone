import { apiRequest } from "../api/client";

const BASE = "/chatbot/live-chat";

// ─── Customer ─────────────────────────────────────────────────────────────

export async function getMySession() {
  return apiRequest(`${BASE}/session`);
}

export async function startLiveChat() {
  return apiRequest(`${BASE}/start`, { method: "POST" });
}

export async function sendCustomerMessage(sessionId, message) {
  return apiRequest(`${BASE}/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function pollMessages(sessionId, afterId = 0) {
  return apiRequest(`${BASE}/${sessionId}/messages?after_id=${afterId}`);
}

export async function customerCloseChat(sessionId) {
  return apiRequest(`${BASE}/${sessionId}`, { method: "DELETE" });
}

// ─── Staff ────────────────────────────────────────────────────────────────

export async function getInbox() {
  return apiRequest(`${BASE}/inbox`);
}

export async function claimSession(sessionId) {
  return apiRequest(`${BASE}/${sessionId}/claim`, { method: "POST" });
}

export async function staffReply(sessionId, message) {
  return apiRequest(`${BASE}/${sessionId}/reply`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function closeSession(sessionId) {
  return apiRequest(`${BASE}/${sessionId}/close`, { method: "PATCH" });
}

export async function pollSessionMessages(sessionId, afterId = 0) {
  return apiRequest(`${BASE}/${sessionId}/messages?after_id=${afterId}`);
}
