# Rate Limiting Security Audit — 2026-11-08

Status: **Local auth regression verified; deployment and all-sensitive-route coverage incomplete.**

## Reproduction and correction

`RouteServiceProvider` originally keyed the auth limit only by submitted identity plus IP. Bounded `AuthRateLimitTest` requests demonstrated that changing `login` bypassed an aggregate IP cap: expected 429, actual 422 from controller validation.

Auth now combines:
- Existing five requests/minute per submitted account + IP.
- Aggregate auth requests/minute per IP, using the existing `app.api_rate_limit_per_minute` setting.

No global cap was disabled or raised for testing. Tests lower the aggregate setting only within their isolated application, avoiding uncontrolled load.

Three tests passed after correction (27 assertions): repeated attempts return 429/Retry-After and recover after the window; identifier rotation cannot bypass the IP cap; a second IP retains access. The test cache is asserted to be array-backed before its reset.

## Proxy caveat

`bootstrap/app.php` originally configured trusted proxies but replaced the global stack with only Cors and SecurityHeaders, so TrustProxies never ran. The default Laravel stack is now restored with custom Cors and SecurityHeaders; a local regression verifies forwarded scheme/host/IP. Actual Railway edge topology and spoof resistance still require remote verification.

Phase 11 also demonstrated that a general `api` limiter keyed only by IP throttled legitimate multi-role sessions behind one address. The limiter now resolves a valid bearer/cookie token to its owner and falls back to IP for missing/invalid credentials. The Phase 11 rerun produced **zero 429s**; four cases/32 assertions passed for auth recovery, IP isolation and distinct token-owner buckets.

## Remaining

Check every sensitive operation's limiter, email/username normalization and alias behavior, distributed-IP/account abuse, shared-NAT fairness, API-key/provider spend controls, restart/cache persistence, upload/search/admin operations and production headers. Public health/settings/content/photo routes lack explicit throttles; assess their resource risk rather than labeling all public GETs critical automatically.
