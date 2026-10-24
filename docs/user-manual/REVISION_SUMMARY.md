# User Manual Revision Summary — v0.3

**Revised file:** `PAWESOME_USER_MANUAL_v0.3.md`
**Source:** `PAWESOME_USER_MANUAL.md` (v0.2, kept unchanged)
**Date:** 25 October 2026
**Reason for revision:** Reviewer feedback — simplify instructions and descriptions for regular users and remove technical detail that does not belong in a user manual.

---

## 1. Revision summary

| Original section (v0.2) | Revision made | Reason |
|---|---|---|
| Header status notice | Removed the verification-environment notice; replaced with a simple version/date line | Technical detail |
| Document control | Added v0.3 row describing the plain-language rewrite | Accuracy |
| §1.2 System overview | Removed "a page existing does not prove a workflow" note; kept scope in plain words | Clarity |
| §1.3 Roles | Kept the same eight roles; rewrote as a short bullet list describing what each role does | Usability |
| §1.4 Requirements | Rewrote as three plain requirements (URL, account, browser); removed Playwright/Chromium test details | Technical detail |
| §1.5 Security practices | Kept user-relevant items; removed developer/testing cautions | Clarity |
| §1.6 Verification status tags | Removed entirely; verification evidence stays in `audit/` | Technical detail |
| §2 How to use this manual | Shortened to four bullets; removed status-tag and audit-file references | Clarity |
| §3.1 Sign in | Kept steps; removed verification note and "8 seeded accounts" detail | Technical detail |
| §3.2 Registration | Kept steps; removed API/token/HTTP 403 expected-result text | Technical detail |
| §3.3 Email verification + password reset | Rewritten fully in plain language (flagged by adviser); no outbox, SMTP, or token details | Technical detail |
| §3.4 Sign out | Kept, unchanged wording tightened | Clarity |
| §4 intro | Kept sidebar list; removed "Correction vs v0.1" note and route path | Technical detail |
| §4 (new) | Added a plain-language status table (booking + payment statuses, with what to do next) | Usability |
| §4.1 My Pets | Kept steps; simplified wording | Clarity |
| §4.2 Grooming/vet booking | Kept steps; "New Request" removed — the actual control is **Book Now** on the Services page; removed runtime note | Accuracy + technical detail |
| §4.3 Pet Hotel booking | Kept steps; rewrote expected result in plain words (flagged by adviser); removed backend/notification-event text | Technical detail |
| §4.4 Track requests / pay | Kept steps; removed receipt fixture ID and runtime note | Technical detail |
| §4.5 Store orders | Rewritten as a short plain note that customer checkout is unavailable; removed HTTP 410 and endpoint list | Technical detail |
| §4.6 Other customer pages | Kept; removed API path, outbox/send-time wording | Technical detail |
| §5.1 Review a booking | Kept steps; added vaccination-card check as a plain step; removed API error string | Technical detail |
| §5.2 Walk-ins | Kept steps; removed `booking_channel` field name and receipt fixture ID | Technical detail |
| §5.3 Other receptionist pages | Kept; removed test-session caution | Clarity |
| §6.1 Payment approvals | Kept steps and the walk-in/cash rule in plain words; removed endpoint, table name, and migration note | Technical detail |
| §6.2 POS sale | Kept steps; removed runtime receipt/void note | Technical detail |
| §6.3 Transactions | Kept; tightened | Clarity |
| §7.1–7.3 Inventory | Kept steps; rewrote the Adjust Stock rule in plain words ("to add stock, receive a batch"); removed log/table details | Technical detail |
| §8.1 Appointments/consultation | Corrected the finalize step — the button is **Finalize & Review Bill** and the visit closes automatically after payment (not "Complete Consultation"); added **Needs Confinement** | Accuracy |
| §8.2 Other vet pages | Kept | — |
| §9.1 Reports | Kept | — |
| §9.2 Attendance/day-off/leave | Rewrote in plain words; removed `employee_day_offs`, seed endpoint, and HTTP codes | Technical detail |
| §9.3 Payroll and HR | Kept page list; added honest note that some pages may still be under preparation | Accuracy |
| §10.1 Manage users | Kept steps; rewrote welcome-email note without token/outbox/provider detail | Technical detail |
| §10.2 Other admin pages | Kept; removed role-gate wording | Clarity |
| §11 Super Receptionist | Kept; removed route paths | Technical detail |
| §12.1 Self-service | Kept pages; removed endpoint name and runtime fixture detail | Technical detail |
| §12.2 Attendance kiosk | Rewritten as user steps (PIN → punch); removed HTTP codes, headers, and spec references | Technical detail |
| §13 Payroll role scope | Kept the conclusion (no payroll role); removed the v0.1/v0.2 defect history | Technical detail |
| §14 Cross-role workflows | Replaced the `status=…` code block and spec-result lists with a simple five-step "how a booking moves" walkthrough | Technical detail |
| §15 Troubleshooting | Rewritten as a user problem/what-to-try table; removed migration, outbox, "fixed in v0.2", and HTTP 410 entries | Technical detail |
| §16 Security and privacy | Kept user rules; removed mailer/outbox/provider items | Technical detail |
| §17 Screenshot index | Retitled "List of screenshots"; kept all 18 figures and files | — |
| §18 Glossary | Kept user terms; removed status-tag definitions; kept honest scope notes in plain words | Clarity |
| §19 Role quick reference | Replaced route paths with "where you start" descriptions | Technical detail |
| §20 Revision history | Kept; updated for v0.3 | Accuracy |

