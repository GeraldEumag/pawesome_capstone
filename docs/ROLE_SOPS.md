# Pawesome — Role SOP Printouts & Training Notes

Print one section per role and post it at the relevant station. Statuses and
gates reflect the Phase A–E workflow.

## Visit lifecycle (all roles)

```
requested → scheduled → checked_in
→ in_consultation (→ in_treatment / awaiting_results)
→ clinical_complete → checkout → completed   (automatic)
```

A visit closes **automatically** when the medical record is finalized, no
confinement is open, the invoice is settled, and no open tasks remain. No
role completes a visit by hand.

---

## Receptionist

- Check patients in (`checked_in`) — flag walk-ins as **emergency** at intake.
- Work the **walk-in board**, convert service requests to scheduled visits.
- Assign/reassign veterinarians — only while the visit is still assignable
  (`requested → checked_in`); every reassignment is audit-logged.
- Confinement ops: assign a **ward bed** (isolation beds flagged), admit the
  pet, log care entries, and release after veterinary clearance — **only**
  when payment is `paid`. If payment cannot settle, call a manager for a
  logged override release.
- After clinical work starts, cancellation requires a manager/admin.

## Vet Tech (`vet_tech`)

- Watch the **appointment board** (read-only) and perform intake check-ins,
  including emergency walk-in flagging.
- May perform specimen collection/result entry on diagnostic orders.
- May **not** order/review diagnostics, start consultations, edit medical
  records, or access veterinarian-only routes (403).

## Veterinarian

- Start consultations from the queue (lock-protected; repeat clicks are
  idempotent). `Idempotency-Key` headers are honored on start.
- Medical records: drafts editable; **finalized records are immutable** —
  corrections go in as append-only addenda. Finalize and addendum writes are
  audit-logged.
- Order diagnostics; review results; the visit parks at `awaiting_results`.
- Confinement: recommend, mark care level (observation/treatment/critical),
  schedule/administer MAR rows. **Stock only moves on administration
  confirm** — scheduling never deducts.
- Dispense take-home medication; stock deducts on dispense. Counsel the
  owner and stamp it. Controlled drugs hit the register automatically.
- Vaccinations: pick the batch — lot/expiry snapshot onto the record and
  certificate. Expired batches are blocked.
- Reading another vet's patient history is allowed but **every read is
  logged** in the clinical-access log.

## Cashier

- Settle visit invoices (`/cashier/items/mark-paid` honors
  `Idempotency-Key`; double-submits replay the stored response).
- Verify payment proofs; request adjustments (discount/waiver/write-off)
  with a reason code — never edit invoice lines directly.
- A stale bill is rejected with "refresh" — re-pull the invoice before
  retrying.
- Release of a confined pet requires `payment_status = paid`; anything else
  needs a manager override.

## Inventory

- Items carry `item_class` (consumable/medicine/vaccine/retail/
  controlled_drug). Batches use FEFO for expiry-tracked items.
- Expiry sweep runs daily (07:30): 90-day watch, 30-day urgent, expired
  batches flagged. Dispose expired stock with a reason — never dispense it.
- Controlled drugs: every movement writes the append-only register with a
  running balance. Weekly count = **two people** — counter records, a
  different person verifies; variance requires a reason and posts a
  count_correction.
- Monthly cycle counts reconcile immediately; a variance needs manager
  approval on the audit row. Stock increases only via batch receiving —
  there is no direct increment.

## Manager

- Approvals queue (`/manager/invoice-approvals`): invoice adjustments above
  the limit, and inventory variance rows — one page, two tabs.
- Controlled-drug oversight: view any register, witness a pending count.
- **Override release**: a confined pet can be released without settled
  payment only by a manager, with a reason (≥10 chars). The override, the
  reason, and the actor are written to the audit log and managers are
  notified.
- Vaccine lot recall: `/manager/vaccination-recall?lot_number=` or by batch
  lists every patient who received the lot.
- Reports use the new visit vocabulary (requested → completed); the old
  `approved/in_consultation/needs_confinement` statuses no longer exist.

## Admin

- Full staff access except the customer portal. Everything above applies;
  admin can also finalize medical records and act on every approval queue.

## Daily automation (scheduler)

| Command | Time | Purpose |
| --- | --- | --- |
| `inventory:check-expiries` | 07:30 | 90/30-day expiry alerts + expired flag |
| `confinement:accrue-daily` | 07:45 | Daily inpatient charges onto visit invoices |
| `notifications:send-reminders` | 08:00 | 24h appointment/boarding reminders |
| `recalls:send` | 08:15 | Vaccine due + post-discharge (24–48h) checks |
| `email-deliveries:dispatch` / `:reconcile` | every 1 / 10 min | Email outbox |

All notifications are durable DB rows (`notifications` + `email_deliveries`
outbox) — a worker restart never loses them. Recall sends are deduped in
`recall_dispatches`; re-running the scheduler is always safe.
