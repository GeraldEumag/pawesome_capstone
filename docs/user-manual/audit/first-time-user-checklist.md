# First-Time-User Walkthrough Checklist — Pawesome User Manual v0.2

**Purpose:** Human acceptance gate for the user manual. A tester unfamiliar with Pawesome follows the manual's procedures on the seeded local build and records whether each step is understandable and produces the documented result.

**Status:** ☐ PENDING — no human walkthrough has been performed yet. This checklist is prepared; completion requires a real tester.

---

## 1. Tester profile (fill in before starting)

| Field | Entry |
|---|---|
| Tester name | |
| Role tested | ☐ Customer ☐ Receptionist ☐ Cashier ☐ Manager (pick one primary; others optional) |
| Prior exposure to Pawesome | ☐ None ☐ Attended a demo ☐ Other: ___ |
| Date / duration | |

## 2. Environment

| Item | Value |
|---|---|
| Frontend | `http://127.0.0.1:3000` |
| Backend API | `http://127.0.0.1:8000/api` |
| Database | Local MySQL `pawesome` (seeded) |
| Manual under test | `docs/user-manual/PAWESOME_USER_MANUAL.md` v0.2 |
| Browser | Chrome/Edge (Chromium) |

Test accounts (seeded): customer `customer@example.com`, receptionist `receptionist@example.com`, cashier `cashier@example.com`, manager `manager@example.com` — passwords per `AGENTS.md`. Use ONLY these accounts; do not test with real customer data.

## 3. Required starting state

- Backend + frontend dev servers running.
- Seeded data present (pets, services, at least one pending request is acceptable but not required).
- Tester starts logged out.

## 4. Procedure checklist

Record each step's result: ✅ works as documented / ⚠ works but manual unclear / ❌ fails or contradicts manual.

### Core customer flow
| # | Step (per manual §4) | Expected result | Result | Notes |
|---|---|---|---|---|
| 1 | Log in as customer | Lands on customer workspace; sidebar shows Services, My Pets, My Requests, Notifications, History, Medical, Reports, Profile | | |
| 2 | Open My Pets | Pet list renders ("Buddy" or seeded pets) | | |
| 3 | Book a grooming service via the form → review modal → submit | Confirmation/appointment recorded; lands on My Appointments | | |
| 4 | Upload a GCash payment proof for the request | Proof accepted; request shows pending verification | | |
| 5 | Check My Requests / Notifications | Request and status visible | | |

### Receptionist flow
| # | Step (per manual §5) | Expected result | Result | Notes |
|---|---|---|---|---|
| 6 | Log in as receptionist; open booking queues | Submitted request appears in the correct queue | | |
| 7 | Approve the customer request | Status advances; customer-visible state changes | | |
| 8 | Create a walk-in booking for an existing customer | Walk-in created with `walk_in` channel; appears for cashier | | |

### Cashier flow
| # | Step (per manual §6) | Expected result | Result | Notes |
|---|---|---|---|---|
| 9 | Log in as cashier; open **Dashboard** | Opens `/cashier/dashboard` overview (NOT the full-screen POS) | | |
| 10 | Open Payment Approvals; verify the customer's proof | Receipt issued; request becomes paid | | |
| 11 | Ring up a POS sale, then void it | Sale recorded then cancelled; stock/totals consistent | | |

### Manager / self-service flow
| # | Step (per manual §9, §12) | Expected result | Result | Notes |
|---|---|---|---|---|
| 12 | Log in as manager; review a leave request | Approve/reject works; balance effects shown | | |
| 13 | Edit an employee's day-off schedule | Set and clear days persist | | |
| 14 | Unlock `/attendance-kiosk` with the kiosk PIN | Kiosk unlocks; wrong PIN rejected | | |

## 5. Evidence capture

- Save screenshots to a personal folder (do NOT overwrite `docs/user-manual/screenshots/` — those are reference captures).
- Note exact error messages verbatim.
- Record any step where the manual's wording did not match what was on screen.

## 6. Confusion / ambiguity log

| Manual section | What confused me | Suggested fix |
|---|---|---|
| | | |

## 7. Pass/fail criteria

- **PASS** — tester completes each attempted step without asking for help, or recovers using only the manual; no step contradicts the document.
- **CONDITIONAL PASS** — minor wording mismatches that do not block task completion (list them above).
- **FAIL** — any documented step produces an error, a wrong screen, or requires outside help.

## 8. Defect severity guide

| Severity | Meaning |
|---|---|
| S1 Blocker | Documented step fails; workflow cannot complete |
| S2 Major | Step completes only via undocumented workaround |
| S3 Minor | Wording/screenshot mismatch; workflow still completes |
| S4 Trivial | Typos, ordering, cosmetic issues |

## 9. Sign-off

| Field | Entry |
|---|---|
| Outcome | ☐ PASS ☐ CONDITIONAL PASS ☐ FAIL |
| Tester signature / date | |
| Reviewer (project rep) signature / date | |

> This gate stays **PENDING** until a real tester — not the author or an agent — completes it. Do not mark the manual submission-final without this sign-off.
