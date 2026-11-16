# Phase 0 — Security Containment Report (F-01)

Date: 2026-11-16 · Finding: F-01 (P0, VERIFIED in `AUDIT_REPORT.md`)

## Root cause (verified)

- Apache `DocumentRoot "C:/xampp/htdocs"` serves the entire htdocs tree.
- `Listen 80` binds **all interfaces** → exposure was plausibly LAN-wide,
  not localhost-only.
- The project had **no `.htaccess` at all** → `GET /Pawesome_Capstone/backend/.env`
  returned HTTP 200; ~67 loose PHP scripts were equally reachable.
- The application does not use Apache: the frontend calls
  `http://localhost:8000/api` (`php artisan serve`).

## T-001 — Apache containment (VERIFIED)

Added `Pawesome_Capstone/.htaccess`:

```apache
<IfModule mod_authz_core.c>
    Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
    Order allow,deny
    Deny from all
</IfModule>
```

- No Apache restart required (`AllowOverride All` already active).
- No `httpd.conf`/vhost edits — zero impact on other htdocs projects.
- `backend/public/` is intentionally **not** re-granted: `php artisan serve`
  ignores `.htaccess`, and re-granting would expose `storage/app/public`
  via Apache, bypassing the F-09 authorization fix.
- Committed to the repo so the protection travels with the code.

## T-002 — Root script remediation (VERIFIED)

**67 loose PHP files removed from `backend/` root** (`git rm`, recoverable
from history — verified all were tracked before deletion).

**Relocated to `C:/xampp/pawesome-maintenance/`** (outside document root AND
outside the repo — the user rejected `backend/scripts/` because the repo
was web-served). Paths were patched to `PAWESOME_BACKEND`/`PAWESOME_ROOT`
env-var resolution with correct fallbacks; the two DB-audit scripts had
**stale `C:\Users\ACER\Pawesome_Capstone` paths** — now fixed, so they are
more functional than before. All six pass `php -l`.

| Script | Disposition |
| --- | --- |
| `pawesome_cross_role_e2e_audit.php` | relocated (AGENTS.md Gate A; pure HTTP) |
| `pawesome_security_rbac_audit.php` | relocated (Gate B) |
| `pawesome_database_readiness_audit.php` | relocated (Gate C) |
| `pawesome_report_reconciliation_audit.php` | relocated (Gate D) |
| `pawesome_e2e_payment_fixture_seed.php` | relocated (invoked by `boarding-billing.spec.js`, `phase4-payment-workflow.spec.js`) |
| `route_audit_analyzer.php` | relocated (AGENTS.md documented utility) |
| **61 other scripts** (`reset_passwords.php`, `get_token.php`, `get_admin_customer_tokens.php`, `create_test_token.php`, `fix_*`, `seed_*`, `generate_e2e_payroll.php`, `normalize_archived_pets.php`, `standardize_item_type_naming.php`, `check_*`, `debug_*`, `temp_*`, `tmp_*`, `test_*`, `final_*`, `verify_*`, `deep_*`, `complete_*`, `create_test_*`, `create_and_test_*`, `end_to_end_*`, `comprehensive_*`, `inspect_*`, `investigate_*`, `probe_e2e.php`, `pawesome_schema_integrity_snapshot.php`, `pawesome_sensitive_file_inventory.php`, `pawesome_final_uat.php`) | **deleted** — password resets, token minting, DB mutation, schema/credential info-leak, or obsolete verification scripts; none had functional references (doc citations only, which remain valid as historical record) |

Updated references: `AGENTS.md` (audit-script block + analyzer line),
`docs/E2E_TRIAGE.md`, both E2E specs (seed path now env-overridable via
`PAWESOME_SEED_SCRIPT`).

**Not executed:** no password-reset, token-generation, or mutation script
was run — static inspection only, per containment rules.

## Backup relocation (approved scope)

Four backup directories were web-served from htdocs. Moved to
`C:/xampp/pawesome-archives/` (outside document root), contents preserved:

