# 07 — PDF & Logo Audit

## PDF path enumeration

Repo-wide search (`dompdf|barryvdh|tcpdf|fpdf|mpdf|->pdf|PDF::`) across
`backend/app`, `backend/config`, `composer.json`:

- **Only one PDF generator:** `App\Services\Payroll\PayslipPdfService`
  (Dompdf) rendering `resources/views/pdf/payslip.blade.php`.
- `LocalOcrReader.php` matched only on the string "pdf" (OCR input mime
  handling) — not a PDF generator.
- Receipts are HTML/print (`ReceiptDocument.jsx` + print pipeline), not
  PDF. Invoices likewise HTML. No receipt/report/order PDF paths exist —
  PDF-01 scope confirmed as payslip-only.

## Payslip PDF verification

- `PayslipPdfService::render()` loads `public/pawesome.jpg` and embeds it
  as a **base64 data URI** — required because Dompdf runs with
  `isRemoteEnabled=false` and cannot resolve filesystem paths. Verified
  at `PayslipPdfService.php:82-93` and `payslip.blade.php:85-93`.
- Blade template: `@page` margins, `.letterhead .logo img` fixed 46px —
  aspect ratio preserved (width/height equal, `pawesome.jpg` is square).
- Multi-page: standard Dompdf flow; payslip content is a single record —
  no explicit page-break logic needed; long content paginates natively.
- Production-safe paths: logo read via `public_path()` with
  `file_exists` guard — missing logo degrades to no-image rather than a
  fatal. No remote URLs, no user-controlled paths.

## Frontend

No client-side PDF generation libraries in `frontend/package.json`
scope; downloads are server-driven (payslip endpoint) or browser print.

## Verdict

**PASS** — single PDF surface, embedded logo, no remote-fetch or
path-injection risk.
