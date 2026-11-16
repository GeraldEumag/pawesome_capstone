# Phase 1 — Public API Security Report (F-03, F-09)

Date: 2026-11-16 · Findings: F-03 (P2), F-09 (P3) · Approved decisions: auth-gate + blob for profile photos.

## T-010 — Public inventory field whitelist (F-03)

**Root cause:** `InventoryService::getPublicItems` selected
`inventory_items.*` and `DashboardController::showPublicItem` returned the
full Eloquent model on unauthenticated endpoints
(`routes/api.php:992-997`, `throttle:api` only — no `auth.api`), leaking
`cost`, `supplier`, `supplier_id`, `reorder_level`, audit timestamps and
internal snapshot fields.

**Changes:**

| File | Change |
| --- | --- |
| `app/Services/InventoryService.php` | New `PUBLIC_ITEM_FIELDS` whitelist (id, name, sku, category, description, brand, price, stock, status, is_sellable, photo). `getPublicItems` selects only those + the existing `nearest_expiration` subquery, and maps rows to the `sellable()`-consistent shape — `photo_url` (resolved via new `publicPhotoUrl()`, mirroring the model accessor) instead of raw `photo`. |
| `app/Http/Controllers/Inventory/DashboardController.php` | `showPublicItem` returns the same explicit whitelist instead of the full model; `in_stock`/`stock_status` preserved. |

`Admin\InventoryController::sellable` already whitelists (verified) —
public responses across all three endpoints are now consistent.

**Frontend impact: none.** `getPublicItems`/`showPublicItem` have zero
callers in `frontend/src` (verified by grep); POS uses the already-
whitelisted `searchProducts`/`sellable` endpoints. All fields consumed by
existing tests (`id`, `sku`, `stock`, `price`) remain present.

## T-012 — Profile-photo authorization (F-09)

**Root cause:** `GET /api/files/profile-photos/{userId}/view` sat in an
unauthenticated route group with a sequential-ID parameter → anonymous
enumeration of every user's photo.

**Backend:**

| File | Change |
| --- | --- |
| `routes/api.php` | Route moved into the `auth.api` + `throttle:api` group with the other secure file endpoints. |
| `app/Http/Controllers/Api/SecureFileController.php` | `viewProfilePhoto` now: (1) 401 when unauthenticated; (2) 403 for non-owner customers — owner OR any staff role only; (3) 404 for missing user/photo; (4) path confinement — DB value must be under `profile_photos/` with no `..` traversal; (5) `Cache-Control: private, max-age=3600` (was `public, max-age=86400`); existing MIME whitelist + `nosniff` preserved. |

Authorization runs **before** the user lookup, so a probing customer
gets 403 even for nonexistent IDs — no existence oracle.

**Frontend:** profile photos now resolve through authenticated blob
fetches — plain `<img src>` can no longer carry the bearer token.

| File | Change |
| --- | --- |
| `src/utils/avatar.js` | New `useAuthenticatedImage(url)` hook: passes `data:`/`blob:`/`http`/storage URLs through `resolveAvatarUrl`; detects `/api/files/*` URLs and fetches via existing `getAuthenticatedFileUrl` → `blob:` URL (revoked on cleanup); returns `null` while loading/on failure so callers fall back to initials avatars. |
| `src/components/shared/AuthImg.jsx` | New `<AuthImg>` wrapper for use inside `map()` loops where hooks can't be called. |
| `CustomerAvatar.jsx`, `DashboardProfile.jsx`, `ProfileSettings.jsx`, `ProfilePage.jsx`, `ReceptionistAppointmentList.jsx` | `resolveAvatarUrl` → `useAuthenticatedImage` for profile photos. Covers every dashboard topbar (Admin/Cashier/Inventory/Manager/Receptionist/Customer all pass `user.profile_photo` into `DashboardProfile`). |
| `ManagerStaff.jsx` (2 sites in `map()`) | `<img>` → `<AuthImg>` |

**Untouched (intentionally):** `UnifiedInventory`, `ServiceCatalogManager`,
`apiNormalize.js`, `storeInfo.js` — they resolve public-disk storage URLs
(`/storage/...`), which remain directly servable; the hook only
intercepts `/api/files/*` anyway.

## Tests

- `tests/Feature/PublicInventoryExposureTest.php` — **4 tests / 81 assertions**:
  internal keys absent from list + detail + sellable responses; public keys
  present; authenticated path still works.
- `tests/Feature/ProfilePhotoAccessTest.php` — **8 tests / 14 assertions**:
  unauth→401, owner→200, other customer→403, staff×4 roles→200,
  enumeration→403 (no existence oracle), staff→404 missing user/photo,
  traversal + wrong-directory poisoned paths→404.
- `npx vitest run` — **32/32**.
- `npm run build` — compiles clean (2369 modules; only pre-existing
  chunk-size warnings).

## Remaining risks / notes

- Avatar images now load asynchronously per component — a brief
  initials-fallback flash may appear where previously the `<img>` streamed
  directly. No functional breakage (fallbacks already existed).
- `useAuthenticatedImage` issues one authorized fetch per avatar instance;
  heavily duplicated avatars on one screen could fetch the same blob more
  than once. Acceptable at current page densities; a cache layer is an
  easy follow-up if profiling shows otherwise.
- Public-disk file URLs (`/storage/...` for inventory/service images) are
  still directly downloadable when the app is served — by design for
  storefront images; they contain no sensitive data.