| Directory | Files | Size | Post-move | Old URL |
| --- | --- | --- | --- | --- |
| `Pawesome_Capstone_backup_20261025_0625` | 48 | 18M | identical | 404 |
| `pawesome_backups` | 1 | 768K | identical | 404 |
| `_pawesome_wip_backup` | 63 | 4.8M | identical | 404 |
| `Pawesome_Recovery` | 161 | 36M | identical | 404 |

No `.env` files were found inside the backups, but their source code was
still exposed; they are now unreachable. Nothing was deleted.

## T-003 — Credential exposure assessment

**Exposed surface (before fix):** `backend/.env` contained `APP_KEY`, DB
credentials, Brevo API key, Groq/Gemini API keys, mail credentials —
readable via plain HTTP GET.

**Exposure window:** `Listen 80` on all interfaces means any device able
to reach this machine on port 80 (LAN, or wider if port-forwarded) could
read these files for the entire time the project sat under htdocs.
Cannot be retroactively scoped — treat as **plausibly exposed**.

**Assessment / recommendation:**

| Secret | Risk if exposed | Recommendation |
| --- | --- | --- |
| `APP_KEY` | Decrypts `Crypt::encryptString` data — incl. `email_deliveries` recipients + serialized mailable payloads | **Do NOT rotate casually.** Rotation orphans every queued/undelivered email intent (payloads become undecryptable). If rotation is ever required: drain the outbox first (`email-deliveries:dispatch` + queue worker until `email_deliveries` has no pending/retryable rows), then rotate. |
| Brevo API key | Send mail as the app, read contact stats | Rotate if the machine was ever reachable beyond localhost — low cost, do it when convenient. |
| Groq / Gemini keys | AI spend abuse | Rotate if exposed beyond localhost; monitor usage dashboards for anomalies. |
| DB credentials | `root`/no-password, localhost-only | No action (already localhost-bound). |
| Mail/reset tokens | None live beyond expiry | No action. |

**Do not commit credentials. No keys were printed in this report or
terminal output.**

## T-004 — HTTP verification matrix (measured, not assumed)

| URL | Before | After |
| --- | --- | --- |
| `/Pawesome_Capstone/backend/.env` | **200** | **403** |
| `/Pawesome_Capstone/.env` | (would be 200) | 403 |
| `/Pawesome_Capstone/` | 200 (listing) | 403 |
| `/Pawesome_Capstone/backend/` | 200 (listing) | 403 |
| `/Pawesome_Capstone/backend/public/index.php` | executable | 403 |
| `/Pawesome_Capstone/backend/get_token.php` | executable | 403 |
| `/Pawesome_Capstone/backend/pawesome_database_readiness_audit.php` | executable | 403 |
| `/Pawesome_Capstone/.git/config` | readable | 403 |
| `/Pawesome_Capstone/backend/storage/logs/laravel.log` | readable | 403 |
| `/Pawesome_Capstone/backend/vendor/autoload.php` | readable | 403 |
| `/Pawesome_Capstone_backup_*/`, `pawesome_backups/`, `_pawesome_wip_backup/`, `Pawesome_Recovery/` | readable | 404 (moved) |
| `/xampp/` (control — other projects) | 200 | **200** (unaffected) |

**Residual risk:** other htdocs projects (EnrollmentWebSystem,
student-system, tapserve, dashboard) remain served — out of scope.
Apache still listens on all interfaces; if LAN access is unwanted,
binding `Listen 127.0.0.1:80` in `httpd.conf` is a one-line follow-up
(user decision — affects other projects' reachability).

## Phase 0 acceptance check

- [x] `.env` not downloadable — 403
- [x] `vendor/`, `storage/`, `bootstrap/`, `database/`, `tests/`, `.git/` not browsable — 403
- [x] Debug/mutation scripts not HTTP-executable — 403 + deleted/relocated
- [x] Credential exposure assessed; rotation documented, not performed
- [x] Laravel API unaffected (artisan serve ignores `.htaccess`)
- [x] Backups relocated with verified integrity
- [ ] Regression suite — see gate results below
