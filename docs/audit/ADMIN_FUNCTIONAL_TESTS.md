# Admin Functional Test Results

All executed against the isolated audit DB unless noted. Browser flows ran on
frontend :3000 → audit API :8001.

## Dashboard

- Loads; all stat cards reconcile with SQL (users, customers, appointments,
  revenue 1450, low-stock 269). Fabricated `active_modules` removed (ADM-06).
- Refresh reloads data; navigation across all pages works (admin-dashboard spec).

## User management

- Create (all roles incl. `vet_tech` — ADM-07), duplicate email → 422,
  invalid role → 422.
- Update, role assignment (audited), activate/deactivate via new UI toggle
  (ADM-03) + `PATCH .../toggle`.
- Delete requires reason (422 JSON), tombstones email, restore works, restore
  collision handled.
- Welcome-email delivery intent persisted; activity logged.

## Settings

- Round-trip persistence for `maintenanceMode`, `emailNotifications`,
  `loginAlerts`, `failedLoginAlerts` — all now enforced (ADM-04).
- Dead toggles removed from UI; payload exposes only enforced keys.
- Kiosk PIN not returned plaintext (ADM-08).

## Logs

- Activity logs: admin mutations recorded + filterable + paginated.
- Login logs: success + failed attempts with reasons (ADM-02); statistics correct.

## Reports

- All 12+ admin report sub-pages render; endpoints 200; figures reconciled to DB
  (revenue multi-source = 1450 verified; counts match).
- Payroll sub-page uses `/manager/payroll/*` read/generate-report endpoints —
  report generation, not an operational payroll write.

## Chatbot / misc

- Chatbot logs, stats, histories render; FAQ CRUD verified (403 for non-admin).
- Live chat, landing-page editor, employees, profile all open without errors
  (batch7 spec — every admin page).
- Admin correctly sent to a staff workspace when opening `/customer` (blocked).

## Cross-role workflow (Gate A + E2E)

Customer request → receptionist approves + assigns vet → customer uploads proof →
cashier verifies → vet consultation → billing → settlement → customer visibility →
manager dashboards — **end-to-end PASS**, RBAC denial confirmed at each boundary.
