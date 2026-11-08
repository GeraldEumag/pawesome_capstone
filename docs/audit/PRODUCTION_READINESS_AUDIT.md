# Production Readiness Audit — 2026-11-08

Target: **Vercel frontend + Railway Laravel API/MySQL**, not historical Hostinger/Render instructions. Status: **Not established; repository/local evidence only.**

| Gate | Current state |
| --- | --- |
| Frontend locked install/unit/build | Local npm workflow restored; Vitest and build results in tracker. No Yarn lock changes. |
| Backend regression | MySQL-compatible local MariaDB evidence; MySQL 8 CI execution still required. |
| Exact API/frontend origins | Deployment VITE_API_BASE_URL, FRONTEND_URL, APP_URL, CORS/Sanctum values not inspected remotely. |
| HTTPS/proxy/client IP | Laravel default stack restored with TrustProxies plus ValidatePostSize/TrimStrings/null conversion; local forwarded-header regression passes. Actual Railway edge trust, spoof resistance and HTTPS behavior still require remote verification. |
| Secrets/debug | Production APP_DEBUG=false, stable APP_KEY and server-only provider secrets not remotely verified. Never put mail/API secrets in VITE variables. |
| Storage | Demo needs persistent storage/app volume; business production needs verified separate private/public object storage. No live ACL/persistence proof. |
| Queue/scheduler | Array/sync local execution is not proof of supervised production workers, scheduler, retry/reconcile or failed-job monitoring. |
| Email | No approved provider/mailbox test or real sending-domain authentication proof. |
| Database upgrades/backups | Fresh disposable migration/seed passed. Retained-data upgrade, backup/restore and rollback drills not performed; destructive steps require separate consent. |
| Demo accounts | Seeded accounts are local fixtures. Must not be present with known credentials in business production. |
| Dependencies | Composer audit clean; xlsx advisory exception/replacement open. |
| Health/CORS/SPA routing | Local operation observed. Actual deployed health, SPA deep links, caching, edge headers and error monitoring not tested. |
| Load/concurrency | One controlled retry race verified; no multiuser soak/capacity sign-off. |
| Complete business UI acceptance | Incomplete; see E2E plan/results. |

## Required external evidence

Authorized read-only inspection of the actual Vercel/Railway services, production-domain choices and edge forwarding; staging database engine/upgrade checks; storage ACL/persistence verification; supervised queue/scheduler/monitoring; approved delivery test; reviewed dependency exception; bounded staging load and business-owner acceptance. No deployment or policy settings were changed in this run.

A controlled capstone demo can tolerate documented sync/file-cache constraints; that is not equivalent to business-production approval. Passing automated tests does not remove these gates.
