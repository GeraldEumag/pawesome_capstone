# 12 — CI/CD and Release Pipeline

## Existing CI (`.github/workflows/ci.yml`) — verified

| Job | Steps | Coverage |
| --- | --- | --- |
| `backend` | checkout → PHP 8.2 (bcmath, gd, intl, pdo_mysql, zip) → `cp .env.example .env` → `composer install` → `composer validate` → `composer audit` → `key:generate` → `migrate --force` on MySQL 8.0 service → `php artisan test` | Full PHPUnit suite on MySQL 8 + dependency audit |
| `frontend` | checkout → Node 22 + npm cache → `npm ci` → `npm audit --audit-level=critical` → `npm run build` | Install + critical-vuln audit + production build |

Triggers: `push`/`pull_request` to `main` + `workflow_dispatch`.
Permissions: `contents: read`. **No deploy job — deliberate.**

### CI gaps identified

| Gap | Severity | Recommendation |
| --- | --- | --- |
| **Vitest not run in CI** | Medium | Frontend job runs build only; `npm run test:unit` (75 tests) should gate releases — add step |
| No Playwright in CI | Low–Medium | 99 spec files need live stack (MySQL + PHP workers + Vite) — heavy for CI; recommend a scheduled/nightly smoke subset (role smoke + cashier workflow) rather than full suite |
| No PHP syntax/static analysis | Low | `php -l` implied by tests; Pint (`laravel/pint` installed) could run `pint --test` for style gate — optional |
| No migration dry-run on prod-like data | Low | CI migrates empty DB only; production-like rehearsal belongs in staging (report 14) |
| Secrets | None in CI — uses throwaway MySQL service creds; safe | PASS |

## Recommended release pipeline (design — not implemented)

```
release/
 ├─ ci (existing): backend tests + composer audit + frontend build/audit
 ├─ ci-addition: npm run test:unit  (vitest gate)
 ├─ staging deploy (manual approval):
 │    backend → staging Railway/Hostinger env
 │    frontend → staging Vercel preview env
 │    run: migrate --force on staging DB copy
 │    smoke: role logins, booking, POS sale, receipt, email outbox
 ├─ production deploy (manual approval required):
 │    1. tag release commit
 │    2. pre-deploy backup (report 05)
 │    3. deploy backend (migrations via preDeployCommand — LOW-TRAFFIC WINDOW)
 │    4. deploy frontend (VITE_API_BASE_URL baked)
 │    5. post-deploy checklist (report 14)
 └─ rollback: redeploy previous artifact + restore DB backup if schema changed
```

## Deployment automation reality

- Deploys are **manual/provider-driven** — `railway.json` automates
  preDeploy migration + start on Railway deploys; Vercel deploys on git
  push or CLI. No custom CD scripts exist or are required at this scale.
- Approval gates = provider dashboard protections + discipline in the
  runbook; GitHub `environment` protection rules can add required
  reviewers if a deploy workflow is added later.

**Status: PARTIALLY VERIFIED** — CI verified and adequate for test
coverage; vitest gate + staging environment are recommended additions,
not blockers for a capstone-scale release.
