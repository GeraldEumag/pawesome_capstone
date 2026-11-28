# 15 — Final Release Decision

## Issue register (this engagement)

| ID | Description | Severity | Component | Evidence | Status | Recommended fix |
| --- | --- | --- | --- | --- | --- | --- |
| REL-01 | No production environment provisioned (hosting, domain, DNS, DB, APP_KEY, Brevo creds all absent) | P1 | Infrastructure | Baseline audit — nothing exists yet | BLOCKED→owner action | Execute report 14 runbook §A |
| REL-02 | Live transactional email delivery unverified | P1 | Mail | Requires Brevo API key + verified sender | NOT VERIFIED | Configure Brevo; send test to controlled address; check `email_deliveries` |
| REL-03 | Backup schedule not automated | P2 | Ops | Restore procedure proven (report 05); no cron/provider snapshots configured | PARTIALLY VERIFIED | Add daily mysqldump+off-site copy or provider backups |
| REL-04 | Queue worker not in `railway.json` start command | P2 | Background | `QUEUE_CONNECTION=sync` demo path works; database queue needs worker | PARTIALLY VERIFIED | Add worker service OR accept sync for demo |
| REL-05 | `QUEUE_RETRY_AFTER` unset; default 90s < receipt-scan 120s timeout | P3 | Queue | `config/queue.php` default vs job timeout | OPEN (config) | Set `QUEUE_RETRY_AFTER=180` in prod env |
| REL-06 | Vitest not gated in CI | P3 | CI | `ci.yml` frontend job lacks `test:unit` | OPEN | Add `npm run test:unit` step |
| REL-07 | `gd` missing from backend Dockerfile ext-install | P3 | Deploy | Dockerfile ext list; local PHP also lacks gd | OPEN (low risk) | Add `gd` to `docker-php-ext-install` |
| REL-08 | API tokens have no absolute expiry (idle-timeout mitigates) | P3 | Security | `createToken` without expiresAt; 60-min idle clamp | ACCEPTED | Optional: expiresAt for staff tokens |
| REL-09 | CORS `*` + credentials footgun if misconfigured | P3 | Security | Custom Cors middleware reflects `*` with credentials | ACCEPTED | Runbook forbids `*`; verify env at deploy |
| REL-10 | No load/stress test evidence | P3 | Performance | Extrapolation only; capstone scale low | NOT VERIFIED | Optional post-deploy smoke load test |
| REL-11 | No staging environment | P3 | Ops | Docs describe prod path only | ACCEPTED | Recommend staging for future releases |
| REL-12 | SPF/DKIM/DMARC unverifiable without domain | P3 | Email | DNS access required | NOT VERIFIED | Brevo domain setup at deploy |
| REL-13 | E2E spec/fixture drift (4 failures) | — | Tests | **FIXED this engagement**: spec asserts redirects; vet_tech fixture created; 32/32 pass | FIXED | — |
| REL-14 | `migrate:rollback` unsafe (lossy `down()`s) | P2 | DB | Category E migrations | ACCEPTED | Rollback = backup restore (runbook §D) |

**Totals:** P0: 0 · P1: 2 (both infrastructure-provisioning, not code) ·
P2: 3 · P3: 7 · Fixed this engagement: 1 (REL-13) + spec/fixture work.

## Final release decision

# **READY WITH ACCEPTED RISKS**

**Rationale:** Every code-level release gate passed with fresh evidence —
228/228 critical-path tests, 1298/1298 full suite (same commit), 75/75
vitest, clean build, 32/32 re-run E2E with all prior residuals resolved,
security audit clean (no Critical/High/Medium), DB migrations proven on
MySQL 8 in CI, and a real backup→restore→verify cycle executed
successfully.

The two P1 items (REL-01, REL-02) are **infrastructure provisioning
tasks, not code defects** — they cannot be "fixed" in the repository;
they are the deployment itself. The system is ready to be deployed
*provided the runbook (report 14) is followed*, with the explicit
accepted risks: sync-queue demo mode OR worker setup decision,
manual backup scheduling, and post-deploy verification of live email.

This is **not** an unconditional "READY FOR PRODUCTION" because no
production environment exists yet to verify against — the honest gate
is: code is release-ready; go-live is authorized once the §A checklist
is complete and §C smoke checks pass.
