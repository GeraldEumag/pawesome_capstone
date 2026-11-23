# Phase 3.2 — Report 02: MySQL 8 Compatibility and Database Test Report

**Status: BLOCKED (local execution) / CI configuration documented**

## Environment probe (executed)

| Check | Result |
|---|---|
| `docker` CLI | NOT FOUND |
| `podman` CLI | NOT FOUND |
| `mysql` CLI | NOT FOUND |
| Port 3306 listener | XAMPP MariaDB `10.4.32-MariaDB` (host `Pascua`) |
| `docker-compose.yml` | Defines `mysql:8.0` service (requires Docker — unavailable) |
| `.github/workflows/ci.yml` | Runs full backend suite against `mysql:8.0` service |
| Remote/approved MySQL 8 test service | None available or approved |

## Findings

- No safe isolated MySQL 8 runtime exists on this machine. Docker/Podman are absent; the only local database server is MariaDB 10.4.32 occupying port 3306. Installing or modifying global database services was not permitted without approval.
- `docker-compose.yml` and CI both target MySQL 8.0, proving *intent* of compatibility, but CI has not been executed for this branch during Phase 3.2 (GitHub CLI unavailable; no CI run was triggered or observed).
- All Phase 3.2 database evidence was produced on **MariaDB 10.4.32** and must not be cited as MySQL 8 proof.

## What was verified instead

- Clean `php artisan migrate --force` completed on empty disposable schemas `pawesome_phase3_2_browser_audit` and `pawesome_phase3_2_backend_audit`: **191 migrations, 98 tables**, zero errors on MariaDB 10.4.32.
- PDO identity verified per-process: `DATABASE()` = audit schema, `VERSION()` = `10.4.32-MariaDB`, host `Pascua`, port 3306.
- Laravel config, PDO, and `php artisan test` (phpunit.xml pins `DB_*`; explicit env pointed at `pawesome_phase3_2_backend_audit`) all resolved to the disposable schema — never `pawesome`.

## Reproducible MySQL 8 requirement (for CI or an approved host)

```bash
# CI already encodes this (.github/workflows/ci.yml):
#   services: mysql:8.0, DB_DATABASE=pawesome_test, php artisan test
# Local equivalent once Docker is available:
docker compose up -d          # mysql:8.0 on 127.0.0.1:3306 (stop XAMPP MySQL first)
cd backend
mysql -u root -e "CREATE DATABASE IF NOT EXISTS pawesome_test;"
DB_CONNECTION=mysql DB_DATABASE=pawesome_test DB_USERNAME=root DB_PASSWORD= php artisan test
```

## Result

**BLOCKED** — MySQL 8 compatibility is unverified locally. Acceptance criterion 1 cannot be satisfied in this environment. No claim of MySQL 8 compatibility is made.
