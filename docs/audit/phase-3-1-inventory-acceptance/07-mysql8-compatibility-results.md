# MySQL 8 Compatibility Results

## Result

**UNVERIFIED — external acceptance blocker.**

- The active local server is MariaDB 10.4.32. Passing MariaDB results are not represented as MySQL 8 compatibility.
- `docker` is not installed/available in this environment (`docker: command not found`), so the repository's disposable MySQL 8 container could not be started.
- No MySQL 8 service was otherwise available for migration, locking, concurrency, decimal, or date/timestamp checks.

## Required follow-up

Run the focused migration, inventory, POS, idempotency, row-lock and source-return concurrency tests in CI or a separately provisioned disposable MySQL 8 database. Do not use or reconfigure the user's XAMPP database for this purpose.
