# Notification Module — Security Audit

**Date:** 2026-11-18

## Threat checks performed

| # | Check | Method | Result |
|---|---|---|---|
| 1 | Broken object-level authz / IDOR on `/{id}/read`, `DELETE /{id}` | Feature test + live e2e (customer vs receptionist row) | ✅ 404 — `forUser` scope + `findOrFail` |
| 2 | Cross-customer feed access | index scoping test | ✅ `forUserOrRole(user.id, role)` only |
| 3 | Unauthorized `mark-all-read`/`clear-all` side-effects | broadcast immutability + cross-user tests | ✅ owned rows only |
| 4 | Unauthenticated access | `auth.api` middleware | ✅ 401 on all endpoints (tested) |
| 5 | Role spoofing / unauthorized create | `POST /` non-admin | ✅ 403 — `role:admin` middleware + `hasRoleAccess` recheck |
| 6 | Notification injection (staff → arbitrary customer) | `booking-status` endpoint review | ✅ **endpoint removed** — previously let receptionist/manager/admin POST arbitrary `message` to any email-resolved user |
| 7 | Latent IDOR code | `Api\NotificationController` (dead, unrouted) had unscoped route-model binding + open `store` | ✅ **file deleted** — cannot be accidentally routed |
| 8 | Stored XSS via title/message | React renders `{item.title}`/`{item.message}` as text; no `dangerouslySetInnerHTML` anywhere in notification UI | ✅ safe |
| 9 | Mass assignment | `store`/`Notification::create` uses explicit fillable fields; `data` cast to array | ✅ |
| 10 | SQL injection | All queries via Eloquent scopes/bindings | ✅ |
| 11 | Payload sensitivity | `data` JSON written only by server-side producers; `store` validates `data` as array | ✅ producers control content |
| 12 | User-ID spoofing | `user_id` for `store` must `exists:users,id`; for all other paths recipient = token user | ✅ |
| 13 | Rate limiting | `throttle:api` on the whole group | ✅ |
| 14 | Shared broadcast mutation | one recipient could flip shared `read` state | ✅ **fixed** — mutations now `forUser(caller)` only |
| 15 | Email/in-app coupling | email failure must not corrupt in-app row | ✅ `sendEmailNotification` catches + logs |

## Malicious-request results (live + tests)

- Customer A → Customer B's `/{id}/read` → **404** (e2e)
- Customer A → Customer B's `DELETE` → **404** (e2e)
- Customer → `POST /` create → **403** (e2e + test)
- Anonymous → `GET /` → **401** (e2e + test)
- Receptionist → shared broadcast row `read`/`delete`/`mark-all`/`clear-all` → row **unchanged** (feature test)

## Residual notes (documented, non-blocking)

- `forUserOrRole` on **read** endpoints intentionally includes legacy
  broadcast rows for the caller's effective role. They are visible-but-frozen;
  producers no longer create them.
- `vet_tech` users do not inherit `veterinary` role notifications — a product
  semantics question, not an authz bypass (their own rows remain private).
- Deactivated users' tokens are revoked at `auth.api` (`is_active` check) —
  they cannot read or mutate notifications. `notifyRole` also filters
  `is_active` at write time.
