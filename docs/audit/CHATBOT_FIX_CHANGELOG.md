# Chatbot Audit Fix Changelog

Date: 2026-11-18 · Each item: defect → root cause → fix → verification.

## C1 — AI provider disabled by config mismatch

- **Defect:** `CHATBOT_AI_PROVIDER` unset/mismatched so the configured Gemini
  key silently did nothing; `chatbot:test` also printed Groq-only instructions.
- **Fix:** `.env` → `CHATBOT_AI_PROVIDER=gemini`,
  `CHATBOT_AI_MODEL=gemini-3.1-flash-lite` (3.6-flash 503s on this key — probe
  evidence in architecture doc), `CHATBOT_AI_TIMEOUT=15`.
  `TestChatbot.php` now prints provider-aware fix steps.
- **Verify:** live message returns `source: "ai"` with grounded answer;
  503/failure paths fail soft to FAQ/rules (unit-tested).

## C2 — Stage-1 intent shadowing + stale facts + mojibake (11 eval failures)

- **Defects:** generic help/system intents in `detectSystemIntent()` fired
  before FAQ/rule paths — how-to questions got status dumps or staff-contact
  guardrails; `contactStaffResponse` used non-canonical contact text; several
  FAQ answers held literal `\n` and mojibake (broken emoji).
- **Fix:** `PremiumChatbotService` — reordered detection (specific intents
  before generic help), corrected contact/staff guidance to canonical
  `StoreFacts`, fixed medical/injection fallback wording, cleaned mojibake in
  user-facing strings; seeder text repaired and live FAQ rows reseeded.
- **Verify:** `chatbot:eval` 26→**37/37**; E2E S2–S5, S8, S9.

## C3 — FAQ category CRUD

- **Defect:** admin FAQ form/controller had no `category` support.
- **Fix:** `Admin\ChatbotFaqController` validates + persists `category`;
  admin UI gained a category select (`ChatbotLogs.jsx` FAQ form).
- **Verify:** `admin faq crud accepts and persists category` /
  `rejects invalid category` tests; E2E S10 creates a FAQ with category live.

## C4 — Seed data hygiene

- **Fix:** `ChatbotFaqSeeder` mojibake removed; reseeded live DB; stale
  Telegram FAQ deactivated (dormant integration). Cache cleared after reseed.

## C5 — FAQ cache invalidation

- **Defect:** CRUD invalidated only some role-key caches → stale answers.
- **Fix:** `invalidateFaqCache` now clears all role keys + the all-FAQ key.
- **Verify:** `faq create update delete clear cache` test; E2E S10 shows new
  FAQ answer live in the widget immediately.

## C6 — Admin `userHistory` scoping

- **Defect:** `Admin\ChatbotController::userHistory` read history unscoped.
- **Fix:** route-model bound `userHistory(User $user)` + 500-row bound.
- **Verify:** `user history is bounded to 500 rows` test.

## C7 — Vestigial endpoint

- **Removed:** `POST /customer/chatbot` route + `PortalController::chatbot`.
- **Verify:** live probe 404; `legacy customer chatbot endpoint is gone` test.

## C8 — Dead code removal (dependency-checked first)

| Removed | Sole/previous consumer check |
|---|---|
| `app/Services/Chatbot/ChatbotService.php` (1,064 lines) | Only `tests/manual/test_chatbot_debug.php` referenced it; reusable unique logic (live-context injector) already superseded by `ChatContextBuilder` |
| `tests/manual/test_chatbot_debug.php` | Manual script for deleted service |
| `app/Http/Controllers/TelegramBotController.php` | No registered route; no references |
| `transaction_lookup` widget wiring | No backend action ever emitted it; `/cashier/transactions/search` (cashier page) retained |

## C9 — Channel whitelist

- **Defect:** `POST /chatbot/message` accepted arbitrary `channel` strings.
- **Fix:** whitelist validation in `ChatbotController::message`.
- **Verify:** 422 live probe; `rejects/accepts whitelisted channel` tests.

## D1 — Chatbot transcript clobbered under StrictMode (E2E find)

- **Defect:** `RoleAwareChatbot` welcome fetch had no cancellation guard;
  React StrictMode's double-mount let a stale welcome response wipe
  in-flight user messages.
- **Fix:** `cancelled` cleanup flag in the bootstrap effect.
- **Verify:** E2E S7 (was consistently losing a user message) now stable;
  full suite 13/13.

## Non-changes (explicitly preserved)

- Cashier `/cashier/transactions/search` — serves the cashier page (kept).
- `TelegramService` + `telegram:test` command — diagnostics only, no route.
- UI/theme, Laravel/React/MySQL conventions, unrelated completed modules.

## Post-commit release-acceptance pass (re-verification at `2246acd`)

- **Data fix:** `chatbot_faqs` id 13 (inactive Telegram FAQ) contained a
  literal `\n` escape in its answer. Replaced with real newlines via a
  one-row UPDATE — the row stays `is_active = 0` (Telegram dormant).
  Binary-checked: 0 rows with mojibake or literal escapes remain.
- **Re-ran every baseline suite on the committed tree:** PHPUnit 89/89,
  `chatbot:eval` 37/37, Vitest 44/44, API base 9/9, Playwright 13/13
  (0 retries, 5.5m), API probes 14/14, `npm run build` PASS.
- **Live-chat smoke re-verified** with close-permission clarification:
  customers close via `DELETE /chatbot/live-chat/{id}` (200); the staff
  `PATCH …/close` route correctly 403s customers; post-close message 422.
- **Gemini live probe re-verified:** `source: "ai"`, ~4.2s, grounded reply.
- No code changes were required in this pass.
