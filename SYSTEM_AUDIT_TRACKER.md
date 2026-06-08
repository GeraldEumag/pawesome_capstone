# Pawesome System Audit Tracker

## Phase

Phase 1 — Stabilization and Audit

## Date

June 9, 2026

## Tester

Cascade AI Assistant

## Branch

main

## Backend URL

http://127.0.0.1:8000

## Frontend URL

http://localhost:3001 (Note: Port 3000 was in use, Vite auto-switched to 3001)

## Setup Status

* Backend: ✅ PASS - Composer install successful, migrations up to date, DemoDataSeeder ran successfully
* Frontend: ✅ PASS - npm install successful, build successful, dev server running on port 3001
* Database: ✅ PASS - All migrations ran, demo data seeded
* Migrations: ✅ PASS - 61 migrations ran successfully
* Seeders: ✅ PASS - DemoDataSeeder executed (note: boarding reservations skipped due to no available hotel rooms)
* Build: ✅ PASS - Frontend build completed with warnings about chunk sizes
* Login: ✅ PASS - API authentication tested for all roles

## Issue Tracker

| No. | Module | Page/Route | Role | Issue | Error Type | Severity | File/API Route | Status | Notes |
| --- | ------ | ---------- | ---- | ----- | ---------- | -------- | -------------- | ------ | ----- |
| 1 | Database | boarding_rooms | All | No hotel rooms available | Data issue | Medium | boarding_rooms table | Open | DemoDataSeeder skipped boarding reservations due to empty rooms |
| 2 | Frontend | Build | All | 3 high severity npm vulnerabilities | Security | Medium | package.json | Open | Run `npm audit fix` |
| 3 | Frontend | Build | All | Chunk size > 500KB warnings | Performance | Low | Multiple files | Open | Consider code-splitting for production |
| 4 | Frontend | API URLs | All | 51 files with hardcoded http://127.0.0.1:8000 | Code quality | Low | Multiple files | Open | Review and centralize via environment variables |
| 5 | Database | MySQL | All | performance_schema.session_status missing | Configuration | Low | MySQL config | Open | Non-critical, affects db:show command only |
| 6 | Frontend | Dev server | All | Port 3000 conflict, auto-switched to 3001 | Configuration | Low | vite.config.js | Open | Document port conflict for users |
