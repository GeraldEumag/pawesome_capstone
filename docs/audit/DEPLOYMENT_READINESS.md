# Deployment Readiness — Capstone B (2026-10-25)

Target per `docs/DEPLOYMENT.md`: Vercel (frontend) + Railway (Laravel API/MySQL). Audit is config-level — no deploy performed, no provider accessed.

| Area | Finding | Status |
|---|---|---|
| Env vars | `APP_KEY`, `APP_DEBUG=false`, DB creds, `FRONTEND_URL`, `MAIL_*`, `BREVO_API_KEY`, `PRIVATE/PUBLIC_STORAGE_ROOT` required | owner action |
| Migrations | Railway pre-deploy runs `migrate` (confirmed in `backend/railway.json`); 178 migrations apply clean | ready |
| CORS/Sanctum | Exact prod domains required in config; currently dev values | owner action |
| Queue/scheduler | `emails` queue worker + `email-deliveries:dispatch/:reconcile` scheduler required in production; `QUEUE_CONNECTION=sync` acceptable for demo only | owner action |
| Email transport | Brevo HTTPS configured path exists (`MAIL_MAILER=brevo`); mailbox delivery unproven in this env | owner verify |
| Storage | `storage:link` for public disk; private proofs never public; Railway needs persistent volume at `storage/app` | owner action |
| Health/logging | `/api/health` responds; storage failures → 503 JSON; failed jobs need monitoring | partial |
| Secrets | No secrets in repo/docs; test creds (AGENTS.md) must not ship to prod seed | owner action |
| Route/config cache | `route:cache`, `view:cache`, `config:cache` documented for prod | ready |

**Blockers to production:** real domain + SPF/DKIM/DMARC for Brevo, supervised queue worker + scheduler, Redis (business prod), backups/monitoring, removal of demo seed accounts, committed build of the uncommitted WIP.
**Blockers to demo:** none — documented limits only.
