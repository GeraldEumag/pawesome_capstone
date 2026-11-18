# Customer Role — Security Audit (Gate 2)

**Audit date:** 2026-11-18 · **Target:** isolated `pawesome_customer_audit`, API `:8001`
**Method:** dual-customer fixtures (A=users.id 9 / customers.id 1, B=id 10 / id 2, C=unverified id 12), raw API probes with server-side DB verification. Evidence: `browser-evidence/customer-audit/gate2-*.txt`.

## Verdict

**0 P0, 0 P1 defects.** All cross-customer access denied, all mass-assignment attempts neutralized, all staff boundaries enforced. No application code changes were required; the only fix was an e2e-harness normalization (CUST-H01).

## 1. IDOR matrix — cross-customer access

B's token against A's resources (and vice versa):

| Surface | Endpoint probed | Result |
| --- | --- | --- |
| Pets | GET/PUT/DELETE/PATCH archive+unarchive `/customer/pets/1` | 404 (ownership → `findOrFail` scope) |
| Service requests | PATCH `/customer/requests/{id}/cancel`, POST `…/payment-proof`, GET `…/receipt` | 403/404 |
| Boardings | GET `/customer/boardings/2`, PATCH cancel, GET care-logs | 404/403 |
| Grooming | GET `/customer/grooming/{id}` | 404 (owner-safe, legacy controller) |
| Confinements | GET `/customer/medical-confinements/{id}`, proofs | 404/403 |
| Vaccination card | GET `/files/vaccination-cards/2/view` | 403 |
| Payment proofs | GET `/files/payment-proofs/service-request/{5,8}/view` | A→200 image/png, B→403 |
| Payment receipt files | GET `/files/payment-receipts/{id}/view` | 403 for customers — staff-only by design |
| Live chat | GET messages / POST message / DELETE session `{id}` | 403 all |
| Notifications | GET/PATCH foreign notification ids | 404/403 |
| Unauthenticated | every `/api/customer/*` | 401 |

Ownership convention verified: `service_requests.customer_id` = users.id; `boardings`/`appointments`/`payment_receipts.customer_id` = customers.id. `SecureFileController::recordBelongsToCustomer()` reconciles both domains.

## 2. Mass assignment (response + DB double-verified)

| Attempt | Response | Persisted (DB) |
| --- | --- | --- |
| `PUT /auth/profile` `role:"admin"` | 200 | `users.role` unchanged |
| `POST /customer/pets` `customer_id:2` | 201 | `customer_id=1` (owner-derived) |
| `POST /customer/requests` `customer_id:10, status:approved, payment_status:paid, approved_by, verified_by, price:0.01` | 201 | `customer_id=9`, `pending`, `unpaid`, `approved_by/verified_by NULL`, server-priced `450.00` |
| `POST /auth/register` `role:"admin"` | 201 | created as `role=customer` |

All ownership/financial/approval fields are server-derived — the `$fillable`/`$guarded` posture plus per-controller whitelisting is consistent.

## 3. Role boundary

- Customer token vs staff prefixes (`/api/admin`, `/api/manager`, `/api/receptionist`, `/api/cashier`, `/api/inventory`, `/api/veterinary` dashboards + mutations): **403 across the board**.
- Staff token vs customer-only endpoints (e.g. receptionist POST `/chatbot/live-chat/{id}/message`, customer group): **403** — enforcement is bidirectional.
- Unauthenticated staff+customer endpoints: **401**.

## 4. Verified-email middleware

Unverified customer C: `POST /customer/requests`, `POST /customer/boardings` → **403 `{email_unverified: true, "Please verify your email address before making a booking."}`**. Staff unaffected. After `POST /auth/email/verify` consumed the token (B), bookings succeeded and `email_verified_at` persisted.

## 5. File upload security

| Probe | Result |
| --- | --- |
| PHP source renamed `.png` (payment proof) | 422 — MIME sniff reject |
| 6 MB PNG | 422 — size limit |
| MZ executable renamed `.jpg` (vaccination card) | 422 — content/extension mismatch |
| Valid PNG | 200 → `payment_status=pending`, private `payment-proofs/` path |

Files persist on the `private` disk and are only reachable through `SecureFileController` per-owner authorization; served with `X-Content-Type-Options: nosniff`, private no-cache, inline safe MIME. No traversal vectors observed (paths are server-generated `proof_*`/`vaccination_cards/*` names).

## 6. Payment manipulation

- Proof upload → `pending`, never `paid`; `verified_by`/`verified_at` only set by cashier verify (SR5: `verified_by=5`, VAT receipt `SR-REC-…`, net 133.93 + VAT 16.07 on 150 total; boarding 2: `BD-REC-…`, 446.43 + 53.57 on 500).
- Cross-payable upload: **403** both directions.
- Cashier verify on unapproved booking → **422 "not been approved yet"** (ordering rule enforced).
- Cashier cash-settle of an `online` booking without rejected proof → **422 "cannot be settled with counter cash"** — no silent channel downgrade.
- Check-in blocked while `unpaid` ("Booking must be paid before check-in") and off-schedule ("Check-in is only allowed on the scheduled date").
- Idempotent replays: duplicate cancel → clean 422 "Only pending requests can be cancelled"; duplicate approve → idempotent-safe message.
- `payment_receipts` rows retain rejected/failed proofs as evidence (`status=failed`, `sha256` stored).

## 7. Ordering descope (F-02) — verified correct

- `POST /customer/store/checkout` → **410**
- `POST /customer/store/orders/{id}/cancel` → **410**
- `POST /customer/store/orders/{id}/payment-proof` → **410**
- `GET /customer/store/orders` → 200 (read-only legacy history preserved)
- No store/cart/checkout UI anywhere in the customer portal (component + nav scan).

## 8. Observations (not defects — documented)

1. **`GET /customer/grooming/{id}` resolves to `App\Http\Controllers\GroomingController`** (GroomingAppointment entity with its own ownership check), not `Api\GroomingController`. Owner-safe 404; frontend does not call it. Legacy parity route — no change made.
2. **Mutation endpoints validate before ownership-check** (422 on malformed payloads where reads return 404). No data leaked; consistent with Laravel conventions.
3. **Duplicate `POST /customer/pets` creates two rows** — pets are master data, not transactions; acceptable.
4. **Email change deletes the old address's `password_reset_tokens` row** (`AuthController.php:312`) — intentional invalidation hygiene, verified.

## 9. Harness fix applied (CUST-H01)

`frontend/e2e/customer-my-requests-link.spec.js` appended `/api` unconditionally to `E2E_API_URL` (`/api/api/…`), unlike the other 10 customer specs which normalize via `.replace(/\/api\/?$/,"")`. Normalized all 11 customer spec files. This was a test-harness defect, not an app defect — 3 baseline e2e failures resolved to green.
