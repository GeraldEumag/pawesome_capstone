-- Runs once when the mysql container initializes an empty data volume.
-- `pawesome` is created via MYSQL_DATABASE; this adds the test database
-- used by `php artisan test` (phpunit.xml pins DB_DATABASE=pawesome_test).
CREATE DATABASE IF NOT EXISTS pawesome_test;
