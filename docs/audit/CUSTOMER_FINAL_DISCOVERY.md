# Customer Role — Final Re-Discovery (Phase 1)

**Date:** 2026-11-18 · **Mode:** finalization — verify the Nov-18 baseline still holds; no code changes permitted in this phase.
**Working tree check:** 30 changed/untracked files. Unrelated work identified: a parallel **Reports Module audit** modified `Admin/CustomerReportController.php`, `Admin/ReportsController.php`, `Cashier/DashboardController.php`, `AdminLiveReport.jsx`, `AdminReports.css`, `CashierReports.jsx` and added `REPORTS_MODULE_AUDIT.md`. All changes confined to staff reporting surfaces — **no customer-route or customer-persistence contract changed** (verified by diff review + live re-verification below).

## Frontend → backend endpoint resolution check

Every `apiRequest()` path used by customer components + `useCustomerBookings` was extracted and resolved against `routes/api.php`:

| Called path | Resolves? |
| --- | --- |
| `/customer/services`, `/bookings`, `/appointments`, `/pets*` (+`/archived`), `/purchases`, `/transactions`, `/requests*`, `/boardings`, `/boarding-requests/*`, `/medical-confinements*`, `/payments/history`, `/billing*`, `/vaccinations/*`, `/store/orders*` (legacy read) | ✓ all present |
| `/customer/availability/{grooming,veterinary}` | ✓ nested under `customer` → `availability` prefix (lines 394–401) |
| `/notifications`, `/notifications/mark-all-read` | ✓ lines 1027–1032 (prefix-nested; literal grep false-negative) |
| `/boarding/rooms/available` | ✓ present |
| `/admin/reports/customers` (CustomerReports.jsx) | dead branch — pathname-gated, unreachable from `/customer/*` (previously documented; P3 cleanup ticket) |
| `/pets` (CustomerPets.jsx:351) | fallback inside `try{ /customer/pets }catch{ /pets }` — defensive dead path; fires only if primary throws; then error toast. Harmless. |

No broken endpoints, no incorrect response parsing found — the board/bookings hook tolerates missing keys (`safeArray`, `res?.counts || {}`), loading/error states are explicit, and duplicate submissions are guarded (create button disables while pending — verified by e2e spec).

## Backend surface re-verified

- `role:customer` + `auth.api` + `throttle:api` on the entire `customer/*` group; `verified` on booking/proof mutations.
- `role:receptionist,admin` on staff live-chat; shared `messages` poll enforces ownership in-controller.
- Brevo webhook `POST /api/webhooks/brevo` (shared-secret `hash_equals`, `throttle:60,1`) present and correctly unauthenticated-by-app-auth.
- Ownership conventions unchanged (`service_requests.customer_id`=users.id; boarding/appointment/payment tables use customers.id — `SecureFileController` reconciles).

## Result

**PASS** — implementation identical to baseline apart from the parallel reports-module changes (customer-inert). No new defects discovered. Dead/dead-fallback paths documented: `/admin/reports/customers` branch (P3), `/pets` fallback (P3).
