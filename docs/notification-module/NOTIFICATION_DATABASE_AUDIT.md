# Notification Database Audit

**Date:** 2026-11-18 · Database: `pawesome` (MySQL, XAMPP) · Tests: `pawesome_test`

## 1. Schema — `notifications` (migration `2026_04_15_112349`)

Verified via migration source + live table (2,265 rows present; migration `Ran`).

| Check | Finding | Verdict |
|---|---|---|
| Primary key | `id` bigint auto | ✅ |
| User relationship | `user_id` FK → `users.id`, `nullOnDelete`, **nullable** | ✅ intentional — see §3 |
| Identifier types | `user_id`, `related_id` bigint | ✅ consistent with `users.id` |
| JSON payload | `data` json nullable | ✅ cast to array on model |
| Read status | `read` bool + `read_at` timestamp | ✅ both kept in sync by `markAsRead`/`markAsUnread` |
| Timestamps | `created_at`/`updated_at` | ✅ reliable; `latest()` ordering used |
| Indexes | `(user_id,read)`, `(role,read)`, `(related_type,related_id)` | ✅ matches the two query patterns (user feed + unread count, related lookup) |
| Soft deletes | none — hard delete via `clearAll`/`destroy` | ✅ per retention policy (ephemeral ops records) |
| Orphans | dev DB: `user_id IS NULL` count = **0** | ✅ no broadcast/orphan rows exist today |

## 2. Query patterns vs indexes

- Feed + count: `WHERE (user_id=? OR (user_id IS NULL AND role=?)) AND read=? ORDER BY created_at DESC LIMIT n` — served by `(user_id,read)` + `(role,read)`; OR-union is fine at this cardinality.
- Mutations: `WHERE user_id=? AND id=?` — PK + FK index.
- `unread-count` is a real `COUNT(*)` — not a row scan. ✅
- Pagination: `LIMIT` (clamped 1–50). No deep history pull anywhere. ✅
- No N+1: list query is one statement; formatting is in-memory. ✅

## 3. FK semantics — `nullOnDelete` + soft-deleted users

`User` uses `SoftDeletes` → admin "delete" is a soft delete; the FK never
fires, so notifications stay pointed at the soft-deleted user (invisible,
harmless). On a hypothetical `forceDelete`, `user_id` → NULL: rows **with a
`role` tag** would become shared broadcasts (read-visible to the role;
immutable per the hardened mutation scoping), rows **without** a tag become
invisible orphans. Mitigation in place: broadcast rows can no longer be
mutated by any single recipient (2026-11-18 change). Recommendation for a
future hardening pass: delete notifications alongside the user or add a
scheduled cleanup — non-blocking.

## 4. Duplicate prevention (schema-level view)

No unique constraints — by design, repeated legitimate events must not be
blocked. Dedup is enforced at the producer layer:

| Mechanism | Where |
|---|---|
| State gates (`payment_status='pending'`) | `PaymentVerificationService` |
| Unread-alert dedup (item+severity per user) | `InventoryService::checkAndCreateStockNotifications` |
| `reminder_sent_at` ≤1/day | `SendReminders` + model column |
| `wasRecentlyCreated` anti-double-fire | `ReceptionistRequestController` |
| Single producer per event | `Appointment` model hooks own create/status |

Verified: `NotificationMatrixTest` asserts exactly-once for verify/reject,
boarding-create, appointment-create, and stock dedup + re-arm.

## 5. Integrity tests run

- Cross-user `read`/`delete` → 404 (cannot mutate foreign rows). ✅
- Broadcast row: visible to role, immutable (read/delete/mark-all/clear-all
  leave it intact). ✅
- `markAllAsRead`/`clearAll` touch only `user_id = caller`. ✅
- `store` requires `exists:users,id` — cannot attach to invalid user. ✅
- Count matches persisted rows (`unread_count` after mark-all → 0). ✅

## 6. Findings

| # | Item | Severity | Disposition |
|---|---|---|---|
| 1 | `nullOnDelete` can mint broadcast rows on hard user-delete | Low | Mitigated (immutable broadcasts); optional future cleanup |
| 2 | No retention/prune — table grows unbounded | Low | Recommendation: prune read rows >90 days via scheduled command when volume justifies |
| 3 | No index on `created_at` for ordering | Low | At 2,265 rows a filesort over an indexed `user_id` subset is trivial; revisit at scale |
| 4 | `role` broadcast + shared `read` semantics | — | Convention forbids new broadcast rows; mutations now owner-only ✅ |
