# Customer Role — Final Release Checklist

**Date:** 2026-11-18 · Mirrors AGENTS.md release checklist, scoped to the Customer Role.

## Application (complete ✅)

- [x] No P0/P1 defects; 0 app-code changes required across both audits
- [x] Registration → Brevo verification → verified-gated bookings
- [x] IDOR/mass-assignment/role boundaries verified on live stack + suite
- [x] Vet/grooming/boarding chains persist correctly end-to-end
- [x] Payment proof → pending → cashier verify → paid + VAT receipt; channel + check-in gates
- [x] Private files owner-authorized; uploads validated (MIME/ext/size)
- [x] Notifications + email outbox with dedup + send-time suppression
- [x] Live chat customer↔staff with ownership enforcement
- [x] F-02 ordering descope: 410 mutations, read-only legacy history
- [x] Backend 291/291 · vitest 44/44 · build green · customer e2e green
- [x] DB integrity: 0 orphans, 0 invalid statuses, 0 unverified-paid, capacity-aware room conflicts
- [x] Audit docs complete (8 CUSTOMER_* + 7 CUSTOMER_FINAL_* + tracker)

## Environment (open ⬜ — required before RELEASE READY)

- [ ] **MySQL 8 CI run** — run full suite on `mysql:8.0` (Docker or CI); static scan + strict-sim already clean
- [ ] `APP_ENV=production`, `APP_DEBUG=false`, production `APP_KEY`
- [ ] Exact production CORS `CORS_ALLOWED_ORIGINS` + `SANCTUM_STATEFUL_DOMAINS` + `FRONTEND_URL`/`APP_URL`
- [ ] `SESSION_SECURE_COOKIE=true` (HTTPS)
- [ ] **Queue worker** `php artisan queue:work --queue=emails,receipts,default` + scheduler daemon (`email-deliveries:dispatch`, `:reconcile`)
- [ ] **S3-compatible private + public buckets** — payment proofs must never be publicly readable
- [ ] **Brevo domain authentication** — verified sending domain → publish SPF/DKIM/DMARC; configure webhook URL → confirm `delivered_at` populates and bounce/spam suppressions engage
- [ ] Remove demo seed accounts; real admin credentials
- [ ] Backup + restore drill; monitoring; failed-job alerting
- [ ] Post-deploy smoke: `/api/health`, customer login→book→proof→cashier verify chain on production

## Deferred (non-blocking)

- P3: remove dead `/admin/reports/customers` branch in `CustomerReports.jsx`
- P3: remove `/pets` fallback in `CustomerPets.jsx:351` (defensive dead path)
- P3: consolidate legacy `GET /customer/grooming/{id}` controller ambiguity
- Continue tracking `xlsx` advisory (risk-accepted, write-only usage)
