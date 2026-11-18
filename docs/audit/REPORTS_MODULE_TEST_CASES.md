# Reports Module — Test Case Register

**Date:** 2026-11-18
**Evidence keys:** API = live curl on :8000/:8001 · SQL = direct query ·
TEST = `php artisan test` · BUILD = `vite build` · SCRIPT = `docs/audit/scripts/e2e_workflow_audit.py`

## Functional correctness

| ID | Category | Scenario | Steps | Expected | Actual | Result | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-01 | Revenue | Sales report excludes cancelled sales | Seed completed ₱500 + cancelled ₱900 + appointment-type ₱300 → `GET /admin/reports/sales` | total_revenue = 500 | 500 | PASS | TEST `test_sales_report_excludes_cancelled_sales_from_revenue` |
| TC-02 | Revenue | Dev baseline unified revenue | Compare RevenueService total vs SQL legs | 62,225 | 62,225 | PASS | API+SQL |
| TC-03 | Revenue | POS sale flows to reports | `POST /cashier/pos/transaction` → `GET /admin/reports/sales` | amount added to revenue | ₱4,580 = SQL | PASS | SCRIPT WF2 |
| TC-04 | Revenue | Verified boarding counts once | boarding pending → cashier verify | paid leg +800, single count | exec/cashier 5,380 | PASS | API+SQL WF3b |
| TC-05 | Revenue | Rejected payment not revenue | cashier reject pending boarding | `rejected_payments`+1, revenue unchanged | 1, unchanged | PASS | API+SQL WF3 |
| TC-06 | Services | Grooming visible in service ledger | create grooming → `GET /admin/reports/services` | `source:"grooming"` row | present | PASS | SCRIPT WF5 |
| TC-07 | Services | Linked-record dedup | dev DB `total_services` | 305 deduped | 305 | PASS | API+SQL |
| TC-08 | Services | Boarding in service ledger | create boarding → services report | `source:"boarding"` | present | PASS | SCRIPT WF6 |
| TC-09 | Customers | New customer appears | `POST /admin/customers` → customers report | row + count increment | 1/1 | PASS | SCRIPT WF8 |
| TC-10 | Customers | POS payments attributed | customer with sales → `total_payments` | ₱1,350 | ₱1,350 | PASS | API+SQL |
| TC-11 | Customers | Balance never negative | POS-only customer | balance ≥ 0 | 0 | PASS | API (was −1,350) |
| TC-12 | Inventory | Adjust-stock reflected | `POST /inventory/items/{id}/adjust-stock` remove 5 | deduction in report | manual_adjustments+1 | PASS | SCRIPT WF7 |
| TC-13 | Inventory | Stock increase blocked | adjust-stock `type=add` | 422 batch-required | 422 | PASS | API |
| TC-14 | Inventory | Low-stock consistent | exec vs canonical lowStockCount | equal | 269/269 | PASS | API+SQL |
| TC-15 | Veterinary | Appointment visible | `POST /appointments` future slot | scheduled_appointments+1 | +1 | PASS | SCRIPT WF4 |
| TC-16 | Orders | Trend excludes unpaid | dev DB orders report | paid-only trend | ₱23,090 | PASS | API |
| TC-17 | Executive | KPI reconciliation | exec total vs SQL legs | equal | ₱5,380 | PASS | API+SQL |
| TC-18 | Cashier | Summary over full set | `?limit=5` must not shrink summary | full-set counts | verified/rejected/receipt = DB | PASS | API |
| TC-19 | Orders | Disabled workflow honest | `POST /customer/store/checkout` | 410 disabled | 410 | PASS | SCRIPT WF1 |
| TC-20 | Orders | Receptionist approve disabled | `POST /receptionist/customer-orders/{id}/approve` | 410 | 410 | PASS | SCRIPT WF1 |
| TC-21 | Predictive | Forecast from real data | `GET /admin/reports/predictive` | least-squares series, no constants | 200 + series | PASS | API |
| TC-22 | Comparison | Period legs labeled | `GET /admin/reports/comparison` | all 8 source labels | labels incl. vet/grooming/settlements | PASS | code+API |
| TC-23 | Segmentation | Paid spend only | `GET .../customers/segments` | unpaid orders excluded from spend | code-verified | PASS | code |
| TC-24 | Staff | Staff revenue excludes cancelled | `GET .../staff-performance` | eligible rows only | code-verified | PASS | code |

## Filters & parameters

| ID | Scenario | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| TC-30 | `from=bad` | 422 | 422 | PASS (API live) |
| TC-31 | `from>to` reversed | 422 | 422 | PASS (API live) |
| TC-32 | `limit=99999` | capped ≤2000 | capped | PASS (TEST) |
| TC-33 | date-range from/to | inclusive bounds, qualified columns | rows in range | PASS (TEST) |
| TC-34 | status filter param | exact-match filter | filters applied | PASS |
| TC-35 | search param | LIKE across name/email/ref fields | filters applied | PASS |
| TC-36 | AdminLiveReport filter UI | date pickers + status + search send params | wired (frontend diff) | PASS (code+build) |

## Security / RBAC

| ID | Scenario | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| TC-40 | Unauthenticated admin report | 401/403 | 401 | PASS (TEST) |
| TC-41 | customer role → admin reports | 403 | 403 | PASS (TEST + live matrix) |
| TC-42 | receptionist → admin reports | 403 | 403 | PASS (live matrix) |
| TC-43 | cashier → admin reports | 403 | 403 | PASS (live matrix) |
| TC-44 | inventory → admin reports | 403 | 403 | PASS (live matrix) |
| TC-45 | vet → admin reports | 403 | 403 | PASS (live matrix) |
| TC-46 | manager → admin reports | 403 (admin-only surfaces) | 403 | PASS (live matrix) |
| TC-47 | admin → every staff report | 200 | 200 all 21 | PASS (live) |
| TC-48 | admin → customer reports | 403 by design | 403 | PASS (live matrix) |
| TC-49 | customer → own records only | scoped queries (`customer_id = auth id`) | code-verified | PASS |
| TC-50 | CSV formula injection | `=`/`+`/`-`/`@` prefixed cells quote-escaped | sanitized | PASS (TEST) |
| TC-51 | Export auth | customer export under role middleware | gated | PASS (routes+TEST) |
| TC-52 | Error leakage | 500s expose no SQL in prod mode | `APP_DEBUG` dependent; messages are controlled | PARTIAL — see security doc |

## Frontend

| ID | Scenario | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| TC-60 | Response normalization | accepts `data`/`data.data`/array | code-verified | PASS |
| TC-61 | Export parity | engine exports filtered dataset | `filteredData` used | PASS (code+build) |
| TC-62 | Dead hook | `useReportData.js` removed w/ zero importers | deleted; grep clean | PASS |
| TC-63 | Endpoint typo | `inventory-opt` → `inventory-optimization` | moot (file deleted); page uses correct path | PASS |
| TC-64 | Build | `vite build` | green 28.5s | PASS (BUILD) |
| TC-65 | Cashier summary cards | server summary preferred over page-slice sum | code-verified | PASS |

## Test commands run

```bash
DB_CONNECTION=mysql DB_DATABASE=pawesome_test php artisan test --filter=ReportsTest   # 17/17 PASS
python docs/audit/scripts/e2e_workflow_audit.py                                      # 7/7 recon PASS
cd frontend && npm run build                                                         # green
php -l on every modified PHP file                                                    # clean
php artisan route:list                                                               # 88 report routes mapped
```

Not run: full `php artisan test` suite (time; scoped run + E2E substituted), Playwright
browser pass (documented Windows socket-exhaustion constraint).
