# Production Readiness Gates — Hostinger deployment (2026-10-25)

| Gate | Status | Evidence / gap |
|---|---|---|
| 1 Database (MariaDB) | **PARTIAL** | PASS on MariaDB 10.4.32 (all migrations + 808 tests); exact 10.5 unverified (Docker unavailable) — LOW residual risk |
| 2 Application | **PASS (local)** | 808/808 tests green on committed HEAD; frontend build not rerun this pass |
| 3 Security | **PASS (audited)** | token/RBAC/isolation/server-side pricing verified earlier this session; redeploy checks in runbook §8 pending live run |
| 4 Email | **BLOCKED (delivery)** | outbox+dispatch verified to provider-acceptance; mailbox delivery requires new Brevo account + real domain (spam risk on hostingersite.com without DKIM) |
| 5 Hosting | **BLOCKED** | needs SSH session on the account: composer, CLI PHP, docroot, outbound HTTPS, storage:link |
| 6 E2E workflows | **PASS (local)** | role flows verified on dev stack (mocked + live captures) |
| 7 Recovery | **NOT TESTED** | backup = git push (code) ✓; DB backup/restore drill on Hostinger DB not yet exercised |

**Verdict: NOT YET deployable** — Gates 4/5/7 require the live Hostinger account + Brevo key. Safe local work is done.