# Screenshot Register

**Status:** Genuine screenshots captured 2026-10-22 from the running local build (frontend :3000, API :8000, seeded dev DB `pawesome`), via Playwright/Chromium. Privacy review: all captures contain test fixtures only (E2E pet names, `example.com`/`example.test` accounts, generic "Customer"/"Administrator" users); no credentials, tokens, real personal, or real payment data appear.

| Figure | Filename | Role | Page/workflow | Captured | Privacy |
|---|---|---|---|---|---|
| UM-001 | `UM-001-login.png` | Public | Login | 2026-10-22 | OK — no data |
| UM-002 | `UM-002-customer-services.png` | Customer | Services workspace | 2026-10-22 | OK — test data |
| UM-003 | `UM-003-customer-pets.png` | Customer | My Pets | 2026-10-22 | OK — test pets |
| UM-004 | `UM-004-booking-review.png` | Customer | Review modal pre-submit | 2026-10-22 | OK — test fixture |
| UM-004a | `UM-004a-grooming-form-filled.png` | Customer | Filled grooming form | 2026-10-22 | OK — test fixture |
| UM-004b | `UM-004b-grooming-submitted.png` | Customer | My Appointments post-confirm | 2026-10-22 | OK — test fixture |
| UM-005 | `UM-005-receptionist-grooming-queue.png` | Receptionist | Grooming queue | 2026-10-22 | OK — test data |
| UM-006 | `UM-006-cashier-payment-approvals.png` | Cashier | Payment Approvals w/ pending GCash row (E2E ref) | 2026-10-22 | OK — test refs only |
| UM-007 | `UM-007-inventory-stock.png` | Inventory | Stock Management | 2026-10-22 | OK — seeded items |
| UM-008 | `UM-008-veterinary-appointments.png` | Veterinary | Appointments | 2026-10-22 | OK — test data |
| UM-009 | `UM-009-manager-reports.png` | Manager | Reports | 2026-10-22 | OK — aggregate UI |
| UM-010 | `UM-010-admin-manage-users.png` | Admin | Manage Users | 2026-10-22 | OK — directory stats/headers; no PII rows in frame |
| UM-011 | `UM-011-customer-medical.png` | Customer | Medical (confinements) | 2026-10-22 | OK — test data |
| UM-012 | `UM-012-super-receptionist.png` | Super Recep | Workspace landing (recaptured — earlier version showed the admin workspace due to a credential-fallback spec defect, D-10) | 2026-10-22 | OK — test data |
| UM-013 | `UM-013-attendance-kiosk.png` | Public | Attendance kiosk gate | 2026-10-22 | OK — no data |
| UM-014 | `UM-014-cashier-dashboard.png` | Cashier | Dashboard overview (post-fix) | 2026-10-22 | OK — test data |
| UM-015 | `UM-015-customer-request-paid.png` | Customer | Requests list | 2026-10-22 | OK — test data |
| UM-016 | `UM-016-vet-appointment-approved.png` | Veterinary | Appointments w/ approved appt | 2026-10-22 | OK — test data |

## Capture procedure used

1. Live stack: `php artisan serve --port=8000` + `npm run dev` (:3000), MySQL `pawesome` dev DB with seeded test accounts.
2. Driven by `e2e/manual-verification-pass.spec.js` + `e2e/manual-e2e-chain.spec.js` (Playwright, Chromium, Desktop Chrome viewport).
3. Test fixtures only (E2E pets/requests, `E2E-MANUAL-*` payment refs). No passwords/tokens/real personal/payment data captured.
4. Each image reviewed in-frame for sensitive content before retention; all rows above passed.

## Not yet captured (future figures if needed)

- POS cart mid-sale, walk-in form, hotel reservation w/ vaccination upload, consultation editor, rejection modal, payroll pages, kiosk post-PIN screen, admin create-user modal.
