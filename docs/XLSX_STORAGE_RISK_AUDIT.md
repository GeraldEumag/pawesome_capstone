# Spreadsheet Export & S3/R2 Storage Risk Audit

Scope: inventory of all spreadsheet generation/parsing paths and object-storage
configuration. Verification/hardening phase — no provider migration performed.

## Spreadsheet (xlsx / CSV) findings

### Packages

| Package | Version | Where | Usage |
|---|---|---|---|
| `xlsx` (SheetJS) | 0.18.5 | Frontend | **Export only** — `json_to_sheet` / `aoa_to_sheet` / `writeFile` in `utils/reportExport.js`, `utils/advancedReportExport.js`, `components/inventory/MonthlyInventoryAudit.jsx` |
| `papaparse` | 5.5.3 | Frontend | **Export only** — `Papa.unparse` in `MonthlyInventoryAudit.jsx` |
| — | — | Backend | No PHP spreadsheet library; only a streamed `fputcsv` CSV in `Admin\CustomerReportController` |

### Risk assessment

- **Known CVEs not reachable.** CVE-2023-30533 (prototype pollution) and
  CVE-2024-22363 (ReDoS) affect SheetJS's *parse* path (`XLSX.read` /
  `sheet_to_json` on untrusted files). The app never parses spreadsheets —
  no `XLSX.read` call exists and no upload field accepts `.xlsx`/`.csv`
  (upload validation allows only `jpg/jpeg/png/webp/pdf`). Risk: low.
- **Version caveat.** `0.18.5` is the final version SheetJS published to npm;
  fixes now ship via the SheetJS CDN registry. If dependency freshness becomes
  a requirement, pin `https://cdn.sheetjs.com/xlsx-<ver>/xlsx-<ver>.tgz` or
  migrate to `exceljs`. Not required for current export-only usage.
- **Formula injection — FIXED.** CSV cells beginning with `=`, `+`, `-`, `@`,
  tab, or CR execute as formulas when opened in Excel. Exported reports carry
  user-controlled text (customer names, emails, phones, item names, pet names,
  diagnoses). All CSV sinks now sanitize:
  - `utils/csvSanitize.js` (new shared helper: `sanitizeCsvCell`,
    `sanitizeCsvRow`, `sanitizeCsvRecords`)
  - `utils/reportExport.js`, `utils/advancedReportExport.js`,
    `api/medicalRecords.js`, `MonthlyInventoryAudit.jsx` (Papa.unparse input)
  - `Admin\CustomerReportController::exportCustomerReports` (`fputcsv`)
  - SheetJS `.xlsx` exports need no sanitization: `aoa_to_sheet`/`json_to_sheet`
    write string cells (`t:'s'`), which Excel never evaluates as formulas.
- **Temp files:** none — CSV streams via `php://output`; browser exports are
  in-memory Blobs. No cleanup gaps.
- **Macros / external links:** not applicable — no import path exists.

### Pre-existing bug found and fixed

`exportCustomerReports` and `exportCustomerReportsPdf` read
`$data['customers']` / `$data['summary']` at the top level, but
`getCustomerReports` nests them under `data` — both exports produced empty or
broken output. Now reads `$data['data']['customers']` /
`$data['data']['summary']`. Covered by
`ReportsTest::test_customer_csv_export_neutralizes_formula_prefixes`.

## S3 / R2 storage findings

### Configuration

- Driver package installed: `league/flysystem-aws-s3-v3` (+ `aws/aws-sdk-php`).
- `config/filesystems.php` exposes `private` and `public` disks, each
  switchable between `local` and `s3` via `PRIVATE_STORAGE_DRIVER` /
  `PUBLIC_STORAGE_DRIVER`. Separate buckets supported
  (`AWS_PRIVATE_BUCKET` / `AWS_PUBLIC_BUCKET`, falling back to `AWS_BUCKET`),
  custom `AWS_ENDPOINT` for R2/S3-compatible providers, and
  `AWS_USE_PATH_STYLE_ENDPOINT` for path-style providers (e.g. MinIO).
- `visibility` is intentionally left unset on S3 — R2 and ACL-disabled S3
  buckets reject a `public-read` ACL; access is governed by bucket policy /
  custom domain. Both disks use `throw => true`.

### Verified

- `Storage::disk('private')` with `driver=s3` + R2-style endpoint builds
  `League\Flysystem\AwsS3V3\AwsS3V3Adapter` — the provider path is real, not
  stubbed.
- All uploads flow through `FileStorageService::storeAndPersist()` (store → DB
  write in transaction → delete new file on failure → delete replaced file
  only after success) — verified in the earlier storage-hardening phase.
- Private files are **never** exposed via public URLs: all reads go through
  `Api\SecureFileController` with per-role/ownership checks; no `temporaryUrl`
  or pre-signed URL usage exists.
- Public-disk `url()` resolves through `AWS_PUBLIC_URL` — for R2 this must be
  set to the bucket's public custom domain, or public images won't resolve.

### Notes / residual

- No automated test can exercise the live S3/R2 path without real credentials;
  recommend a deploy-time smoke check (upload → read → delete on both buckets)
  before production cutover.
- Local dev uses `local` driver for both disks; `php artisan storage:link`
  required once for public-disk URLs.

## Changes made this phase

| File | Change |
|---|---|
| `frontend/src/utils/csvSanitize.js` | New shared formula-injection sanitizer |
| `frontend/src/utils/reportExport.js` | Sanitize CSV cell values |
| `frontend/src/utils/advancedReportExport.js` | Sanitize CSV cell values |
| `frontend/src/api/medicalRecords.js` | Sanitize CSV cells |
| `frontend/src/components/inventory/MonthlyInventoryAudit.jsx` | Sanitize records before `Papa.unparse` |
| `backend/app/Http/Controllers/Admin/CustomerReportController.php` | `sanitizeCsvCell()` + correct `data.*` nesting (bug fix) |
| `backend/tests/Feature/ReportsTest.php` | CSV formula-injection test |
| `docs/XLSX_STORAGE_RISK_AUDIT.md` | This document |
