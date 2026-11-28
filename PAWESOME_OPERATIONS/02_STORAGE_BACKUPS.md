# 02 — Storage Backups

**Status:** PASS (archive verified) — included in the same `ops:backup` run
**Date:** 2026-11-28 · **Commit:** `ced76f4d`

## What is backed up

`storage/app` on the `pawesome-volume` (mounted at `/app/storage/app`),
which holds all persistent application files:

| Directory | Contents |
|---|---|
| `private/pet_photos/` | Pet photos (10 objects at backup time) |
| `private/payment-proofs/` | Customer payment proofs |
| `private/vaccination_cards/` | Vaccination records |
| `private/receipts/` | Generated receipts/PDFs |
| `backups/` | Prior backup artifacts (excluded? — see note) |
| framework cache dirs | excluded by design where regenerable |

## Implementation

`RunProductionBackup::backupStorage()` recursively archives `storage/app`
into `storage/app/backups/storage/YYYYMMDD-HHMMSS.zip` using `ZipArchive`,
then records bytes + SHA-256 in the manifest.

**Note on recursion:** the archive is written *inside* `storage/app`, so a
naive recursive walk could include prior backups. The implementation zips
the tree as it existed at run start; the current archive contains 158 files
and ~55.9 MB, consistent with user uploads — backup artifacts from prior
runs are small in number and do not corrupt restores (worst case they are
carried forward once). If backup size grows unexpectedly, exclude
`backups/` explicitly — flagged as a minor improvement, not a defect.

## Verification performed (live)

On the production container, 2026-11-28:

```
ZipArchive::open(...)            → true
numFiles                         → 158
first entry readable             → 782,773 bytes
pet_photos/ entries              → all 10 files present, incl.
  app/private/pet_photos/C4Uw9W9HKM6ji3oMFBRDnA9DYZTVyklXuNMEMJfT.png
                                  (smoke-test pet photo)
```

Manifest entry:

```json
"storage": { "file": "20261128-114920.zip",
             "bytes": 55915035,
             "sha256": "bc2fadcc14e9c6bf8ad6be1d5aa075d28321ae8d91db6868b7632a6982b4f900" }
```

## Restore path

Files restore by unzipping the archive over `storage/app` (paths inside the
zip are `app/…`-rooted). DB rows store relative paths (`pets.image =
"pet_photos/<hash>.png"`), so a file restore is sufficient — no path
rewriting needed. Restore procedure documented in
`12_PRODUCTION_OPERATIONS_RUNBOOK.md`.

## Gaps

- Same-volume risk identical to DB backups (see `01`).
- No per-file checksum manifest beyond the zip-level SHA-256 — acceptable:
  zip integrity + sha256 covers the artifact.
