# Admin Permission Matrix (verified live)

Identities probed: unauthenticated, admin, manager, receptionist,
super_receptionist, cashier, inventory, veterinary, vet_tech, customer.

Rate-limit note: an early matrix run was polluted by 429s; the final matrix ran
after decay with per-user token-aware throttling.

## Representative results

| Endpoint | unauth | admin | manager | recep | cashier | inv | vet | vet_tech | customer |
|----------|--------|-------|---------|-------|---------|-----|-----|----------|----------|
| `GET /admin/dashboard` | 401 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `GET /admin/users` | 401 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `GET /admin/settings` | 401 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `GET /admin/activity-logs` | 401 | 200 | 200* | 403 | 403 | 403 | 403 | 403 | 403 |
| `GET /admin/login-logs` | 401 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `POST /admin/users` | 401 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `POST /admin/settings/*` | 401 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `DELETE /admin/users/{id}` | 401 | 200/422 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `POST /admin/chatbot/faqs` | 401 | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| `GET /customer/overview` | 401 | **403** | 403 | 403 | 403 | 403 | 403 | 403 | 200 |
| Staff portals (`/receptionist/*`, `/cashier/*`, `/inventory/*`, `/manager/*`, `/veterinary/*`) | 401 | **200** | own-role only | own | own | own | own | own | 403 |

\* manager has a shared read on activity logs — intentional.

## Role semantics confirmed

- `admin` is the **all-staff** role by design (AGENTS.md) — reaches every staff
  module; Gate B's "admin SHOULD be blocked" rows are a stale gate expectation.
- `admin` is **blocked from customer-only routes** — verified 403.
- `super_admin` normalizes to `admin`; no longer assignable.
- `super_receptionist` expands to receptionist + cashier + inventory.
- `EnsureRole` normalizes `vet`/`veterinarian` → `veterinary`.

## Self/lockout protections (new — ADM-01)

| Action | Before | After |
|--------|--------|-------|
| Self-deactivate via `PATCH .../toggle` | allowed → lockout | **403** |
| Self-deactivate/demote via `PUT /users/{id}` | allowed → lockout | **403** |
| Self-delete | allowed | **403** |
| Deactivate/delete **last active admin** | allowed | **403** |
| Deactivate another admin (when ≥2 exist) | allowed | allowed |

## Token lifecycle

- Inactive-user tokens → 401 immediately.
- Revoked (logout) tokens → 401.
- Session inactivity enforced via `last_used_at` + `security_session_timeout`.
- Old tokens of a demoted user correctly lose admin access (403).
