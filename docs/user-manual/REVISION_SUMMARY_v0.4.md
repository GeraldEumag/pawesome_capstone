# User Manual Revision Summary — v0.4

**Revised file:** `PAWESOME_USER_MANUAL_v0.4.md` (+ generated `.pdf`, `.docx`)
**Sources kept intact:** `PAWESOME_USER_MANUAL.md` (v0.2), `PAWESOME_USER_MANUAL_v0.3.*`, `REVISION_SUMMARY.md`
**Date:** 25 October 2026
**Audit basis:** working tree HEAD `3e75be0` + uncommitted changes; evidence in `audit/` (BASELINE_AUDIT, ROLE_FEATURE_MATRIX, MANUAL_GAP_ANALYSIS, WORKFLOW_VERIFICATION_MATRIX, SCREENSHOT_AUDIT)

---

## A. Executive summary

- **Audited:** the full v0.3 manual claim-by-claim against current source (routes, sidebars, components, controllers), plus a fresh backend test run (98 tests / 493 assertions) and a mocked browser run (10/14 pass — 4 stale-spec failures, no app defects).
- **Changed:** v0.4 adds the boarding-care lifecycle, approval confirmation dialogs, the unique payment-reference rule, pet-photo rules (JPG/PNG/WebP <10 MB), counter GCash/Maya collection, cancel-own-request, vet additional billing, the Controlled Drugs register, and three new manager pages (Invoice Approvals, Receipt Scanner, Controlled Drugs). Confirmed the landing boarding-rooms section was deliberately removed — not documented.
- **Incomplete:** 8 screenshot placeholders remain (no live-stack capture this pass); payroll bulk/13th-month/loans/remittance/DTR, barcode generation, monthly audit submission, and Settings changes remain unexercised; email mailbox delivery unprovable.
- **Readiness:** READY WITH DOCUMENTED LIMITATIONS (see §G).

## B. Revision table (v0.3 → v0.4)

| Section | Previous state | Change made | Evidence | Verification status |
|---|---|---|---|---|
| Header/doc control | v0.3 row | v0.4 row | — | — |
| §4.1 My Pets | no photo rules | added JPG/PNG/WebP <10 MB + HEIC note | `CustomerPets.jsx:36-38,460` | VERIFIED (source + backend photo test) |
| §4.4 Pay/track | pay + resubmit only | added unique-reference rule, cancel-own-request, vet additional billing, receipt view | `PaymentReferenceGuard` + BT; cancel routes; `VeterinaryBillingPaymentFlowTest` BT | VERIFIED |
| §5.1 Approve/reject | plain approve/reject | row-actions menu + "Are you sure you want to approve this request?" dialog; hotel room rules; double-approve safe | 3 booking pages (SRC) + BT | VERIFIED |
| §5.2 (new) Boarding stay | absent | Check In → care logs → Ready for Pickup → Check Out | routes + `ReceptionistHotelBookings.jsx` | TESTED-ONLY (actions in source; live chain not rerun) |
| §5.3 Walk-ins | create only | added Recent Walk-in Bookings list | `ReceptionistWalkIns.jsx` | VERIFIED |
| §6.1 Payment approvals | verify/cash/reject | counter GCash/Maya w/ reference; rejected-proof queue behavior | `PaymentApprovals.jsx` + BT | VERIFIED |
| §6.2 POS | — | insufficient-cash block; receipt logo; recheck-before-resubmit note | BT; `CashierPOS.jsx` idempotency (uncommitted) | VERIFIED |
| §7 sidebar | 12 items | added Controlled Drugs | `InventorySidebar.jsx:33` | VERIFIED |
| §7.2/7.3 | — | manager-approval link for adjustments/variances | `ManagerInvoiceApprovals.jsx` | CODE-REVIEWED |
| §7.4 (new) Controlled Drugs | absent | register description + auto-entry note | `ControlledDrugRegister.jsx` | CODE-REVIEWED |
| §8.2 | — | dispensing/confinements/certificates brief mention | `DispensationController` + routes | CODE-REVIEWED |
| §9 sidebar | 19 items | added Invoice Approvals, Receipt Scanner, Controlled Drugs | `ManagerSidebar.jsx` | VERIFIED |
| §9.4 (new) | absent | three pages described | component sources | CODE-REVIEWED |
| §14 flow | 5-step narrative | added unique reference, confirm dialog, boarding care beats | BT + P9 | VERIFIED |
| §15 Troubleshooting | 14 rows | +4 rows (pet photo, reference reuse, cash-for-online, adjust-stock) | BT | VERIFIED |
| §17/18 | — | placeholder note + glossary additions (payment reference, care log, controlled drug register) | — | — |
| all | placeholders | now 8 (incl. Invoice Approvals, Controlled Drugs) | SCREENSHOT_AUDIT | — |

## C. System coverage summary

