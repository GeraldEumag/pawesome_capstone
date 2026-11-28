# 10 — Known Limitations & Defect Management

**Status:** REVIEWED — no production blockers; no changes made
**Date:** 2026-11-28

## L1 — Pet-photo UPDATE via PUT+multipart returns 422

**Implementation:** PHP does not populate `$_FILES`/parsed multipart body
for `PUT` requests — Laravel's `PUT /api/pets/{id}` with
`Content-Type: multipart/form-data` yields no file. The create path uses
`POST` (works). The frontend photo flow uses POST create → verified live
(pet 24 photo → signed URL 200 `image/png`).

**User impact:** none in current UI — photo attach happens at pet creation;
there is no "replace photo" UI path that PUTs multipart. If a replace-photo
feature is added later it must use `POST` + `_method=POST` override or a
separate upload endpoint.

**Fix needed?** No. **Regression coverage:** upload create path covered by
existing feature tests; live-verified in smoke test #11.

## L2 — POS "invoice PDF" is client-side jsPDF

**Implementation:** the POS receipt view renders a printable receipt; any
"PDF" download is generated in the browser via jsPDF from receipt JSON —
not a server-rendered document.

**User impact:** cosmetic — the printed/PDF'd invoice is a client artifact;
it cannot be independently verified server-side and depends on the user's
browser. The authoritative receipt record (`payment_receipts`, receipt
JSON, VAT breakdown) IS server-side and verified (smoke #19–20: ₱200 →
tax 21.43 exact).

**Fix needed?** No — server-side `Dompdf` infrastructure already exists
(`PayslipPdfService`, 317KB verified render). Promoting POS receipts to
server PDF is a feature, not a defect fix. **Do not change** working
receipt behavior without a concrete requirement.

## L3 — Payslip PDF exists only as payroll-release email attachment

**Implementation:** `PayrollController::payslip` returns JSON
(`/api/my-payroll/{id}/payslip`); the actual PDF is produced by
`PayslipPdfService` (Dompdf) inside the `PayslipReleasedMail` attachment.

**User impact:** employees cannot download their payslip PDF on demand —
they receive it by email at payroll release. Acceptable for capstone
payroll flow; a "download PDF" endpoint would be a small feature
(`PayslipPdfService` is already injectable).

**Fix needed?** No. Documented limitation; revisit only if payroll
self-service is expanded.

## Summary table

| # | Limitation | Severity | Status | Action |
|---|---|---|---|---|
| L1 | PUT+multipart photo update 422 | Low | By-design PHP constraint; UI unaffected | None — use POST if feature added |
| L2 | Client-side invoice PDF | Low | Cosmetic; authoritative receipt is server-side | None |
| L3 | Payslip PDF email-only | Low | Documented; service reusable | None |

**No defects promoted to fixes.** All three are architectural/documented
constraints, not bugs. Regression suites (1298 backend tests, Vitest,
Playwright) continue to cover the working paths.
