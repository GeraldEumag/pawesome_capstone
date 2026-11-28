# 11 — Security & RBAC Audit

## RBAC model (verified)

7 roles: customer, receptionist, cashier, inventory, veterinary,
manager, admin + composite `super_receptionist` (receptionist+cashier+
inventory). `super_admin` merged into `admin`; stale values normalize.

`EnsureRole` middleware (verified):
- `admin` bypasses role checks for staff modules but is **blocked from
  the customer portal** — verified in middleware + portal guards.
- `super_receptionist` expands to its three constituent roles.
- `veterinary`/`vet`/`veterinarian` spellings normalize.

## Authorization matrix spot-checks (code-level + suite)

| Surface | Enforcement | Evidence |
| --- | --- | --- |
| Staff dashboards/APIs | `role:*` middleware per module | route dump: all staff mutations carry role middleware |
| Customer data isolation | customer endpoints resolve customer from auth user; pet ownership re-checked (`Pet::where(customer_id)`) | `PortalController`, `PetController`, boarding/grooming stores |
| Cross-customer access | `canAccessAppointment`-style ownership checks; 404-not-403 on foreign resources | `AppointmentController` |
| Payment verify/reject | cashier/admin role + `PaymentVerificationService` state guards | `CashierPaymentController`, receipts confirm service |
| Inventory mutations | inventory/admin roles; public browse is read-only + `PublicInventoryExposureTest` | `InventoryRoleAuthorizationTest` |
| Payroll/payslips | admin/manager-scoped; payslip PDF behind auth | route audit |
| Admin user management | `role:admin`; self-deactivation/self-role-change/self-delete blocked | `AdminDeepAuditTest` (passing) |
| Kiosk | shared PIN (`kiosk.pin` middleware) or staff token; `throttle:10,1` on verify | routes/api.php:92-99 |
| Webhooks | shared-secret header, constant-time-ish compare, 503 when unconfigured | `BrevoWebhookController` |

## Injection / traversal

- Eloquent/Query Builder parameterization throughout; `whereRaw` uses
  bound parameters (`LOWER(category) = ?`).
- File uploads: `mimes`/`mimes:` validation + `FileStorageService`
  private-disk paths; payment proofs never publicly readable.
- No `eval`, no raw SQL string interpolation of user input found on
  audited paths.

## Secrets & config

- `.env` not web-reachable (root `.htaccess` deny — intentional).
- Brevo key via env only; webhook secret via env; no credentials in
  repo or `VITE_*` vars (AGENTS.md rule re-verified — no mail keys in
  frontend).
- Queue/mail credentials documented for deployment, not committed.

## Prior-audit security claims re-verified

- Idempotency middleware on POS transaction — present.
- `WorkflowNotifier` post-commit — present.
- Email outbox (`email_deliveries`) with send-time suppression —
  architecture confirmed in AGENTS.md + `EmailDeliveryService` usage in
  receipt webhook.
- F-01 HTTP-utility removal — audit scripts confirmed absent from repo,
  living in `C:/xampp/pawesome-maintenance/`.

## Known residual risks (documented, not blocking)

- Shared kiosk PIN is a symmetric secret — acceptable for a lobby
  kiosk; rotation endpoint exists for managers.
- Brevo webhook auth is a shared secret (Brevo lacks HMAC) — documented
  in controller; recommend IP allowlisting at deployment.
- Rate limiting relies on Laravel throttle; production should sit behind
  a WAF/reverse proxy.

## Verdict

**PASS** — RBAC is consistent, customer isolation enforced, no
unauthenticated mutation surface beyond the three justified endpoints.
