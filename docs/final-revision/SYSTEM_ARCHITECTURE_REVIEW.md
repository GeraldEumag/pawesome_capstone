# SYSTEM_ARCHITECTURE_REVIEW.md — Pawesome Capstone B (Final Revision)

**Date:** 2026-11-24 · **Branch:** `audit/pawesome-final-acceptance` · **Baseline HEAD:** `3ec1845b` (+ revision commits)

## 1. Stack (verified this revision)

| Layer | Technology | Version (verified) |
|---|---|---|
| Backend | Laravel (PHP) | 12.72 / PHP 8.2.12 |
| Frontend | React + Vite | React 18 / Vite 6.4.5 / Node 24.13.1 |
| Database | MySQL (authoritative: 8.0.44 @127.0.0.1:3307); local XAMPP MariaDB 10.4.32 @3306 for dev data | — |
| Auth | Laravel Sanctum PATs + custom `ApiTokenAuth` middleware | — |
| Queue/Mail | `emails` DB queue, `SendEmailDelivery` job, Brevo HTTPS API | — |
| E2E | Playwright (`frontend/e2e/`) + PHP audit harness (`C:/xampp/pawesome-maintenance/`) | — |

## 2. Module map (current HEAD)

- **Auth/identity:** `AuthController` (register/login/logout/profile), email verification + password reset via durable `email_deliveries` outbox, `ApiTokenAuth` (rejects `!is_active`, normalizes stale `super_admin`→`admin`).
- **Roles (7):** customer, receptionist, cashier, inventory, veterinary, manager, admin; `super_receptionist` = composite (receptionist+cashier+inventory); `admin` = all staff modules, blocked from customer portal.
- **Bookings:** appointments, hotel/boarding (`BoardingController`, `allowed_species` room rules), grooming, vet consultations/confinements — all gated by `PetServiceCompatibilityService` species→service rules.
- **Inventory:** `InventoryService` (single write path: `adjustStock`, `recordStockIn`, `recordStockOut`, `createReturn`, `setReturnDisposition`, batch reconciliation `inventory:reconcile-stock`), `StockMovementController` (stock-in/out/returns + approval queue), `InventoryLog` audit trail, low-stock alerts via `WorkflowNotifier`.
- **POS/payments:** `Cashier\POSController` (server-side price recompute, VAT-inclusive `subtotal*0.12/1.12`, idempotent transactions), `PaymentVerificationService` (cashier-only verify; scanner confidence flagging, AI never auto-approves).
- **Reports:** `Admin\ReportsController` merges payments/customer_orders/service_requests/boardings/medical_confinements with date-range filters; `AdminLiveReport.jsx` custom range UI (SYS-002 resolved).
- **Comms:** chatbot (FAQ→Groq/Gemini→rules fallback, `chatbot:eval`), live chat inbox, notification matrix (`docs/NOTIFICATION_MATRIX.md`).
- **Docs/PDF:** `PayslipPdfService` (Dompdf, embedded logo data-URI); receipts are HTML print views.

## 3. Architectural observations

- **Single inventory write path** — all stock mutations funnel through `InventoryService` inside DB transactions with `lockForUpdate`; actor/movement/before-after metadata on every `InventoryLog`. Confirmed again this revision; no bypass found.
- **Server-authoritative money** — POS ignores client prices/totals; VAT computed server-side; payment status transitions transactional.
- **Email durability** — every customer-facing email is an outbox intent created inside the business transaction; send-time re-checks (verification, preferences, suppression) prevent stale sends.
- **Species compatibility** — enforced backend-side at request creation (422 `service_not_allowed`) and room assignment; not UI-only.
- **Revision additions (this cycle):** UOM packaging columns + conversion in the stock-in/out path; EAN-13 auto-barcode; report read-path indexes (evidence-gated).

## 4. Risks / accepted limitations

- Main JS bundle 3.71 MB / 1,087 kB gzip — code-split opportunity, not a defect (C-04).
- PAT tokens have no TTL/rotation policy — deployment-hardening item (C-02).
- Unrouted legacy payroll endpoints are dead code (C-01).
- Free-text payroll rows trust maker-entered totals behind maker-checker (C-05).
