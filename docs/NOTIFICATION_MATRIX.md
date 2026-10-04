# Notification Matrix

Pawesome uses a **custom `notifications` table** (not Laravel's database
notification channel). All in-app notifications are synchronous `INSERT`s that
live inside the surrounding business transaction where one exists — so a
rolled-back state transition cannot leave orphaned notifications.

Customer-facing emails do **not** send inline. Every email producer creates a
durable intent row in `email_deliveries` (inside the same DB transaction as the
business state where one exists), then a dispatcher publishes the intent to the
`emails` database queue where `App\Jobs\SendEmailDelivery` sends it via the
configured mailer (`NotificationService::sendEmailNotification` →
`EmailDeliveryService::lifecycle`; receipts via `::paymentReceipt`; auth mails
via `::intent`). Optional lifecycle mail is gated by the
`notif_email_notifications` system setting and per-customer preferences —
both at intent time and re-checked at worker send time, so an opt-out between
intent and pickup suppresses the delivery without sending.

## Schema

`notifications`: `id`, `user_id` (nullable FK), `role` (nullable string tag),
`title`, `message`, `type` enum(`success`,`warning`,`error`,`info`),
`read` bool, `related_type`/`related_id` (polymorphic target), `data` JSON,
`read_at`, timestamps. Indexes on `(user_id, read)`, `(role, read)`,
`(related_type, related_id)`.

> **Convention:** rows are always per-user (`user_id` set; `role` is an
> informational tag). Do not create broadcast rows (`user_id = NULL`) — reads
> aggregate them via `forUserOrRole`, but read-state is shared, so one
> recipient marking/dismissing affects all. Payroll notifications were
> converted to per-user rows for this reason.

## Producer layer

| Producer | Purpose |
|---|---|
| `WorkflowNotifier::notifyUser($userId, ...)` | In-app notification to one user |
| `WorkflowNotifier::notifyEmail($email, ...)` | Resolves email → user → in-app notification (name is historical; no email is sent) |
| `WorkflowNotifier::notifyRole($role, ...)` | Per-user rows for all **active** users of the role, expanding composites (`receptionist`/`cashier`/`inventory`→+`super_receptionist`) |
| `NotificationService` | Domain helpers (boarding/appointment create + status change, reminders, low stock) + queued customer email |

## Consumer layer

- `NotificationDropdown` (all roles) polls `/api/notifications` every 10s;
  unread badge from `unread_count`.
- Endpoints: `GET /api/notifications`, `GET /unread`, `GET /unread-count`,
  `POST /{id}/read`, `POST /mark-all-read`, `POST /clear-all`,
  `DELETE /{id}` — all scoped to the authenticated user's own rows plus legacy
  broadcast rows (`forUserOrRole`).
- `POST /api/admin/notifications` (admin only) — manual notification.
- `POST /api/notifications/booking-status`
  (receptionist/admin/manager) — legacy utility endpoint; the previous frontend
  caller was removed because it sent an incompatible payload (always 422) and
  real status transitions already notify customers through service/model hooks.

## Event matrix

| Event | Trigger site | Recipient | Dedup / guard |
|---|---|---|---|
| Service request submitted | `Api\ServiceRequestController::store` | `receptionist` (+super) via `notifyRole`; customer confirmation via `notifyEmail` | Request uniqueness enforced upstream |
| Request status updated | `Api\ServiceRequestController::updateStatus` / `ReceptionistRequestController` | Customer (`notifyEmail`) | Fires only on status transition |
| Payment proof uploaded (service request / order / boarding / confinement) | `ServiceRequestController::uploadPaymentProof`, `CustomerStoreController::uploadPaymentProof`, `BoardingController::uploadPaymentProof`, `MedicalConfinementController::uploadPaymentProof` | `cashier` (+super) via `notifyRole` | Upload only allowed when `payment_status` not pending/paid → re-upload after rejection re-notifies (intended) |
| Payment verified | `PaymentVerificationService::verify` | Customer | Inside `DB::transaction`; `payment_status='pending'` gate blocks re-verify |
| Payment rejected | `PaymentVerificationService::reject` | Customer | Same transaction + pending gate |
| Low stock / out of stock | `InventoryService::checkAndCreateStockNotifications` (called from stock mutations) | `inventory`, `manager`, `admin`, `super_receptionist` | Skips if user already has an **unread** alert for the same item at same severity; re-arms after read |
| Appointment scheduled | `Appointment::created` model hook → `notifyAppointmentCreated` | Customer + assigned veterinarian | `ReceptionistRequestController::approve` only sends its manual vet notification when the appointment was **not** newly created (hook already covers creation) |
| Appointment status changed | `Appointment::updated` hook → `notifyAppointmentStatusChange` | Customer | Only fires when `status` is dirty |
| Boarding created | `NotificationService::notifyBoardingCreated` | Customer + receptionist/super/manager/admin staff | Single call site (duplicate `notifyRole` removed) |
| Boarding status changed | `BoardingController` status transitions → `notifyBoardingStatusChange` | Customer (+email) | Called per transition endpoint |
| Vet consultation finalized | `ConsultationWorkflowController` | Customer + `cashier` role | After successful finalize |
| Confinement lifecycle (admit/progress/discharge) | `MedicalConfinementController` | Customer + `veterinary`/`receptionist`/`cashier` per event | Per-transition calls |
| Payroll generated/approved/paid | `Api\PayrollController` | `manager` role (per-user rows) + employee for payslip | State guards (`pending`→`approved`→`paid`) |
| 24h reminders | `notifications:send-reminders` scheduler command | Customer | `reminder_sent_at` throttle (≤1/day) |

