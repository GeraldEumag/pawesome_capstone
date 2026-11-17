# Admin API Audit

Route snapshot: `backend/route-snapshot-admin-audit-20261118.json` — **722 routes**
total; **132 admin-prefixed lines** covering activity-logs, appointments, boardings,
chatbot logs/FAQs, customers, inventory, landing-page, login-logs, reports, settings,
suppliers, users.

Snapshot-wide metrics: 29 routes without auth (public catalog/health/boarding
browse — verified acceptable), 39 authenticated routes without role middleware
(intentionally any-authenticated), 3 without throttle.

## Middleware chain (verified)

1. `ApiTokenAuth` — Sanctum PAT auth, rejects inactive users (401), enforces
   session inactivity via `last_used_at` + `security_session_timeout`, and now
   **enforces maintenance mode** for non-admin sessions (ADM-04).
2. `EnsureRole` — normalizes `vet`/`veterinarian`→`veterinary`,
   `super_admin`→`admin`; `admin` bypasses staff-role checks **except**
   customer-only routes (documented all-staff design).

## Endpoint verification (live, audit DB)

| Probe | Result |
|-------|--------|
| `GET /admin/dashboard` | 200 — all metrics reconciled vs SQL |
| `GET /admin/users` | 200 — excludes soft-deleted (11 of 14 rows) |
| `POST /admin/users` | creates user, welcome-email intent persisted (`email_deliveries`), activity logged |
| `PUT /admin/users/{id}` | updates; self-role-change → 403 (new guard) |
| `PATCH /admin/users/{id}/toggle` | works; self-toggle → 403; last-admin → 403 (new guards) |
| `DELETE /admin/users/{id}` | 422 JSON without reason (now JSON even w/o Accept header); tombstones email; self-delete → 403 |
| `POST /admin/users/{id}/restore` | restores; email-collision handled |
| `GET/POST /admin/settings/*` | round-trips only enforced keys; maintenance mode effective immediately |
| `GET /admin/activity-logs` | filtered + paginated; admin actions logged |
| `GET /admin/login-logs` + `/statistics` | success + **failed** logins recorded (ADM-02) |
| `GET /admin/reports/*` | all sub-reports 200; reconciled to DB |
| Chatbot logs/FAQs/notifications | verified |

## API contract fixes (ADM-05)

`bootstrap/app.php` now renders JSON for `api/*` exceptions regardless of
`Accept` header: validation 422s and 404s no longer return HTML/302 to API clients.

## Notes

- `GET /admin/users` paginates server-side (default 25/page, `per_page` capped
  at 200, whitelisted `sort`/`direction`, escaped `search`, deterministic
  `id` tie-breaker) and returns `meta` + `stats`. `?all=1` preserves the
  legacy full-list shape for export consumers.
- Mass-assignment of protected fields rejected — verified with crafted payloads.
