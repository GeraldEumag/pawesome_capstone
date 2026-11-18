# Notification API Contract

**Date:** 2026-11-18 · Base: `/api/notifications` · Auth: Sanctum bearer token via `auth.api` middleware · Rate limit: `throttle:api` (`app.api_rate_limit_per_minute`, per user-or-IP)

All endpoints verified against `php artisan route:list` (post-change) and `NotificationApiTest`.

## Endpoint inventory

| # | Method & path | Controller | Middleware | Authz | Result |
|---|---|---|---|---|---|
| 1 | `GET /api/notifications` | `index` | auth.api, throttle | own rows + legacy broadcast for caller's effective role | ✅ |
| 2 | `GET /api/notifications?unread=1&limit=N` | `index` | same | same; `limit` clamped 1–50 (default 20) | ✅ |
| 3 | `GET /api/notifications/unread` | `getUnread` | same | same scope, latest 20 unread | ✅ |
| 4 | `GET /api/notifications/unread-count` | `unreadCount` | same | same scope → `unread_count` | ✅ |
| 5 | `POST /api/notifications/{id}/read` | `markAsRead` | same | **owner-only** (`user_id = caller`); else 404 | ✅ |
| 6 | `POST /api/notifications/mark-all-read` | `markAllAsRead` | same | updates only caller's rows | ✅ |
| 7 | `POST /api/notifications/clear-all` | `clearAll` | same | deletes only caller's rows | ✅ |
| 8 | `DELETE /api/notifications/{id}` | `destroy` | same | owner-only; else 404 | ✅ |
| 9 | `POST /api/notifications` | `store` | + `role:admin` | admin only; `hasRoleAccess('admin')` rechecked | ✅ |
| ~~10~~ | ~~`POST /api/notifications/booking-status`~~ | ~~`bookingStatus`~~ | — | **removed 2026-11-18** — caller-less injectable utility | ✅ 404 |

## Request/response contracts

**`GET /`** → `{ success, notifications:[…], count, unread_count }`
Item shape: `{ id, title, message, type, read, related_type, related_id, data, read_at, created_at, time }` (`time` = `diffForHumans`).

**`GET /unread`** → `{ success, notifications:[…], count, unread_count }`

**`GET /unread-count`** → `{ success, unread_count }`

**`POST /{id}/read`** → `{ success, message, unread_count }` · 404 if not owned.

**`POST /mark-all-read`** → `{ success, message, unread_count: 0 }`

**`POST /clear-all`** → `{ success, message, unread_count: 0 }`

**`DELETE /{id}`** → `{ success, message, unread_count }` · 404 if not owned.

**`POST /` (admin)** body `{ user_id*, title*, message*, type?, related_type?, related_id?, data? }` → 201 `{ success, message, notification }` · 403 non-admin · 422 validation.

## Error matrix (verified)

| Case | Expected | Result |
|---|---|---|
| No token | 401 | ✅ all endpoints |
| Other user's `{id}/read` or `DELETE` | 404 | ✅ e2e + feature test |
| `mark-all-read` on shared broadcast row | row stays unread | ✅ immutability test |
| `store` as customer/receptionist | 403 | ✅ |
| `store` missing fields | 422 | ✅ |
| `limit=999` / `limit=-5` | clamped, 200 | ✅ |
| `?unread=1` filter | unread only | ✅ |
| N+1 / query shape | 2 indexed queries (list + count) | ✅ `(user_id,read)`/`(role,read)` indexes |

## Frontend consumers

| Consumer | Calls |
|---|---|
| `NotificationDropdown` | `GET /` (10 s poll, visibility-gated), `POST /{id}/read`, `POST /mark-all-read` |
| `CustomerNotifications` page | `GET /?limit=50`, `POST /{id}/read`, `POST /mark-all-read` |
| `notificationApi` (unused surface) | `getUnread`, `getUnreadCount`, `createNotification`, `clearAll`, `deleteNotification` — valid endpoints, no current caller |
