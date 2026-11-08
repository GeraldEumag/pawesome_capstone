# Workflow Integration Results — 2026-11-08

Status: **Backend integration coverage plus expanded Phase 11 and selected browser/API traces; full workflow acceptance incomplete.** Phase 11 after the limiter fix reports 9 PASS / 1 PARTIAL, with one browser-submitted veterinary flow, zero 429s, six transient billing fetch errors and expected 422 probes retained in evidence.

| Area | Actual evidence | Not established |
| --- | --- | --- |
| Veterinary handoff | Hybrid customer request -> receptionist approval/assignment -> veterinary in_consultation -> manager pages; selected DB links independently queried | Entire booking/consent/clinical/billing UI chain. |
| Vet-tech intake | User-approved limited appointment board, focused backend role/scope regressions, smoke and browser check-in case | Full diagnostics/result-entry UI and device operation. |
| Payments/POS | Server-price, booking-channel, reference/idempotency/transaction tests; genuine two-process keyed retry race | Provider settlement, all real cashier UI paths and every concurrent payment/stock/room race. |
| Inventory | Full backend suite includes batch, stock, rollback and monthly-audit scenarios; selected negative-stock checks | Production stock ledger reconciliation, full browser monthly audit and expiry flows. |
| Boarding/grooming | Backend booking, room lifecycle, payment, cancellation/add-on tests | Full browser flows, production room/capacity contention. |
| Email | Backend auth/lifecycle/outbox/retry/preference cases with local/fake transports | Provider acceptance, actual mailbox receipt, SPF/DKIM/DMARC and deliverability. queued/sent/provider-accepted/delivered are distinct. |
| Notifications | Backend role/preferences/workflow cases | Complete browser deep-link/visibility matrix. |
| Storage | Backend private-file/ownership/lifecycle/failure cases and isolated roots | Railway persistent-volume or private/public object bucket ACL verification and browser upload matrix. |
| Chatbot/scanner | Backend scoping/rate/fallback/receipt extraction/reference cases | Live external model/OCR quality, provider spend limits and hardware. |
| HR/payroll/kiosk | Backend attendance/leave/payroll/kiosk cases | Full UI month-end, physical biometric/kiosk deployment and financial reconciliation. |

Customer store checkout remains 410 by approved design. No provider payment, real email, destructive repair or production data mutation was faked or claimed successful.

Legacy Gate A-D scripts have path/assumption problems and are not current evidence until safely adapted and rerun. Fresh tests do not automatically refresh historical Gate reports. All remaining work must retain a failed/blocked/not-tested status rather than being inferred green from suite totals.
