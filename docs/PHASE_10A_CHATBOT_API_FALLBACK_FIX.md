# Phase 10A — Chatbot API Fallback Fix

**Date:** 2026-10-11 · Branch `main` @ `66ff1d2` · Scope: frontend only, no deploy/push/commit.

## 1. Defect

`frontend/src/services/chatbotService.js` resolved the public-chatbot API base as:

```js
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";
```

## 2. Root cause

The public chatbot functions (`fetchPublicChatbotWelcome`, `sendPublicChatbotMessage`) bypassed the shared API client (they're unauthenticated landing-page calls) and maintained a **second, divergent URL configuration**. When `VITE_API_BASE_URL` was unset at build time, requests silently targeted the viewer's own `127.0.0.1:8000` — a wrong-server failure that surfaces as a generic fetch error in production and leaks a dev URL into the bundle. The authenticated half of the same file already used the shared `apiRequest`/`API_URL`, so the two halves could disagree.

## 3. Fix

Derive `API_BASE` from the shared `API_URL` export of `src/api/client.js` — the same resolution chain every other API call uses (`VITE_API_BASE_URL` → `REACT_APP_API_URL` → relative `/api`), with trailing slashes stripped so `${API_BASE}/chatbot/public/...` can't produce `//`:

```js
import { apiRequest, API_URL } from "../api/client";
// ...
const API_BASE = API_URL.replace(/\/+$/, "");
```

- No second config system — the chatbot can no longer drift from the main client.
- Missing config now yields relative `/api`, identical to the main client: correct same-origin behavior locally via the Vite dev proxy (`/api` → `127.0.0.1:8000`), and a deliberate same-origin 404 on a misconfigured Vercel deploy rather than silent localhost traffic.
- Public endpoints still use bare `fetch` (unauthenticated, no token attached) — only the base-URL source changed. Headers, methods, error handling, and the 3-minute TTL cache are untouched.

## 4. Files changed

| File | Change |
|---|---|
| `frontend/src/services/chatbotService.js` | Import `API_URL`; replace hardcoded `127.0.0.1` fallback with shared-client base (2 lines → 4) |
| `frontend/tests/chatbot-api-base.test.mjs` | **New** — 9 `node:test` regression cases |
| `frontend/tests/esm-specifier-hooks.mjs` | **New** — ESM resolve hook so Node can import Vite-style extensionless specifiers (test infra only) |

No backend files touched; the API contract is unchanged.

## 5. Regression tests

`node --test tests/chatbot-api-base.test.mjs` — **9/9 pass** (1.69s):

1. Configured `VITE_API_BASE_URL` used as-is for public calls
2. Trailing slash on base → no `//` in joined URL
3. No duplicated `/api/api/` segment when base ends with `/api`
4. Missing config → same-origin `/api/...`, never localhost/127.0.0.1
5. Legacy `REACT_APP_API_URL` honored (parity with main client)
6. `VITE_API_BASE_URL` precedence over `REACT_APP_API_URL`
7. Public POST sends JSON `Content-Type`/`Accept`
8. Authenticated message uses same base + `Bearer` token
9. Source-level guard: file contains no `127.0.0.1`/`localhost` literal and imports `API_URL`

Each case spawns the real service module under controlled env with a stubbed `fetch` and asserts the exact request URL.

## 6. Verification results (executed)

| Gate | Result |
|---|---|
| `node --test tests/chatbot-api-base.test.mjs` | **9/9 PASS** |
| `npm run build` (vite → `build/`) | **PASS**, 19.9s — pre-existing chunk-size/dynamic-import warnings only |
| `git diff --check` | clean (only pre-existing CRLF warnings elsewhere) |
| Built-bundle scan `build/` for `127.0.0.1` | **none** — only `localhost` strings from the local gitignored `.env` (`VITE_API_BASE_URL=http://localhost:8000/api`, inlined correctly for a local build) and a Vite `import.meta` polyfill |
| Source scan `src/` for localhost | only `QrScanner.jsx` camera-HTTPS check (reads `window.location.hostname` — not an API URL) |

## 7. Remaining limitations

- The fallback defect is fixed, but deployed verification still requires the restored Railway backend — `pawesome-production.up.railway.app` remains `404 Application not found` (Phase 10 finding F1).
- A Vercel deploy **without** `VITE_API_BASE_URL` now fails as same-origin `/api` 404s — deliberate and diagnosable, but the env var remains a hard prerequisite for production.
- `http://localhost` appearing in a locally-built bundle is expected (local `.env`); production bundles inherit Vercel's project env instead. `.env` is gitignored, so no secret or dev URL is committed.

## 8. Locally verified: **YES** — deployed verification: **BLOCKED** on infrastructure (see `PHASE_10_DEPLOYMENT_RECOVERY_CHECKLIST.md`).
