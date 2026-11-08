# Performance Audit — 2026-11-08

Status: **Development baseline only; no load/soak/SLO certification.**

## Measured, bounded samples

Five sequential authenticated GETs per endpoint against the local :8001 API, while other verification was active. The seeded audit inventory contained roughly 837 initial products plus synthetic race fixtures. Every sample returned 200. These are end-to-end client timings, not database-query profiles or production percentiles.

| Endpoint | Min ms | Median ms | Max ms | Response body bytes |
| --- | ---: | ---: | ---: | ---: |
| /inventory/items | 672.30 | 896.27 | 1152.57 | 515282 |
| /manager/dashboard | 653.72 | 672.88 | 732.03 | 1236 |
| /customer/dashboard | 585.14 | 829.37 | 2422.07 | 3183 |

Small samples and Windows PHP development-server/CPU contention make production extrapolation invalid. No concurrent-user threshold, p95/p99 or capacity claim follows.

## Frontend build

Production build succeeds. Main index bundle is approximately 3641.51 kB minified / 1068.87 kB gzip after the vet-tech UI change. Vite warns about >500 kB chunks and modules imported both statically and dynamically (ProfileSettings, UnifiedInventory, InventoryReports, InventoryHistory_Polished). Warnings were retained, not silenced by raising a limit.

## Contention correctness

Two independent API server processes, a bounded row-lock barrier and concurrent same-key POS requests reproduced then verified the fix for duplicate sales. This is one correctness race, not a stress/throughput test. Keyed operations now serialize per authenticated user, a deliberate coarse correctness lock whose latency under multiple terminals sharing one account needs measurement.

## Next measurements

Profile query count/N+1 and response pagination before optimization; use production-like retained volumes, explicit SLOs, multiworker staging, distributed cache/queue and bounded user mixes. Measure report/export memory, cold navigation, mobile UX, worker backlog and booking/last-stock/payment contention. Do not perform unapproved load against remote services.
