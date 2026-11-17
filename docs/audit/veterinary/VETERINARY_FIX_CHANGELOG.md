# VETERINARY_FIX_CHANGELOG.md

**Audit date:** 2026-11-17 · Scope: verified P0–P2 defects only; P3 documented, not fixed.

---

## Fixes applied

### FIX-01 — `vet-tech-intake-audit.spec.js` unreachable target row (test-design defect)
- **Severity:** P2 (test-suite reliability — the only failing item in the entire audit)
- **Root cause:** spec created the appointment ~600 days in the future; the appointments board paginates at `pageSize={15}` (`StandardTable`) and sorts `emergency, checked_in_at, scheduled_at`, so on a seeded DB (~45 active rows) the row lands on page 3 and `Actions for {id}` never renders. Passed previously only on near-empty databases.
- **Affected file:** `frontend/e2e/vet-tech-intake-audit.spec.js` (+3 lines)
- **Fix:** click the board's own "Scheduled" status filter before locating the row — narrows the list so the target is always on page 1. Test intent unchanged (tech performs check-in via UI, no clinical controls, persistence verified).
- **Regression verification:** spec re-run against `pawesome_e2e_audit` → **PASS** (14.0s; check-in persisted with `checked_in_by = tech.user.id`, zero API errors).

### FIX-02 — audit probe test file added (coverage, not a defect fix)
- `backend/tests/Feature/VeterinaryFinalAuditProbeTest.php` — 5 tests / 95 assertions covering the previously-unprobed surface: unauthenticated 401 sweep, wrong-role 403 sweep, cross-vet IDOR, foreign-pet record creation, vet_tech boundary. All pass.

## Application code defects found

**None.** Zero P0–P2 application defects were verified. The application code passed every runtime probe; the single failing artifact was a flaky-by-design e2e spec (FIX-01).

## P3 findings documented (not fixed, per audit policy)

| ID | Area | Finding | Post-audit status |
| --- | --- | --- | --- |
| FE-01 | frontend | `VetCurrentBoarders.jsx` (618 lines) is dead code — route mounts `VeterinaryCurrentBoarders.jsx`. | **Resolved** — file + CSS deleted (`VETERINARY_POST_AUDIT_REMEDIATION.md`) |
| FE-02 | frontend | `VeterinaryCurrentBoarders.jsx` uses bare generic classes (`page-header`, `status-badge`, `info-row`) violating the `pw-*`/module-prefix convention; global-collision risk. | **Resolved** — renamed into `boarders-*` family |
| FE-03 | frontend | Sidebar lacks a nav link to `/veterinary/medical-confinements` (reachable via URL + consultations, but undiscoverable). | **Resolved** — `Confinements` nav item added (vet nav only) |
| BE-01 | backend | `DashboardController::reports` counts retired `treated` status (dead list entry; `completed` still counted). | **Resolved** — dead entry removed |
| BE-02 | backend | Mixed response envelopes (`{consultation}` / `{record}` / `{data}` / bare arrays) — tolerated by frontend fallbacks; no `API_RESPONSE_CONVENTION` conformance for vet endpoints. | **Retained** — standardization is a breaking contract change; deferred |
| DB-01 | database | 34 stale `in_consultation` rows in dev DB — seeder/test-data hygiene; lifecycle code itself enforces closure correctly. | **Deferred** — requires owner-approved cleanup plan; dev DB read-only |
| SEC-01 | security | `medical-records` list endpoint not covered by `ClinicalAccessLogger` (detail reads are logged). | **Resolved** — `recordListView` added + regression test |
| OBS-02 | backend | `complete()` permits any vet to claim a STARTED visit with `veterinarian_id = null` — documented claim semantics, verified safe (no foreign-vet writes on assigned visits). | **Verified intentional** — `VisitStartService` + `complete` both enforce assigned-vet guards; unassigned-visit claim is by design |

*Post-audit note: the earlier "nine P3" wording was a count error — the canonical list is these eight IDs; see `VETERINARY_POST_AUDIT_REMEDIATION.md` §P3-count reconciliation.*
