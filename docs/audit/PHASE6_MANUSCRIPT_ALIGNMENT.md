# Phase 6 — Manuscript & Documentation Alignment

**Base:** `f7f01da` (Phase 5)
**Scope:** Align in-repo documentation with the accepted Phases 0–5 system state, and produce exact-edit guidance for the capstone manuscript (thesis DOCX lives outside this repository — this file is the apply-it-manually change list).

---

## 1. In-repo documentation updated

| File | Change | Why |
|---|---|---|
| `AGENTS.md` (Email & Verification) | Added `PayslipReleasedMail` to the transactional-email list, noting the intent is created inside `markAsPaid`'s transaction and occurrence-deduped | The mailable now has a producer (Phase 4) — the list was stale |
| `docs/audit/PHASE6_MANUSCRIPT_ALIGNMENT.md` | This document | — |

**Verified already-consistent (no change needed):**

- `docs/user-manual/PAWESOME_USER_MANUAL.md` — §1 and §4.5 already describe customer store ordering as OUT OF SCOPE with HTTP 410 semantics; troubleshooting table flags disabled checkout; My Payroll section accurate.
- `docs/NOTIFICATION_MATRIX.md` — payroll row already lists employee payslip notification; email-types list already includes "HR payslips".
- `documentation/*EVALUATOR*.md` — no stale ordering/security claims found.
- `docs/diagrams/` — user-maintained architecture assets; left untouched.

## 2. Manuscript change list (apply to the thesis DOCX)

Source of each item: `docs/audit/AUDIT_REPORT.md` findings D-01..D-08 and F-02/F-04/F-08, re-verified against the system as of Phase 6.

### 2.1 Factually wrong statements — must fix

| # | Manuscript says | Reality (verified) | Edit |
|---|---|---|---|
| D-01 (PDF ~p88) | "Django for server-side development, Python for application logic" | Laravel 12 / PHP 8.2+ backend, React **18.3.1** + Vite 6 frontend, MySQL (verified against `frontend/package.json` + `package-lock.json`; earlier "React 19" notes were a `react-is@19.2.7` misread) | Replace with the actual stack; the manuscript's own later chapter already describes Laravel/React — this line is a leftover |
| D-02 (p88–93) | ~10 references to "Telegram chatbot" | Chatbot is in-app only (`TelegramBotController`/`TelegramService` exist but are unrouted dead code) | Replace with "in-app chatbot"; the IPO section's exclusion is already correct |
| F-02 (use case + Fig 58) | Customer store ordering as a live workflow; receptionist order-monitoring UI | Descoped (Phase 3): customer checkout/proof-upload/cancel → HTTP 410; receptionist approve/reject/cancel → 410; **historical order history, receipts, and reporting preserved** | Rewrite the use case as a *descoped* feature: historical records remain readable; self-service ordering was evaluated and intentionally retired. Delete the receptionist order-monitoring UI claims (component deleted). |

### 2.2 Internal inconsistencies — reconcile wording

| # | Conflict | Edit |
|---|---|---|
| D-03 | "Agile Incremental Model" / "Agile Scrum Model 2025" / "Agile Scrum methodology" used interchangeably | Pick one canonical name (recommend "Agile Scrum methodology") and normalize all occurrences |
| D-04 | "Purposive sampling" (Data Analysis Plan) vs "Random sampling" (Sampling Technique) | **AUTHOR/ADVISER DECISION — do not resolve from code.** The manuscript must describe the participant-selection process that actually occurred, not whichever term reads consistently. Purposive sampling is conventional for qualified-IT-evaluator recruitment, but only the researchers can attest to the real method. Reconcile both sections once confirmed |
| D-06 | Architecture text lists 11 modules; Fig 71 shows 10 differently-decomposed modules | Align the narrative list with Fig 71's decomposition (Vet/Grooming/Hotel/POS split) |
| D-07 | Placeholder citations: "[Complete title, publisher, and link]", "[Title of document]. [URL]" ×2 | Complete the references or remove the entries |
| D-08 | Narrative mentions "veterinary assistants"/"hotel attendants"; use-case defines 7 roles | **Nine assignable roles** (verified via `Admin\UserController` validation + `EnsureRole` middleware): customer, receptionist, cashier, inventory, veterinary, vet_tech, manager, admin, super_receptionist. `super_receptionist` is a **composite** (receptionist+cashier+inventory); `admin` bypasses staff checks but is blocked from customer routes; `vet`/`veterinarian`→`veterinary` and `super_admin`→`admin` are aliases, not roles; `payroll`/`staff`/`groomer` are legacy strings in scheduler lists, not assignable; `department`/`position` are columns, not roles | Normalize to the verified nine-role taxonomy and explain the composite role rather than presenting nine equal roles |

### 2.3 Simplified artifacts — annotate or regenerate

| # | Item | Reality | Edit |
|---|---|---|---|
| D-05 | ERD (Fig 16): 16 entities | **93 tables** (verified via `information_schema` on the migrated schema: 9 Laravel framework tables — cache/jobs/sessions/tokens/migrations — and 84 application tables) | Either annotate Fig 16 as a *conceptual* ERD and reference an appendix listing the real table groups (auth/users, pets, service requests, appointments, boarding/hotel rooms, inventory+batches+suppliers, sales/POS, payroll/attendance/leave/13th-month, payments/receipts/settlements, visit invoices, notifications/email outbox, chat), or regenerate the figure from the live schema. Suggested wording: *"The system database consists of 93 tables, comprising 9 framework-related tables and 84 application-specific tables."* |

### 2.4 New true claims the manuscript may now make (Phases 0–5)

These strengthen the evaluation narrative — all verified by tests:

- **Security settings are enforced, not decorative** (F-04 fixed): configurable password minimum/complexity applies to registration, password change, reset, and admin user creation with per-endpoint floors; login throttling and idle-session timeout are live.
- **Profile photos and payment proofs are authorization-gated** blob responses, not public URLs (Phase 1).
- **Transactional email uses a durable outbox** (`email_deliveries`): deduplicated intents created inside business transactions, encrypted recipients, atomic worker claims, send-time suppression, scheduled republish/reconcile. Payslip-release email rides this mechanism (Phase 4).
- **Customer ordering was deliberately descoped** to eliminate a disabled-but-advertised workflow while preserving historical data, receipts, and reporting — a documented scope decision, not a defect (Phase 3).
- **Inventory integrity:** stock increases only via batch receiving (FIFO/FEFO provenance); adjustments reconcile batches to target under row locks; batch `remaining_quantity` can never exceed received quantity (Phases 4–5).

## 3. What was deliberately not changed

- No manuscript DOCX edits — binary file outside the repo; §2 is the exact change list.
- No versioned user-manual copies (`v0.3`, `v0.4` .md/.docx/.pdf) — historical releases left as-is.
- No code changes in this phase.

## 4. Verification

| Check | Result |
|---|---|
| In-repo docs vs system | AGENTS.md email list corrected; manual + notification matrix verified consistent |
| Manuscript items | Every D-0x/F-0x item traced to `AUDIT_REPORT.md` + re-verified against current code |
| Backend suite | No code changes — `a7ddd81`/`f7f01da` gates stand (984 passed / 1 skipped; 33/33 Vitest) |

## 5. Stop gate

Phase 6 complete pending review. Remaining unscheduled items: `booking_requests` archive/drop decision (documented in PHASE5), production email-delivery verification (ops item), `f7f01da` push decision.
