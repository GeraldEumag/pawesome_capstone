import { useEffect, useState } from "react";
import { getAuthenticatedFileUrl } from "../api/client";

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) ||
  "";

const API_ORIGIN = API_BASE_URL
  ? API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "")
  : "";

// URLs that require an authenticated fetch (F-09): the /api/files/* secure
// file endpoints are behind auth.api, so plain <img src> gets 401.
const SECURE_FILE_PATH_RE = /\/api\/files\/(.+)$/;

const toApiPath = (resolvedUrl) => {
  const match = resolvedUrl.match(SECURE_FILE_PATH_RE);
  return match ? `/api/files/${match[1]}` : null;
};

/**
 * Resolve an image URL for <img src>, fetching /api/files/* endpoints with
 * the auth token and returning a blob: URL (revoked on cleanup). All other
 * URL shapes pass through resolveAvatarUrl unchanged. Returns null while a
 * secure image is loading or if the fetch fails — callers should fall back
 * to the initials avatar.
 */
export const useAuthenticatedImage = (url) => {
  const resolved = resolveAvatarUrl(url);
  const apiPath = resolved ? toApiPath(resolved) : null;
  const [src, setSrc] = useState(() => (apiPath ? null : resolved));

  useEffect(() => {
    if (!apiPath) {
      setSrc(resolved);
      return;
    }

    let objectUrl = null;
    let cancelled = false;
    setSrc(null);

    getAuthenticatedFileUrl(apiPath)
      .then((blobUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        objectUrl = blobUrl;
        setSrc(blobUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resolved, apiPath]);

  return src;
};

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
