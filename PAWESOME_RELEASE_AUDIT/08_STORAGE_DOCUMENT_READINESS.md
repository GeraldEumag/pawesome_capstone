# 08 — Storage, PDF and Document Readiness

## Filesystem architecture (verified)

- **Dual-disk design** (`config/filesystems.php`): `public` disk for
  avatars/inventory images; `private` disk for payment proofs, pet
  photos, vaccination cards, inventory evidence. Each disk independently
  selectable local-or-S3 via `PRIVATE_STORAGE_DRIVER` /
  `PUBLIC_STORAGE_ROOT` env — production can stay local (Railway volume)
  or move to S3 without code changes.
- `storage:link` maps `public/storage` → `storage/app/public`;
  `railway.json` start command runs it automatically.
- `FILESYSTEM_DISK=public` default; private files never get public URLs.
- Current local footprint: `storage/app` = **48 MB / 819 files**
  (private 47 MB, public 56 KB) — small; volume or bucket both trivial.

## Private document access — verified

`Api\SecureFileController` serves private files through authorized
endpoints (`/payment-proofs/{type}/{id}/view`,
`/payment-receipts/{id}/view`, `/vaccination-cards/{id}/view`,
`/pet-photos/{petId}/view`):

- Auth required (`Auth::user()` → 401).
- **Per-record authorization**: customers can only view their own
  records; staff roles scoped (`admin/cashier/super_receptionist`,
  `receptionist/manager`, veterinary for clinical docs) → 403 otherwise.
- Streams via `Storage::disk('private')->get()` with explicit headers —
  no public symlink exposure, no path traversal (Flysystem keys only).
- Frontend never constructs `/storage/private/...` URLs — all private
  content flows through these endpoints.

## PDF generation

- Sole generator: `App\Services\Payroll\PayslipPdfService` (Dompdf
  3.1.6, A4). `isRemoteEnabled=false` — **no SSRF via remote images**;
  logo embedded as data URI (verified in prior audit report 07).
- PHP requirements: `dom`/`libxml`/`mbstring` present; **`gd` improves
  image handling** — absent in local XAMPP CLI and **not in the
  Dockerfile ext-install list** (CI installs it). Recommend adding `gd`
  to `backend/Dockerfile` for raster-image fidelity in PDFs.
- Receipts are HTML/print (jsPDF client-side for exports) — no server
  PDF dependency for receipts.

## Upload storage paths

- Pet photos → `pet_photos` on **private** disk; profile photos →
  `profile_photos` public; payment proofs → `payment-proofs` private;
  vaccination cards → `vaccination_cards` private; inventory evidence →
  `inventory-evidence` private. Server-generated filenames; mimes+size
  validated (report 03).

## Production storage checklist

| Item | Status |
| --- | --- |
| Persistent storage | Required: Railway volume at `storage/app` (documented) or S3 disks — **owner action at deploy** |
| `storage:link` | In `railway.json` start command / runbook step |
| Private/public separation | Verified |
| Document authorization | Verified per-record + per-role |
| Path independence | All paths via `storage_path()`/Flysystem — no dev-machine absolutes in code |
| PDF deps | dompdf pure-PHP; gd recommended |
| Generated docs | Payslip PDF rendered on demand; logo data-URI — works behind any domain |

**Status: PASS** — architecture verified; only deploy-time volume/bucket
provisioning remains (owner action, in runbook).