## 2. Missing information and items to verify

These items could not be fully confirmed and were written conservatively or flagged in the manual. None were filled in with invented details.

| Item | What needs checking |
|---|---|
| Bulk payroll generation, 13th Month accrual, Salary Loans, Remittance/DTR report exports | Pages exist in the manager menu but were not exercised end-to-end. Confirm which are ready before training staff on them. |
| Barcode Generator output and Monthly Audit submission | Pages exist; the full generate/submit flows were not exercised. |
| Admin **Settings** changes | Page exists; specific options were not verified. |
| Email delivery to a real inbox | The system sends verification, reset, and welcome emails; delivery to a real mailbox was not proven in testing. Confirm on the live deployment. |
| Support/administrator contact | The manual says "ask your administrator" — no official contact person or channel was provided. |
| Supported browsers and mobile | Documented as "modern browser"; no official browser/device list exists. |
| School/institutional document template | If the submission requires a specific cover page or format, apply it to this text. |
| Missing screenshots | Placeholders inserted for: Pet Hotel form with vaccination upload, walk-in form, payment-reject dialog, POS cart mid-sale, consultation editor, Create User form. Capture on a real build before submission. |
| New screenshots for changed labels | Figure captions still match the October 2026 build. Re-capture if the interface has changed. |

## 3. Final quality checklist

- [x] Entire original manual reviewed.
- [x] Every applicable role covered (customer, receptionist, cashier, inventory, veterinary, manager, admin, super receptionist, staff self-service).
- [x] Every existing module and function reviewed.
- [x] Instructions simplified throughout.
- [x] Technical implementation details removed from user-facing sections (moved to `audit/` evidence files).
- [x] Step-by-step procedures included where needed.
- [x] Expected results explained in plain language.
- [x] Status descriptions checked against the actual UI labels (`utils/bookingTabs.js`, `CustomerBookingsBoard.jsx`).
- [x] Screenshots reviewed; placeholders added where a real capture does not exist.
- [x] Role permissions and workflows preserved; no capabilities added or removed.
- [x] Grammar, numbering, formatting, and terminology checked.
- [x] Remaining uncertainties documented (Section 2 above).
- [x] Final manual reviewed from a first-time user's perspective.
- [ ] New screenshots captured for the six placeholder spots — requires a running build and a real tester.
- [ ] Official school template applied, if required.
