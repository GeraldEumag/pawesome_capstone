# 05 — Email Reliability & Delivery Monitoring

**Status:** PASS (pipeline) — monitoring = ACCEPTED RISK pending external alerting (Phase 4)
**Date:** 2026-11-28

## Lifecycle audit (traced in code + verified live)

```
Business event
  → EmailDeliveryService::intent()/lifecycle()/paymentReceipt()
      • dedup via occurrence_key (unique)
      • recipient stored encrypted/fingerprinted
      • intent-time gates: global notif switch, per-customer email pref
  → email_deliveries row status=pending (+ expires_at)
  → schedule: email-deliveries:dispatch (every minute)
      → SendEmailDelivery job on `emails` DB queue
      → send-time suppression re-check (user_active,
        recipient_unchanged, customer_email_enabled, custom)
      → Brevo REST API → provider_status + provider_message_id
      → status=accepted (or failed/bounced/…)
  → Brevo webhook → recordProviderEvent → delivered/bounced/complaint/…
  → email-deliveries:reconcile (10 min): expired pending→expired,
    stale processing→unknown
  → email-deliveries:retry (privileged, --reconciled for unknown)
```

Architecture preserved — no changes made. Verified properties:

- **Dedup:** `occurrence_key` unique per business occurrence — booking
  retries cannot double-send.
- **Suppression both directions:** intent-time preference check AND
  send-time re-check (opt-out between intent and pickup suppresses).
- **Terminal-state safety:** webhook events never regress finished rows.
- **Unknown-outcome safety:** privileged retry requires `--reconciled`
  confirmation so a possibly-sent email is not duplicated.
- **Dead-address suppression:** bounce/spam/invalid webhook events write
  `email_suppressions` rows keyed by recipient fingerprint.

## Live metrics (production, 2026-11-28)

| Metric | Value |
|---|---:|
| accepted | 438 |
| suppressed | 3 |
| pending | 0 |
| processing | 0 |
| delivered (webhook-confirmed) | 0 — webhook not yet registered (Phase 4 of report 04) |
| failed / bounced / unknown / expired | 0 |
| oldest pending | — (none) |
| queue backlog (`jobs`) | 0 |
| `failed_jobs` | 0 |
| `email_suppressions` rows | 0 |

Sample: `#441 reminder.appointment → suppressed` demonstrates the
send-time suppression path firing correctly on real data.

## Operational visibility

Existing interfaces are sufficient for a capstone-scale deployment:

- `email_deliveries` table is the source of truth — queryable via
  `php artisan tinker` / SQL; statuses: pending, processing, accepted,
  delivered, deferred, bounced, complaint, blocked, failed, suppressed,
  expired, unknown.
- `php artisan email:retry {id} [--reconciled]` for privileged retries.
- Recipients are fingerprinted/encrypted — admin queries expose no raw
  addresses beyond what the DB already stores.

Metrics dashboard recommendation (deferred): a read-only admin page or
scheduled digest summarizing the table above. Not built — no admin UI
exists for ops metrics and Phase constraints favor minimal change.

## Alert thresholds (defined; wiring pending Phase 4 monitoring)

| Condition | Threshold | Channel |
|---|---|---|
| Pending backlog | > 20 pending or oldest pending > 15 min | external monitor → email/webhook |
| Provider failures | any `failed`/`unknown` rows, or `failed_jobs` > 0 | same |
| Bounce/complaint rate | > 5% of last 100 sends | same |
| Suppression growth | sudden spike in `email_suppressions` | same |
| Scheduler inactivity | no `email-deliveries:dispatch` run in 10 min | uptime monitor on `/api/health` + log review |

**Fallback note:** alerts must NOT route through the same Brevo pipeline.
Recommended: UptimeRobot/Better Stack (free tier) supports HTTP monitors +
email/webhook/sms alerts independent of the app.

## Gaps

1. No automated alerting yet — metrics are queryable but nobody is paged.
   → covered by Phase 4 external monitoring recommendation.
2. `delivered` state unreachable until Brevo webhook is registered
   (user action, report 04).
3. No admin UI for email metrics — tinker/SQL only (acceptable at current
   volume: ~440 lifetime deliveries).
