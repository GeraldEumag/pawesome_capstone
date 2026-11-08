# API Endpoint Audit — 2026-11-08

Status: **Inventory verified; resource-level assessment partial.**

`backend/route_audit_analyzer.php` now reads the effective Laravel route collection rather than stale JSON, resolves middleware aliases, handles controller action strings correctly, writes run-specific evidence and refuses to overwrite an existing output file.

Evidence: `../../browser-evidence/system-security-audit-20261108/routes-post-vet-tech.json`.

| Measure | Count |
| --- | ---: |
| API route definitions | 722 |
| With custom bearer authentication | 692 |
| Without that bearer middleware | 30 |
| Authenticated, without explicit role middleware | 38 |
| With explicit throttle middleware | 718 |
| Without explicit throttle middleware | 4 |

Counts are route definitions, not separate GET/HEAD test cases. A missing role middleware can be appropriate for self-service endpoints, and public/kiosk-PIN routes do not automatically represent auth bypasses.

The four routes without explicit throttle are health, public settings, public landing content and profile-photo views. Public/alternate-auth routes additionally include auth flows, kiosk operations, public inventory/availability/rooms and public chatbot routes. Full methods/actions/middleware are in the JSON, not reconstructed from a speculative endpoint list.

## Tested priorities

Auth/me/login, critical staff action authorization, customer pet/request isolation, POS server-side pricing, disabled checkout, booking/payment/inventory integrity and the controlled cross-role workflow have executable evidence in the backend/browser reports.

## Remaining endpoint work

Each identifier-bearing detail, nested resource, update, deletion, export and file route still needs explicit owner/role/verb mapping. Do not infer this from a middleware count. Public profile-photo privacy/rate policy needs review. Sensitive throttle coverage and proxy behavior require deployment-specific verification. Legacy Gate scripts contain obsolete paths and must not be executed blindly.
