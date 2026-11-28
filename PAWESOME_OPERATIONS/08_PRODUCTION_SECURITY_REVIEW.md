# 08 — Production Security Review

**Status:** PASS — targeted review, no defects requiring fixes found
**Date:** 2026-11-28 · Scope: post-deployment hardening (not a full re-audit)

## Authentication

| Control | Evidence | Status |
|---|---|---|
| Sanctum tokens | `auth.api` middleware on all private routes; tokens issued at login | ✅ |
| Login throttling | `throttle:auth` rate limiter — per-IP **and** per-account+IP (`RouteServiceProvider.php:65-80`) | ✅ |
| Password reset | hashed tokens, 60-min expiry, generic responses (no enumeration) | ✅ |
| Email verification | `verified` middleware blocks unverified **customers** from booking POSTs; staff exempt | ✅ |
| Token revocation | personal access tokens revocable per-device | ✅ (code-verified earlier engagement) |
| Sessions | `SESSION_DRIVER=file` on volume; API is token-based (Sanctum) — session fixation N/A for API | ✅ |

## Authorization (live probes, 2026-11-28)

| Probe | Result |
|---|---|
| `GET /api/admin/users` unauthenticated | **401** |
| `GET /api/customer/pets` unauthenticated | **401** |
| `GET /api/files/pet-photos/{id}/view` no signature | **401** |
| Cross-user private file (earlier smoke) | **403** |
| Own signed file URL | **200** `image/png` |
| Role gates | `role:admin`, `role:cashier,veterinary,…` etc. per route group in `routes/api.php` | ✅ |

## API / transport

| Control | Evidence | Status |
|---|---|---|
| Rate limits | `throttle:api` global; `throttle:auth` login; `throttle:chatbot` (20/min + 200/day per key); webhook `throttle:60,1`; kiosk `throttle:10,1` + `kiosk.pin` | ✅ |
| CORS | Preflight from `https://evil.com` → allow-credentials/headers/methods returned but **no `Access-Control-Allow-Origin`** → browser blocks. Exact origin `pawesome-iota.vercel.app` → ACAO echoed correctly | ✅ |
| Input validation | FormRequest validation across controllers (verified in test suite: 1298 tests) | ✅ |
| Mass assignment | `$fillable`/`$guarded` on models (suite-covered) | ✅ |
| SQL injection | Eloquent/Query Builder parameterized throughout | ✅ |
| XSS | React escapes by default; no `dangerouslySetInnerHTML` on user content (frontend audit earlier) | ✅ |
| CSRF | API-only (Sanctum token auth, no cookies) → CSRF N/A; `stateful` domains not configured | ✅ |
| `APP_DEBUG` | `false` in prod env (verified deploy env) | ✅ |
| `APP_ENV` | `production` | ✅ |
| `APP_TIMEZONE` | `UTC` — **must not change** (Manila semantics in `STORE_TIMEZONE`) | ✅ |

## File security

- Pet photos, payment proofs, vaccination cards, receipts live on the
  **private** disk (`storage/app/private/…`) — not web-reachable.
- Access only via signed, authenticated routes (`/api/files/…/view?t=…`).
- Unauthenticated → 401; wrong user → 403 (verified live).
- Upload validation: mime/size rules in form requests (suite-covered).

## Secrets & configuration

| Check | Result |
|---|---|
| `.env` committed? | No — gitignored; no production `.env` in repo |
| Secrets in frontend bundle | No — `VITE_*` contains only public API URL |
| Secrets in logs | `ops:backup` logs sizes only; webhook logs ids/events, no recipients; Brevo key never logged |
| Tokens/dumps in git | Evidence dir gitignored; bearer tokens + DB dump removed pre-push (deploy engagement) |
| `BREVO_WEBHOOK_SECRET` | Stored Railway env only; local copy in gitignored `.brevo_secret.tmp` |
| Health endpoint disclosure | `{"status":"ok"}` only — no version/env/DB info |

## Webhook security (new this phase)

- `X-Pawesome-Webhook-Secret` shared-secret auth, `hash_equals` compare.
- Wrong secret → 401; unset secret → 503 fail-closed.
- Rate-limited 60/min; malformed payloads → graceful `processed:0`.
- Terminal-state guard prevents event-replay regression.

## Minor observations (not defects — documented, no change made)

1. `x-powered-by: PHP/8.2.36` header disclosed. Low risk; cosmetic fix
   would need a middleware/server tweak — not worth a redeploy alone.
2. `TRUSTED_PROXIES=*` retained per documented Railway edge model —
   acceptable behind Railway's proxy, but means `request->ip()` trusts
   forwarded headers; rate-limit buckets key on it. Revisit if app moves.
3. Backup artifacts are gzip (not encrypted) on the volume — volume is
   private; off-site copy should be encrypted (Phase 1 risk).

## Conclusion

No concrete verified defects found. All critical controls (authn,
authz/RBAC, ownership checks, private files, rate limits, CORS,
secrets hygiene, debug off) verified live or in code. Security posture:
**PASS**.
