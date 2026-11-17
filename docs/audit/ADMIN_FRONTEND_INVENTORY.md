# Admin Frontend Inventory

Route mount: `frontend/src/routes/AdminRoutes.jsx` (lazy-loaded per page).
Navigation: `frontend/src/components/admin/AdminSidebar.jsx`.

## Pages audited

| Route | Component | Primary API endpoints | Result |
|-------|-----------|----------------------|--------|
| `/admin` | `AdminDashboard.jsx` | `GET /admin/dashboard` | Verified — stats reconcile with SQL (see DATABASE_AUDIT) |
| `/admin/users` | `ManageUsers.jsx` | `GET/PUT /admin/users`, `PATCH .../toggle`, `DELETE .../{id}` | Fixed (ADM-03, ADM-07) — toggle action added, `vet_tech` option added, self-protection |
| `/admin/users/create` | `CreateUser.jsx` | `POST /admin/users` | Fixed (ADM-07) — `vet_tech` role option added |
| `/admin/employees` | Employees | `GET /admin/employees` | Verified (browser, batch7 spec) |
| `/admin/reports` + 12 sub-pages | `AdminReports.jsx` + report components | `GET /admin/reports/*`, `/manager/payroll/*` | Verified — payroll sub-page calls `POST /manager/payroll/generate` (report generation, not an operational write) |
| `/admin/history` | `History.jsx` / `ActivityLogController` | `GET /admin/activity-logs` | Verified — filtering + pagination |
| `/admin/history/logins` | `LoginHistory.jsx` / `LoginLogController` | `GET /admin/login-logs`, `.../statistics` | Fixed (ADM-02) — failed logins now recorded |
| `/admin/chatbot` | `ChatbotLogs.jsx` | `GET /admin/chatbot/*` | Verified (browser, revisions spec) |
| `/admin/live-chat` | `LiveChatInbox.jsx` | chat endpoints | Verified (batch7 spec) |
| `/admin/landing-page` | `AdminLandingPageEditor.jsx` | landing-page endpoints | Verified (batch7 spec) |
| `/admin/settings` | `AdminSettings.jsx` | `GET/POST /admin/settings/*` | Fixed (ADM-04, ADM-08) — dead toggles removed, only enforced settings remain; kiosk PIN no longer round-trips plaintext |
| `/admin/profile` | `ProfileSettings.jsx` (shared) | `PUT /auth/profile` | Verified |

## Frontend defects fixed

- **ManageUsers:** added an activate/deactivate action with a `showConfirm` flow and
  a self-protection guard (current admin cannot toggle its own row — mirrors the new
  backend guard). Status badge is now backed by a real mutation path instead of a
  read-only display.
- **CreateUser + ManageUsers:** `vet_tech` added to role options (backend already
  accepted it — the role was unreachable from the UI).
- **AdminSettings:** removed the eight dead toggles (system name, timezone, date
  format, daily/weekly report emails, etc.) that persisted values nothing consumed;
  kept `maintenanceMode`, `emailNotifications`, `loginAlerts`,
  `failedLoginAlerts` — all of which are now enforced backend-side.

## E2E evidence

- `e2e/batch7-admin-system.spec.js` — every admin page + all 5 staff portals +
  customer-portal block: **all pass**.
- `e2e/admin-dashboard.spec.js`, `admin-dashboard-revisions.spec.js`,
  `admin-reports-charts.spec.js`, `admin-responsive-audit.spec.js` — pass.
- `e2e/role-deep-links.spec.js` — pass after a spec-side env-var convention fix
  (`E2E_API_URL` now carries `/api`, matching `test-utils.js`; backwards-compatible
  when unset).
- Browser evidence written under `browser-evidence/` by the specs themselves.