## Duplicate-prevention strategy

1. **State gates before notify** — payment verify/reject require
   `payment_status='pending'`; retries return 422 without notifying.
2. **Single producer per event** — model hooks own appointment
   create/status notifications; controllers must not duplicate them
   (`ReceptionistRequestController` guards on `wasRecentlyCreated`).
3. **Unread-alert dedup** — low-stock alerts skip users with an existing
   unread alert for the same item+severity.
4. **Reminder throttle** — `reminder_sent_at` column.
5. **Transactional placement** — notifications are created inside (or after)
   the business transaction, so failed transitions produce none.

## Email outbox (`email_deliveries`)

All customer-facing email flows through the durable outbox, not direct
`Mail::queue` calls:

```
business event → email_deliveries intent (in-transaction) → COMMIT
  → email-deliveries:dispatch → jobs row on `emails` queue
  → queue:work → SendEmailDelivery → Laravel Mail/Blade → provider
```

- **Dedup:** `occurrence_key` per event instance makes re-submitted producer
  attempts idempotent.
- **Recipient privacy:** addresses are stored encrypted
  (`recipient_fingerprint` for lookups).
- **Suppression at send time:** an encrypted `suppression` descriptor records
  checks re-evaluated by the worker — consumed auth tokens
  (`token_row`), deactivated users (`user_active`), changed recipient
  (`recipient_unchanged`), preference opt-out (`customer_email_enabled`), and
  stale business state (`model_field`).
- **States:** dispatch state (`pending`/`processing`/`accepted`/`suppressed`/
  failure classes) is tracked separately from provider outcome
  (`provider_status`, `delivered_at`) — queued ≠ sent ≠ provider-accepted ≠
  inbox-delivered.
- **Operator commands:** `email-deliveries:dispatch` (every minute),
  `email-deliveries:reconcile` (every ten minutes, crash recovery),
  `email-deliveries:retry {id}` (manual).
- **Email types:** auth (`verify`, `password-reset`, `password-changed`,
  `account-welcome`), lifecycle (`notification`), receipts
  (`payment-receipt`), HR payslips (separate theme).

## Read/unread

`read` bool + `read_at` timestamp; `markAsRead`/`markAsUnread` on the model.
`mark-all-read`, `clear-all`, and per-id `read`/`delete` are scoped to the
caller's own notifications (`forUserOrRole` also matches legacy broadcast
rows).

## Retention

No automated cleanup. Users can `clear-all` or delete individual rows;
notifications are ephemeral operational records (hard-deletable per the
data-retention policy). Consider a scheduled prune (e.g. >90 days read rows)
if table growth becomes an issue.

## Tests

`tests/Feature/NotificationMatrixTest.php` — 11 tests covering every matrix
event, composite-role expansion, dedup, unauthorized-recipient exclusion,
per-user payroll rows, read/unread, and cross-user mutation protection.
Email-layer coverage lives in `EmailDeliveryOutboxTest`,
`EmailAuthFlowTest`, `EmailServiceWorkflowTest`,
`EmailPreferencesAndTemplatesTest`, `CustomerEmailResolverTest`,
`PaymentReceiptOutboxTest`, and `PaymentSettlementTest`.
