# Demo Failure Recovery Plan

**Date:** 2026-11-17 · Goal: recover any demo failure in <60s without losing panel confidence.

## Bring-backup kit

- [ ] Fresh browser profile (no extensions) + a second browser installed
- [ ] Pre-captured screenshot set in `browser-evidence/` (see readiness report §evidence) — worst case, narrate over real captures
- [ ] This laptop on AC power, Windows updates paused, notifications off
- [ ] Backup hotspot/phone tethering (app is local, but panel may need internet for other reasons)
- [ ] Two terminals open: one in `backend/`, one in `frontend/`

## Failure → Recovery matrix

| Symptom | Likely cause | Recovery (<60s) |
| --- | --- | --- |
| White page / "Failed to fetch" | Windows socket exhaustion (68K+ TIME_WAIT — documented known issue) | Restart browser; if persists, `netstat -ano` to confirm → reboot was the planned mitigation; fall back to screenshot narration while rebooting (~3 min) |
| 401/login loop | Stale localStorage token | DevTools → Application → clear localStorage → re-login |
| Backend 500 / no response | `php artisan serve` died | Terminal 1: `php artisan serve --port=8000` (restarts instantly, no state loss — it's stateless) |
| Frontend blank/Vite error | dev server died or HMR wedged | Terminal 2: Ctrl+C → `npm run dev` → hard-refresh |
| `ECONNREFUSED` / DB errors | MySQL stopped | XAMPP control panel → start MySQL |
| Email "not arriving" | Expected — `MAIL_MAILER` dev mode | **Say**: "Demo uses the log mailer; production uses Brevo + outbox queue — the intent row IS the durable record" → show `email_deliveries` table / `storage/logs/laravel.log` |
| Queue job "stuck" | `QUEUE_CONNECTION=sync` in demo — jobs run inline, nothing queues | By design; show `SendEmailDelivery` job + outbox if asked |
| A workflow shows "no pending items" | Demo data consumed by rehearsal | Re-create inline (the demo IS record creation) or run a seeder; 49 pending service-requests + 10 pending boardings exist as buffer |
| Demo DB corrupted mid-run | Bad manual edit | Restore from pre-demo mysqldump snapshot (take one morning-of: `mysqldump -u root pawesome > pawesome_predemo.sql`) |

## Golden rules

1. **Never improvise an explanation.** If unsure, say "let me check that against the audit docs" — `docs/audit/` is on this machine.
2. **Narrate during recovery.** "While that restarts, note the payment proof just written is on the private disk — the DB row and file are atomic."
3. **Screenshot fallback is legitimate.** All evidence in `browser-evidence/` is real captures of this exact build — using it is not a mockup.
4. **Practice the reset once.** The night before: kill both servers, restart, run the Act-1 login — confirm <60s recovery.
5. **If the room machine isn't yours:** the stack requires XAMPP MySQL + PHP 8.2 + Node — a full cold setup is NOT <60s. Insist on using the prepared laptop, or present the evidence set + repo walkthrough.
