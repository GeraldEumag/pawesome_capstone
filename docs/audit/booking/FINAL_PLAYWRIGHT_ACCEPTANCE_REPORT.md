# Final Playwright Acceptance Report

## Exact Selected Command

```bash
npx playwright test e2e/booking-channel-gating.spec.js e2e/customer-bookings-board.spec.js e2e/phase12-boarding-workflow.spec.js e2e/phase12-veterinary-workflow.spec.js e2e/receptionist-booking-order.spec.js e2e/receptionist-room-assignment.spec.js --project=chromium --workers=1 --retries=0 --reporter=list
```

## Isolated Stack

- Frontend: `http://127.0.0.1:3003`, Vite configured with `VITE_API_BASE_URL=http://127.0.0.1:8031/api`.
- API: `http://127.0.0.1:8031/api`, round-robin across four Laravel workers on ports 8016–8019.
- Each worker was launched with explicit `DB_DATABASE=pawesome_booking_audit`; the DB is an isolated audit clone, not `pawesome`.
- Chromium; one Playwright worker; zero retries.

## Diagnostic Run and Disposition

A first exact six-file run used a single `php artisan serve` process (`:8015`) and a dedicated Vite server (`:3002`). It reported 15 passed, 1 failed, 3 not run. The online hotel lifecycle and veterinary lifecycle passed. The failure was `customer-bookings-board.spec.js` test “changing the date preset then status keeps both filters”, which timed out after 30 seconds waiting for the board's loaded state; three serial sibling tests did not run. `AGENTS.md` documents that the Windows PHP built-in server is single-threaded and that concurrent browser requests can stall, so this run is diagnostic and not the final acceptance run.

A focused rerun and the exact selected batch on the supported four-worker stack are required before this report can record final PASS/FAIL.

## Hotel Regression

- Focused `Phase 12.2 native boarding lifecycle` on the isolated audit stack passed (1 test, approximately 2.4 minutes) after the date-only serialization fix.
- It exercised customer booking, vaccination/document handling, approval, room assignment, cashier verification and receptionist check-in.
- API evidence for boarding #88 / reservation #48 is in `browser-evidence/system-security-audit-20261108/phase12/hotel-queue-api-after-fix.json`.