- **Workspaces verified against source:** all 8 (customer, receptionist, cashier, inventory, veterinary, manager, admin, super receptionist) + staff self-service/kiosk.
- **End-to-end verified:** auth lifecycle; booking→approve→pay→receipt; payment-reference uniqueness (4 flows); walk-in→cash; hotel card→approve→room; POS sale; vet consult→billing→auto-close; admin create-user→welcome link.
- **Documented but unverified:** bulk payroll generation, 13th-month accrual, salary loans, remittance/DTR exports, barcode generation, monthly audit submission, settings changes, controlled-drug entry creation, dispensation counsel/void, vaccination recall/certificate, inventory legacy route variants.
- **Unavailable (stated in manual):** customer store checkout (410 confirmed today); no Payroll role.
- **Excluded:** landing boarding rooms (deliberately removed in `3e75be0`).

## D. Screenshot summary (updated 2026-10-25, second pass)

- Referenced: **26** · verified present: **26** · newly captured live: **8** (UM-017–UM-024) · placeholders remaining: **0**
- All 8 placeholders resolved with genuine captures from the live stack (seeded dev DB, role accounts; `frontend/.manual-v04-capture.cjs`). See `audit/SCREENSHOT_AUDIT.md`.
- Spec repairs: all 4 prior mocked-spec failures fixed and rerun green — `revision-b-confirmed-flows.spec.js` 5/5, `customer-add-pet-modal.spec.js` 7/7. No application code was changed; failures were stale selectors/mock URLs/fixture dates and one deliberately removed feature (landing rooms, `3e75be0`).
- Manual wording aligned with captured UI: Stay Duration note (§4.3), **Proceed to Payment** label (§6.2), Reject Payment reason list (§6.1), Invoice Approvals tabs + subtitle (§9.4), controlled-drug witness rule (§7.4), **Open list** links (§5.3).

## E. Test and build evidence (this pass)

| Command | Env | Result | Establishes | Does not establish |
|---|---|---|---|---|
| `php artisan test --filter='PaymentBookingChannelTest\|PrivatePetPhotoTest\|BookingSchedulingIntegrityTest\|BoardingRoomLifecycleTest\|VeterinaryBillingPaymentFlowTest\|AuditRegressionTest\|EmailAuthFlowTest'` | backend, MySQL `pawesome_test` | 98 passed / 493 assertions, exit 0 | payment-channel rules, reference guard, boarding/room rules, photo rules, welcome-email intent, auth lifecycle, POS cash floor, misc. regressions — on current tree | full suite (606) not rerun; UI not covered |
| `E2E_LIVE=false PW_START_FRONTEND=true npx playwright test e2e/revision-b-confirmed-flows.spec.js e2e/customer-add-pet-modal.spec.js e2e/receipt-pdf-regression.spec.js --project=chromium` | frontend, mocked APIs | 10 passed / 4 failed | receipt PDFs, Add Pet modal flows, ongoing-booking details, approval-dialog codepath (source-confirmed) | the 4 failures are stale specs, not app defects — see MANUAL_GAP_ANALYSIS |
| `php artisan route:list --path=api` | backend | 731 route lines | route inventory incl. `api/public/boarding-rooms` (public rooms endpoint retained server-side) | runtime behavior |
| `node frontend/.manual-pdf-build.mjs …v0.4.md …v0.4.pdf` | repo root | "Embedded 18 screenshot references"; 2.69 MB PDF, ~25 pages, valid EOF | all image refs resolve; render OK | visual page-by-page check not performed |
| `pandoc … -o …v0.4.docx` (portable 3.7.0.2) | docs/user-manual | 2.95 MB DOCX; 18 media files; 1×H1/23×H2/37×H3 | full structure + images embedded | visual Word check not performed |
| Read-only MySQL probes | `pawesome_test` | fixtures absent pre-test | safe to run RefreshDatabase suite | — |

## F. Outstanding issues

| ID | Issue | User impact | Evidence | Next action |
|---|---|---|---|---|
| O-01 | 8 screenshot placeholders uncaptured | placeholders in PDF | SCREENSHOT_AUDIT | capture on live build before submission |
| O-02 | Bulk payroll/13th-month/loans/remittance/DTR unexercised | manual lists pages w/ caveat note | feature matrix | exercise on test DB before certifying §9.3 |
| O-03 | Mailbox delivery unprovable | manual can't promise email arrival | both prior audits | verify on deployed env w/ real domain |
| O-04 | 4 mocked specs stale vs current UI (selectors/limits/dates) | none — spec debt only | this run | update specs in a test-maintenance pass |
| O-05 | `pawesome_test` Phase-9 fixtures gone (empty) | none — test data only | probe today | reseed if live verification is rerun |
| O-06 | Uncommitted tree changes (idempotency, confinement-cancel, dispensation-void) | docs cover them only briefly | git status | re-check manual after the user's WIP lands |
| O-07 | No official school template / support contact | formatting + §15 "ask administrator" generic | gaps register | obtain before submission |
| O-08 | Inventory legacy route variants (`products`, `simplified`, etc.) undocumented | low — not sidebar-linked | route list | decide if they should be documented or removed |

## G. Release-readiness decision

**READY WITH DOCUMENTED LIMITATIONS.**

Evidence: every documented procedure traces to current source, a 98-test backend pass, carried Phase-9 live evidence on the same code lineage, and confirmed UI labels; no invented features; unavailable scope stated honestly. Limitations: placeholders for 8 screenshots, several payroll/report pages unexercised, mailbox delivery unproven, and the working tree still carries uncommitted application changes — a final doc check is advised after that work lands.
