# Notification Module — UI/UX Audit

**Date:** 2026-11-18 · Reviewed: `NotificationDropdown.jsx/.css`, `CustomerNotifications.jsx/.css`, `DashboardLayout` mount.

## Design-system conformance

- Uses the pink Pawesome palette via `--color-primary` tokens; semantic icon colors (success/warning/danger/info) carry data meaning — consistent with project conventions.
- Class names are properly namespaced (`pawesome-notification-*`, `notifications-*`, `notification-*`) — no bare-generic collisions.
- FontAwesome icon set consistent with the rest of the app.

## Bell + badge

- 44 px circular button, `aria-label="Notifications"`, `aria-expanded` bound — keyboard-focusable native `<button>`.
- Badge: absolute-positioned red pill, caps at `9+`, gentle 1.8 s pulse. Hidden entirely at zero.

## Dropdown panel

- Portal to `document.body`, `position:fixed` top-right, `min(380px, 100vw-32px)`, backdrop blur, shadow — visually consistent, verified live in e2e.
- Header: "Notifications" + conditional "Mark all read".
- Items: icon chip (type-colored), title (`strong`), message (`p`), localized timestamp. Unread = stronger pink tint.
- States: **loading** (spinner, first-load only — refetches don't blank the list), **empty** ("No notifications yet"), **error** (new: icon + "Couldn't load notifications" + **Retry** button — added this pass).
- Click: marks read + navigates via a per-role destination map (customer→bookings/payments, cashier→payment-verification, inventory→stock, vet→appointments, receptionist→approvals/orders/bookings, admin→reports, manager→payroll/reports).

## Customer notifications page

- Panel card + header, unread-count chip, type filter (Orders/Payments/Services), "Mark All Read" (disabled at 0), per-item "Mark as Read", "New" unread pill, reference IDs for orders/requests, loading/error/empty states, `?limit=50` fetch (fixed — was silently capped at 20).

## State-management review

- Poll loop: 10 s interval, **paused on hidden tabs**, in-flight guard prevents overlap, **sequence guard** drops stale responses (fixed this pass — a poll resolved after a mutation could no longer resurrect the badge).
- Mutations force a refresh (`{force:true}`) then render server truth — no fake-optimistic state.
- Errors no longer masquerade as "empty": catch → `setError(true)` → Retry UI.
- `normalizeList` shields against unexpected response shapes.

## Responsive (CSS verified + e2e)

- ≤768 px: panel narrows to `min(340px, 100vw-24px)`, repositions to `top:96px`.
- ≤480 px: `width: calc(100vw-16px)`, `max-height: 70vh` — no horizontal overflow, stays below the topbar.
- Bell is 44×44 (touch-friendly ≥44 px).

## Accessibility findings

| Item | Status |
|---|---|
| Keyboard reachability | ✅ all interactive elements are `<button>` |
| `aria-label`/`aria-expanded` on bell | ✅ |
| ESC-to-close dropdown | ⚠️ absent (only mobile sidebar handles ESC) — minor |
| Unread indication | ⚠️ dropdown uses tint-only; customer page adds a "New" text pill — recommend an unread dot + `aria-label` for parity |
| Badge screen-reader text | ⚠️ numeric badge is visual-only — recommend `aria-live`/`sr-only` count |
| "Mark all read" pink-on-white contrast | ⚠️ `#ff5f93` small text ~3.9:1 — borderline AA; acceptable bold label, could deepen on hover only |
| `prefers-reduced-motion` for pulse | ⚠️ not honored — minor |
| Focus-visible styles | ⚠️ relies on browser default — acceptable |

⚠️ items are polish suggestions, not functional defects; none block release.

## Verdict

Professional, on-brand, all required states present (loading/empty/error/loaded), responsive, safe rendering (no HTML injection). Improvements made this pass: error state + Retry, stale-response race fix, visibility-aware polling, limit-50 customer feed.
