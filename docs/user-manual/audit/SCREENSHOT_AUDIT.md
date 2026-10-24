# Screenshot Audit — v0.4 (final)

**Updated:** 2026-10-25 (second pass). All figures are genuine captures from the running application — none are mockups or edited images.

## Pre-existing captures (2026-10-22, all retained)

18 files, verified present and still UI-accurate — see prior register. Sidebar text color changed to black in `3e75be0` (cosmetic only).

## New captures (2026-10-25, this pass)

Captured live via Playwright/Chromium against `php artisan serve` :8000 + Vite :3000, seeded `pawesome` dev DB, role accounts from AGENTS.md. Script: `frontend/.manual-v04-capture.cjs`. Privacy: only seeded/test fixtures visible (E2E pet/request names, test amounts) — no real personal or payment data.

| Figure | File | Screen | Role | Verified in frame |
|---|---|---|---|---|
| UM-017 | UM-017-hotel-reservation-form.png | Pet Hotel boarding form | customer | Pet/Stay Date/Stay Duration (same-day, 6:00 PM checkout)/Notes/Vaccination Card upload/Submit Boarding Request |
| UM-018 | UM-018-receptionist-walkins.png | Walk-ins + recent list | receptionist | Recent walk-ins with service, price, status badges, "Open list" links |
| UM-019 | UM-019-cashier-reject-dialog.png | Reject Payment dialog | cashier | "Select a reason…" list + Cancel/Reject buttons |
| UM-020 | UM-020-cashier-pos-cart.png | POS cart mid-sale | cashier | Item tabs, cart panel, Walk-in Customer, Proceed to Payment |
| UM-021 | UM-021-vet-consultation.png | Consultation screen | veterinary | Opened via `/veterinary/appointments/1/consult` on an in-consultation appointment |
| UM-022 | UM-022-admin-create-user.png | Create User form | admin | User Information fields visible |
| UM-023 | UM-023-manager-invoice-approvals.png | Invoice Approvals | manager | "Invoice Adjustments"/"Inventory Variances" tabs; empty queue state |
| UM-024 | UM-024-inventory-controlled-drugs.png | Controlled Drug Register | inventory | Register header + "weekly counts need a counter and a separate witness" + empty state |

## Totals

- Referenced in manual: **26** · files present: **26** · embedded in PDF/DOCX: **26** (build log: "Embedded 26 screenshot references")
- Placeholders remaining: **0** (`Insert screenshot`/`TODO`/`TBD` scan of final MD = 0 hits)
- Manual §17 figure list updated to match.

## Notes

- UM-023 and UM-024 show empty-state queues — accurate, not staged (no pending adjustments/controlled items in dev DB).
- UM-021 first capture landed on the appointments list; recaptured via direct consult URL — final file shows the consultation screen.
