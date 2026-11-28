# 11 — Operational Handover

## Roles to assign (owner action — fill in names)

| Responsibility | Primary | Backup |
| --- | --- | --- |
| System operator (deploys, env, incidents) | ⏳ name | ⏳ name |
| Database/backup owner (dumps, restores, drills) | ⏳ name | ⏳ name |
| Email/queue owner (Brevo, workers, failed jobs) | ⏳ name | ⏳ name |
| Deployment approval authority | ⏳ name | — |
| Credential custodian (hosting secrets, APP_KEY, API keys) | ⏳ name | ⏳ name |

## Secrets custody

- All secrets live ONLY in Railway/Vercel env stores + a password
  manager (e.g., Bitwarden/1Password vault shared by the two operators).
- `APP_KEY` is the crown jewel — loss orphans encrypted
  `email_deliveries` recipients; store in password manager + offline copy.
- Never in git, chat, or reports.

## Monitoring to configure (post-deploy)

| Signal | Tool | Status |
| --- | --- | --- |
| Uptime `/api/health` | UptimeRobot/BetterStack free tier or Railway healthchecks | ⏳ |
| App errors | `storage/logs/laravel.log` + Railway deploy logs | ✅ built-in |
| Queue failures | `php artisan queue:failed` daily ops check | ⏳ routine |
| Email backlog | `email_deliveries` pending-count check | ⏳ routine |
| DB health | Railway MySQL metrics | ⏳ dashboard |
| Storage capacity | Volume usage on Railway dashboard | ⏳ dashboard |
| Backup success | Alert if nightly dump job fails | ⏳ with backup schedule |

## Incident escalation

1. Detect (uptime alert / user report / log error)
2. Check `/api/health` + Railway deploy status + `laravel.log` tail
3. If DB: check MySQL service status; DO NOT run destructive commands
4. If code: redeploy previous known-good (Vercel/Railway rollback)
5. If data: restore from latest verified backup (report 05 procedure)
6. Post-incident: log in `activity_logs` review + this doc's drill notes

## Recurring ops calendar

- Daily: `queue:failed` check; `email_deliveries` backlog glance
- Weekly: backup integrity spot-check; log review
- Monthly: dependency audit (`composer audit`, `npm audit`); cert/domain check
- Quarterly: **restore drill** (full backup → scratch → smoke)

## Handover checklist

- [ ] Both operators have hosting access + password-manager vault
- [ ] Runbook (release audit report 14) + this doc walked through together
- [ ] First backup + restore drill scheduled
- [ ] Monitoring live and tested (deliberately trigger + confirm alert)
- [ ] Brevo sender verified; test email received by operator

**Status: TEMPLATE READY — names/access pending user assignment.**
