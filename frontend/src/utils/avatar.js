const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) ||
  "";

const API_ORIGIN = API_BASE_URL
  ? API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "")
  : "";

/**
 * Resolve a profile/avatar URL for use in <img src>.
 *
 * Handles every shape the backend can produce:
 * - data: URIs (the initials-avatar fallback) — passed through, with any
 *   corrupted "?v=" cache-buster stripped ("?" can never appear in base64)
 * - blob: / absolute http(s) URLs — passed through
 * - /api/... paths — resolved against the API origin (VITE_API_BASE_URL),
 *   so they work when frontend and backend live on different origins
 * - anything else — returned unchanged
 */
export const resolveAvatarUrl = (url) => {
  if (!url) return null;
  if (url.startsWith("data:")) {
    // Repair data URIs corrupted by an appended "?v=" cache-buster
    return url.replace(/\?v=.*$/, "");
  }
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  if (url.startsWith("/")) {
    return `${API_ORIGIN || window.location.origin}${url}`;
  }
  return url;
};

export default resolveAvatarUrl;
