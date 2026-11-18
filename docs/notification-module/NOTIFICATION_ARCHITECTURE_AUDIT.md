# Notification Module — Architecture Audit

**Date:** 2026-11-18 · **Scope:** In-app notification subsystem (email delivery is a separate outbox system — see §8)

## 1. Executive summary

Pawesome uses a **custom `notifications` table** — not Laravel's database
notification channel. All in-app notifications are synchronous `INSERT`s
created inside (or immediately after) the surrounding business transaction.
Retrieval is HTTP polling from a shared React dropdown mounted on every
role dashboard. There is no WebSocket/broadcast layer.

The architecture is sound and was already partially hardened by a prior audit
(`docs/NOTIFICATION_MATRIX.md`). This pass removed a dead insecure duplicate
controller, removed an injectable legacy endpoint, tightened mutation scoping,
and hardened the frontend poll/error handling.

## 2. Database schema (`notifications`)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | bigint FK→users, **nullable**, `nullOnDelete` | recipient; NULL = legacy broadcast row |
| `role` | varchar, nullable | informational role tag (per-user rows carry it too via `notifyRole`) |
| `title` | varchar | required |
| `message` | text | required |
| `type` | enum(success,warning,error,info) | default `info` |
| `read` | tinyint(1) | default 0 |
| `related_type` / `related_id` | varchar / bigint | polymorphic hint (string labels, not morph map) |
| `data` | json | optional payload |
| `read_at` | timestamp, nullable | set by `markAsRead()` |
| `created_at`/`updated_at` | timestamps | |

Indexes: `(user_id, read)`, `(role, read)`, `(related_type, related_id)`.

**Convention (enforced in docs, verified in code):** all producers create
**per-user rows** (`user_id` set). Broadcast rows (`user_id` NULL) are a legacy
shape — read-visible via `forUserOrRole` but immutable (see security audit).
Dev DB check: 2,265 rows, **0 broadcast rows**.

## 3. Backend map

| Layer | File | Role |
|---|---|---|
| Model | `app/Models/Notification.php` | `markAsRead`, `markAsUnread`, scopes `unread`/`forUser`/`forRole`/`forUserOrRole`/`recent` |
| Controller (routed) | `app/Http/Controllers/NotificationController.php` | index, getUnread, unreadCount, store (admin), markAsRead, markAllAsRead, clearAll, destroy |
| Producer service | `app/Services/WorkflowNotifier.php` | `notifyUser`, `notifyEmail` (email→user resolution, in-app only despite name), `notifyRole` (per-user rows for all **active** users of role; expands `receptionist`/`cashier`/`inventory` → +`super_receptionist`) |
| Domain service | `app/Services/NotificationService.php` | boarding/appointment create+status, reminders, low stock; also routes customer email through `EmailDeliveryService` |
| Scheduler | `app/Console/Commands/SendReminders.php` (`notifications:send-reminders`, hourly) | 24h appointment/boarding reminders, `reminder_sent_at` throttle |
| Email bridge | `app/Services/EmailDeliveryService.php` | durable outbox intents — separate channel |

**Removed this pass:** `app/Http/Controllers/Api/NotificationController.php`
(dead duplicate with unscoped route-model binding — latent IDOR) and
`POST /api/notifications/booking-status` (caller-less injectable utility).

## 4. Frontend map

| Component | File | Role |
|---|---|---|
| `NotificationDropdown` | `src/components/shared/NotificationDropdown.jsx` | Bell + badge + portal panel; mounted inside `DashboardLayout` → **every role dashboard incl. customer**. Polls `GET /api/notifications` every 10s (paused when tab hidden, in-flight + stale-response guards). Role-aware click navigation. |
| `CustomerNotifications` | `src/components/customers/CustomerNotifications.jsx` | Customer-only page (`/customer/notifications`): filter, mark-read, mark-all; requests `?limit=50` |
| API service | `src/api/notifications.js` | `getAll`, `getUnread`, `getUnreadCount`, `createNotification`, `markAsRead`, `markAllAsRead`, `clearAll`, `deleteNotification` |

No staff notification-center page (decision: dropdown is the established staff
pattern; customer page is the full view).

## 5. Flows

**Create:** business controller/service → `WorkflowNotifier::notify*`
/`NotificationService::notify*` → `Notification::create` inside the business
transaction (per `docs/NOTIFICATION_MATRIX.md` — rollback ⇒ no notification).

**Retrieve:** dropdown polls `GET /api/notifications` →
`forUserOrRole(user.id, effectiveRole)` → latest ≤50 + `unread_count`.

**Read state:** click item → `POST /{id}/read` (owner-scoped) → navigate;
"Mark all read" → `POST /mark-all-read` (updates only `user_id = caller` rows).

**Role resolution:** `effectiveRole()` maps `super_admin→admin`,
`super_receptionist→receptionist` for broadcast-visibility matching; producers
already write per-user rows to composite roles.

## 6. API surface (post-change)

`GET /api/notifications` · `GET /unread` · `GET /unread-count` ·
`POST /{id}/read` · `POST /mark-all-read` · `POST /clear-all` ·
`DELETE /{id}` — all `auth.api` + `throttle:api`, owner-scoped mutations.
`POST /api/notifications` — admin only. Detail: `NOTIFICATION_API_CONTRACT.md`.

## 7. Delivery mechanism

Polling (10 s, visibility-aware, overlap-guarded). No Reverb/Pusher/Echo
configuration exists in the repo — polling is adequate for the operational
cadence (booking/payment/stock events, 24h reminders).

## 8. Channel boundaries

In-app persistence is **independent** of email: `NotificationService` writes
the in-app row, then records an `email_deliveries` intent for the customer
lifecycle email — failures there are logged, never rolled back into the
in-app record. Verified in `NotificationService::sendEmailNotification`
(try/catch → `Log::error`, no rethrow).

## 9. Architectural problems found → resolved

| # | Finding | Disposition |
|---|---|---|
| 1 | Dead `Api\NotificationController` with unscoped model binding (IDOR if ever routed) | **Deleted** |
| 2 | `booking-status` endpoint allowed staff to inject arbitrary messages to any email-resolved user | **Removed** (no callers) |
| 3 | Mutation endpoints could flip shared broadcast rows for all recipients | **Fixed** — mutations scoped to `user_id = caller` |
| 4 | Stale `route_list.txt` advertised dead routes | **Regenerated** |
| 5 | 10 s polling w/o visibility/in-flight/staleness guards | **Fixed** |
| 6 | Silent fetch failure rendered as "No notifications" | **Fixed** — explicit error state + Retry |
| 7 | Customer page silently truncated at 20 rows | **Fixed** — `limit=50` |
| 8 | `vet_tech` does not inherit `veterinary` notifications | **Documented — requires product clarification** (separate role, plausibly intended) |
| 9 | No retention/prune policy | **Documented recommendation** — acceptable for capstone volume |
