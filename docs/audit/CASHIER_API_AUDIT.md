# Cashier API & RBAC Audit

Date: 2026-11-18 · Stack: `pawesome_cashier_audit` @ `127.0.0.1:8001`

## 1. Endpoint inventory

54 `api/cashier/*` routes in `backend/routes/api.php`, all behind `auth.api` + throttle + `role:cashier` (admin bypasses staff checks per policy; `super_receptionist` carries cashier). Groups:

- Dashboard/overview: `GET /cashier/dashboard`, `/dashboard/overview`, `/reports/*`, `/sales`, `/transactions`, `/transactions/search`, `/history`
- Payment queue & verification: `GET /cashier/payment-requests`, `POST /payment-requests|boarding-payments|confinement-payments/{id}/verify|reject`, `GET /cashier/receipts/{id}` (+confirm/reject/reread via `ReceiptController` → `ReceiptConfirmationService`)
- POS: `GET /cashier/pos/products|services`, `POST /cashier/pos/transaction` (`idempotency` middleware + `Idempotency-Key`), `POST /cashier/pos/transaction/{id}/void`, `GET /cashier/receipt/{id}`, `/customer-order-receipts/{id}`
- Cash drawer ops: `POST /cashier/refund`, `/multi-payment`, `/void`, `/apply-discount`, `/handover`, `/end-shift`, `GET /handover/last`, `/shift-report/last`
- Shared (multi-role): product search/barcode (cashier+inventory+admin), `GET /gift-cards/{n}/balance` (auth-only, read-only — accepted), payment-proof file access (secure-file logic — verified protected).

Every frontend `apiRequest("/cashier/…")` call maps to a real route; no invented/dead frontend paths found.

## 2. RBAC probe matrix (live, audit stack)

Non-mutating probes (empty payload → 200/404/422 proves authorization passed; 403 proves denial). Tokens minted per role.

| Endpoint | customer | receptionist | inventory | veterinary | manager | cashier | super_receptionist | admin |
|---|---|---|---|---|---|---|---|---|
| GET /cashier/dashboard | 403 | 403 | 403 | 403 | 403 | **200** | **200** | **200** |
| GET /cashier/payment-requests | 403 | 403 | 403 | 403 | 403 | **200** | **200** | **200** |
| GET /cashier/transactions | 403 | 403 | 403 | 403 | 403 | **200** | **200** | **200** |
| POST /cashier/pos/transaction | 403 | 403 | 403 | 403 | 403 | auth ✓ | auth ✓ | auth ✓ |
| POST /cashier/void | 403 | 403 | 403 | 403 | 403 | auth ✓ | auth ✓ | auth ✓ |
| Unauthenticated any /cashier/* | — | — | — | — | — | — | — | — |

Unauthenticated probes → **401** across the group.

## 3. Reverse probes — cashier attempting cross-role actions

| Attempt | Result |
|---|---|
| Approve receptionist workflow | 403 |
| Inventory stock adjustment | 403 |
| Create admin user | 403 |
| Generate payroll | 403 |
| Manager reports | 403 |
| Cashier-only pages from customer role (e2e) | redirected to portal (batch3 spec) |

Cashier-appropriate cross-module calls verified allowed: `POST /boardings/{id}/pay` (delegates to `PaymentVerificationService::verify`, writes settlement + activity log atomically — confirmed in DB), product/customer search, product barcode lookup.

## 4. IDOR & attribution

- `verified_by`/`rejected_by`/`created_by` populated from `Auth::id()` inside locked transactions — verified on settlement and activity-log rows.
- Payment-proof files served through private file routes (`/api/files/payment-receipts/{id}/view`); direct access requires auth.
- Customer-order receipt endpoint rejects until `payment_status='paid'` (422).

## 5. Response-code conformance

Observed: 200 success, 401 unauthenticated, 403 wrong role, 404 missing record, 422 business-rule rejection (unapproved booking, already-paid double verify, missing rejection reason, insufficient cash/stock, non-pending reject), 400 double-void. All within contract.

## 6. Defects found → fixed (see `CASHIER_FIX_CHANGELOG.md`)

| Sev | Endpoint | Defect |
|---|---|---|
| P1 | `POST /cashier/void` | `status='voided'` ∉ `sales.status` enum → **always 500** (verified live) |
| P1 | `POST /cashier/refund` | `type='refund'` ∉ `sales.type` enum → **always 500**; plus `Sale::saving` clamped `amount` ≥0, killing the negative-refund-row design |
| P1 | `POST /cashier/multi-payment` | `type='multi_payment'` ∉ enum → **always 500** |
| P1 | `GET /cashier/transactions` | Mirrored-paid `service_requests` + their `payment_settlements` listed the same payment twice |
| P2 | settlement write | `payment_method` read stale pre-update row → `NULL` on counter-cash settlements |
| P2 | `GET /cashier/dashboard` | `today_sales`/`monthly_sales`/`sales_by_type`/`top_selling`/`completed_payments` had no status filter → cancelled sales inflated revenue |

All re-probed on the audit stack post-fix: void → 200 (sale `cancelled`, payment `refunded`, invoice `cancelled`, stock restored); refund → 200 (`amount=-100.00`, `payment_type='refund'`); multi-payment → 200 (₱0 audit row); feed deduped (SERVICE-249/SERVICE-1 gone, SETTLEMENT-61/57 single).
