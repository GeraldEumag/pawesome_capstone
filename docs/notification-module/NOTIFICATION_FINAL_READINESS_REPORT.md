# Notification Module — Final Readiness Report

**Date:** 2026-11-18 · **Verdict: PASS WITH LIMITATIONS**

Core functionality is verified end-to-end against the real stack: events
produce the right per-user rows, feeds are owner-scoped and authenticated,
read/unread persists, duplicates are controlled, the UI is on-brand with
proper states, and the previously found security defects are fixed.
Limitations are environmental (single-threaded dev server latency, no real
mail provider) and one product decision pending (vet_tech scope) — none are
functional defects.

## A. Executive summary

- **Status:** production-fit for the capstone deployment target.
- **Findings:** 9 audit items — 3 removed/hardened security issues, 4 frontend
  correctness issues, 2 documented info items.
- **Fixes completed:** 8 code changes (see §C/§B), all covered by new tests.
- **Remaining limitations:** see §H.

## B. Frontend findings

Audited: `NotificationDropdown` (all-role bell/panel), `CustomerNotifications`
page, `api/notifications.js`, `DashboardLayout` mount.

| Issue | Status |
|---|---|
| Poll ran on hidden tabs; overlapping requests possible | ✅ fixed — visibility check + in-flight guard |
| Slow poll response could overwrite post-mutation state (badge flicker) | ✅ fixed — request-sequence guard |
| Fetch failure rendered as "No notifications yet" | ✅ fixed — error state + Retry |
| Refetches blanked the list with a spinner | ✅ fixed — spinner only on first load |
| Customer page silently capped at 20 | ✅ fixed — `?limit=50` |
| `?role=` param sent but ignored by API; dead `getNotifications` dupe | ✅ cleaned |
| Browser e2e: badge, dropdown, click-read, mark-all, reload persistence | ✅ verified 5/5 |

## C. Backend findings

Audited: `NotificationController`, `WorkflowNotifier`, `NotificationService`,
`InventoryService` stock alerts, `SendReminders`, routes, `Notification` model,
all producers listed in the event matrix.

| Issue | Status |
|---|---|
| Dead `Api\NotificationController` with unscoped route-model binding (IDOR: any user could read/mutate/delete anyone's rows; open `store`) | ✅ file deleted — was unrouted |
| `POST /notifications/booking-status` — caller-less endpoint letting staff inject arbitrary messages to any customer email | ✅ route + method removed (verified 404) |
| Mutation endpoints (`read`, `mark-all`, `clear-all`, `delete`) scoped via `forUserOrRole` → one recipient could flip shared broadcast rows for all | ✅ scoped to `user_id = caller`; broadcast rows read-visible but immutable |
| Inconsistent envelopes (`count` vs `unread_count`, missing `success`) | ✅ normalized; existing keys kept for compat |
| Stale `route_list.txt` advertising dead routes | ✅ regenerated |
| Transactional integrity | ✅ confirmed — producers create in-app rows inside the business transaction; matrix tests assert no false-success notifications |

## D. API findings

- 9 endpoints verified on `route:list` post-change; `booking-status` gone.
- Auth (`auth.api`) + `throttle:api` on all; admin gate double-checked on `store`.
- Responses consistent; error matrix verified (401/403/404/422, clamps).
- Indexed queries; no N+1; real COUNT for badge.

## E. Database findings

- Schema supports all requirements (per-user rows, read+read_at, JSON data, polymorphic hint).
- Dev DB: 2,265 rows, 0 broadcast rows, no orphans.
- `nullOnDelete` + soft-deleted users: no current risk; force-delete could mint broadcast rows — mitigated by immutable-broadcast scoping; optional future cleanup documented.
- Dedup: producer-layer (state gates, unread-alert dedup, reminder throttle, single-producer hooks) — intentionally no unique constraint.

## F. Event coverage

17 business events mapped — all implemented and verified (see
`NOTIFICATION_EVENT_MATRIX.md`). Requires clarification: `vet_tech` does not
inherit `veterinary` notifications (separate-role semantics — likely intended).
Not applicable: none found.

## G. Testing results (actual)

| Suite | Result |
|---|---|
| `php artisan test --filter=Notification` (MySQL `pawesome_test`) | **24/24 ✅** (8 new + 16 existing/related) |
| `npx playwright test e2e/notification-module.spec.js` (live :8000+:3000) | **5/5 ✅** |
| `npm run test:unit` (vitest) | **44/44 ✅** |
| `npm run build` | **✅** |
| `route:list` post-change | ✅ 9 routes, `booking-status` absent |
| Dev DB broadcast scan | 0 rows |

## H. Deployment readiness

- **Env/config:** no new env requirements; `throttle:api` covers polling.
- **Queue/scheduler:** in-app notifications are synchronous — no worker needed.
  `notifications:send-reminders` requires the scheduler (same as today).
  Email channel needs the `emails` queue worker + dispatch/reconcile schedule
  (separate system, already documented).
- **Delivery:** polling adequate; no websockets introduced (per scope decision).
- **Perf:** capped lists (≤50), COUNT queries, indexed filters, visibility-paused
  polling — no hot paths.
- **Known limitations:** dev-server is serial so first-paint of the badge can
  lag a few seconds under load (dev-only); no staff notification-center page
  (accepted design); no retention prune (recommendation logged);
  `vet_tech` scoping pending product decision; real mailbox delivery not
  verifiable without a provider (unchanged from prior audit).

## Verdict

**PASS WITH LIMITATIONS** — all critical and high-severity items resolved and
covered by executable tests; remaining items are documented non-blockers.
