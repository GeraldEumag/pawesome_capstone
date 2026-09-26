# Data Retention & Soft-Delete Policy

Pawesome applies soft deletes selectively as a **data-retention policy**, not as
a blanket `SoftDeletes` rollout. The governing distinction:

- **Operational / master-data** records may be soft-deleted: they disappear from
  normal queries and API responses while remaining recoverable and
  referenceable for history.
- **Financial and audit** records are never deleted — no delete endpoints and no
  `deleted_at` column. Workflow state (`status`) and payment state
  (`payment_status`) already capture lifecycle; soft deletes must not be used to
  hide financial history.

## Soft-deleted models

`deleted_at` added by `2026_09_26_000001_add_deleted_at_to_operational_tables`
(`pets` already had the column):

| Model | Table | Reason |
|---|---|---|
| `User` | `users` | Preserve identity/history; deleted users' tokens die automatically |
| `Customer` | `customers` | Preserve customer history |
| `Pet` | `pets` | `deleted_at` existed but was unused; trait now protects any direct `->delete()` |
| `Service` | `services` | Master data referenced by appointments/billing |
| `Supplier` | `suppliers` | Master data referenced by inventory history |
| `HotelRoom` / `BoardingRoom` | `hotel_rooms`, `boarding_rooms` | Referenced by confinement/boarding history |
| `Grooming` | `groomings` | Operational history |
| `MedicalRecord` | `medical_records` | Clinical history (locked records still cannot be deleted) |
| `Attendance` | `attendance` | HR history |
| `Payroll` | `payrolls` | HR history (paid payrolls cannot be deleted at all) |

## Immutable records (no delete, by design)

- `payments`, `sales`, `sale_items`, `invoices`, `service_billing_items` —
  financial records; no delete endpoints, no `deleted_at`.
- `activity_logs`, `inventory_logs` — audit trail; read-only.
- `boardings`, `customer_orders`, `service_requests`, `medical_confinements` —
  no delete endpoints; lifecycle handled by `status`/`payment_status`.

## Existing non-deletion patterns (kept)

- `inventory_items` — archive lifecycle (`archived_at`, `status='archived'`);
  `InventoryService::deleteItem` hard-deletes only items with zero references,
  so nothing historical is lost.
- `employees` — deactivate (`is_active=false`), never deleted.
- `pets` (PetController) — archive lifecycle (`status='archived'`) runs
  alongside the soft-delete trait for UX-facing removal.
- Ephemeral rows (`notifications`, `password_reset_tokens`,
  `email_verification_tokens`, `work_schedules`, `fingerprint_credentials`,
  `chatbot_faqs`, `report_alerts`, live-chat sessions) — ordinary hard deletes;
  low business value, explicit retention policy can be added later if needed.

## Controller changes

- `Admin\SalaryController::destroy` — this route deletes a **User**; now mirrors
  `UserController::destroy` guards (no self-delete, blocked when the user has
  pets/appointments/boardings). Delete is now a soft delete via the trait.
- Both user-deletion guards now traverse the real relationship chain
  `users.id → customers.user_id → customers.id → pets/appointments/boardings`
  instead of comparing `users.id` against `customer_id` columns that reference
  `customers.id` (coincidental ID equality). `boardings.customer_id` references
  `customers.id` directly.
- `PayrollController::destroy` (non-API) — added the `paid` guard the
  `Api\PayrollController` variant already had; both now soft-delete.
- `Customer\PortalController::deletePet` — added the active-booking guard
  matching `PetController` semantics; `->delete()` is now a soft delete.
- `Admin\UserController::restore`, `Admin\CustomersController::restore` —
  new admin-only `POST /api/admin/users/{id}/restore` and
  `POST /api/admin/customers/{id}/restore`; idempotent (404 if not trashed),
  restore is audit-logged for users.

## Behavioral notes

- Soft-deleted users cannot authenticate — `ApiTokenAuth` resolves the token's
  user through the global scope, which excludes trashed rows.
- Soft-deleted `users.email` values still occupy the unique index — account
  re-registration with the same email requires an admin restore or a hard purge.
- Raw `DB::table('pets')` queries (e.g. `SecureFileController` photo access)
  intentionally still resolve soft-deleted pets so historical files remain
  reachable under their existing authorization checks.
- `Api\GroomingController` has no `destroy` method — the receptionist
  `DELETE /api/grooming/{id}` route was already dead (500) and remains so.

## Tests

`backend/tests/Feature/SoftDeleteRetentionTest.php` — 10 tests covering:
deleted records hidden from queries/API, revoked auth for deleted users,
admin-only delete/restore, idempotent restore, salary-route guard parity,
pet soft-delete row preservation, financial/audit immutability, and report
counting with trashed rows. `AuthorizationMatrixTest` and
`DatabaseIntegrityTest` were updated to `assertSoftDeleted` where physical
removal was previously asserted.
