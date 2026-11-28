# 08 — Frontend Deployment (Verified Live)

Date: 2026-11-28 · Live URL: `https://pawesome-iota.vercel.app`

## Deployment

| Item | Result |
|---|---|
| Trigger | Push to `main` on `GeraldEumag/pawesome_capstone` auto-deployed to Vercel Production |
| Deployment | `pawesome-k7njvp0c5-llanetageraldrudolph-2990s-projects.vercel.app` — Ready, 35s build |
| Alias | `pawesome-iota.vercel.app` serves the new production deployment |
| Root/build/output | `frontend/` · `npm run build` · `build/` (`frontend/vercel.json`) |

## Defect found & fixed

**`VITE_API_BASE_URL` was EMPTY** in Vercel production env — the previously deployed frontend had no API target (latent breakage; any env fallback would have been localhost). Set to `https://pawesome-production-c73a.up.railway.app/api`, production redeployed.

## Post-deploy verification (executed)

| Check | Result | Evidence |
|---|---|---|
| App loads | ✅ | `GET /` → HTTP 200, `<title>Pawesome MIS</title>`, SPA served |
| API URL baked in | ✅ | bundle `assets/index-tozO43NV.js` contains `https://pawesome-production-c73a.up.railway.app/api` (3 occurrences) |
| No localhost API refs | ✅ | `localhost`/`127.0.0.1` strings in bundle are library internals only (workbox, html5-qrcode HTTPS checks, Node URL polyfill) — zero API endpoint references |
| Secrets in bundle | ✅ none | `VITE_*` holds only the public API base URL |
| CORS from deployed origin | ✅ | preflight from `https://pawesome-iota.vercel.app` → 204 + `access-control-allow-origin: https://pawesome-iota.vercel.app`; evil origin → **no ACAO header** |
| Auth across domains | ✅ | login/register/pet/booking calls executed against live API with bearer tokens (see report 10) |

## Integration status

Frontend ↔ backend integration verified through the live smoke matrix (report 10): authenticated API calls from the production domain succeed; unauthenticated/cross-origin requests are correctly rejected.
