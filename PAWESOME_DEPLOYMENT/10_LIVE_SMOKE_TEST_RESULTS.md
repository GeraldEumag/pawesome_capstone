# 10 — Live Production Smoke Test Results (27-Point Matrix)

Date: 2026-11-28 · Environment: `https://pawesome-iota.vercel.app` + `https://pawesome-production-c73a.up.railway.app/api` · Commit `20fe0c53`

Test accounts: staff `admin@example.com` (role admin, real seeded account — read/auth tests only); customer `kiezerherristpascua+smoke1795862336@gmail.com` (id 52, created for this test). Test data: pets 23–25, appointments 30–31, inventory item 846 (SMOKE-001), POS transaction 21.

| # | Test | Result | Evidence |
|---:|---|---|---|
| 1 | Backend health | **PASS** | `GET /api/health` → 200 `{"status":"ok"}` |
| 2 | HTTPS | **PASS** | valid TLS both domains; `http://` → 301 to `https://` |
| 3 | Frontend load | **PASS** | `GET /` → 200, `<title>Pawesome MIS</title>`, hashed assets served |
| 4 | Production API URL | **PASS** | bundle contains Railway API URL; no localhost API refs |
| 5 | Staff login | **PASS** | `POST /auth/login` admin → 200, role `admin`, token issued |
| 6 | Customer login | **PASS** | → 200, role `customer`, token issued |
| 7 | Customer registration | **PASS** | → 201/user id 52, verification outbox intent created |
| 8 | Email verification | **PASS\*** | outbox id 442 → Brevo `accepted` (msg id captured). *Inbox receipt pending owner confirmation* |
| 9 | Password reset | **PASS\*** | forgot → generic 200; outbox id 445 → Brevo `accepted`. *Inbox pending* |
| 10 | Pet creation | **PASS** | `POST /customer/pets` → 201, ids 23/24/25 |
| 11 | Pet photo upload | **PASS** | multipart create → `pet_photos/*.png` on private disk; signed view URL → 200 `image/png` |
| 12 | Species compatibility (valid) | **PASS** | dog + grooming service → 201 appointment id 30 |
| 13 | Species mismatch | **PASS** | rabbit + grooming → 422 `service_not_allowed` |
| 14 | Appointment booking | **PASS** | ids 30, 31 `requested`, correct UTC storage (verified post-`APP_TIMEZONE=UTC` fix) |
| 15 | Booking notification | **PASS** | `appointment.created` deliveries 443/444 → Brevo `accepted` |
| 16 | Inventory creation | **PASS** | `POST /admin/inventory` → 201, item id 846 |
| 17 | Inventory adjustment | **PASS** | decrement 50→45 via `adjust-stock`, persisted |
| 18 | POS sale | **PASS** | `POST /cashier/pos/transaction` → 200, TRX id 21 `completed` |
| 19 | VAT 12% inclusive | **PASS** | total 200.00 → `tax_amount` 21.43 (= 200/1.12×0.12) |
| 20 | Receipt generation | **PASS** | `GET /cashier/receipt/21` → 200 full receipt JSON |
| 21 | PDF generation | **PASS** | live `PayslipPdfService::render` on prod container → 317,173-byte `%PDF-1.7` |
| 22 | PDF branding | **PASS** | payslip data/template carries company identity (Pawesome Retreat Inc.); same audited template as verified render |
| 23 | Payment proof authorization | **PASS** | `/files/payment-proofs/*` no-auth → 401; pet photo cross-user → 403; own signed URL → 200 |
| 24 | Email outbox | **PASS** | intents created → dispatched → processed; `jobs=0`, `failed_jobs=0` |
| 25 | Queue worker | **PASS** | manual `queue:work` drained backlog (all DONE); recurring drain live in scheduler logs |
| 26 | Scheduler | **PASS** | `schedule:work` executing `email-deliveries:dispatch` (every min), `:reconcile` (10 min), queue drain (every min) |
| 27 | RBAC and CORS | **PASS** | customer→admin 403, customer→POS 403, customer→staff-route 403/404, no-token→401; ACAO only for exact Vercel origin, evil origin gets no ACAO |

## Score: 27/27 executed — 25 unconditional PASS, 2 PASS pending inbox confirmation (#8, #9 — provider acceptance verified; delivery to the owner's Gmail is the only unobservable hop)

## Anomalies noted (not failures)

- `PUT /customer/pets/{id}` with multipart image → 422 (PHP cannot parse multipart PUT bodies — pre-existing platform limitation; photo upload works via POST create, which is the path the frontend uses for new pets). Worth a follow-up if pet-photo *updates* are needed.
- `POST /admin/inventory/{id}/adjust-stock` rejects `increment`/"add" — by design ("Stock increases must be recorded as a new batch"); `decrement`/`set` work.
- POS "invoice PDF" endpoint returns JSON (client-side jsPDF is the actual PDF path — per audit).
