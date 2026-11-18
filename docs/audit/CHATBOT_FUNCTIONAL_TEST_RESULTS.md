# Chatbot Functional Test Results

Date: 2026-11-18 · All commands run against the live audit stack
(backend :8000 via 10-worker pool — see E2E doc for why; frontend Vite :3000).

## 1. PHPUnit (backend) — `php artisan test --filter="Chatbot|LiveChat|Chat"`

**89 tests, 386 assertions — ALL PASS (63.8s)** on MySQL `pawesome_test`.

| File | Highlights verified |
|---|---|
| `ChatbotReliabilityTest` | Intent routing, fallbacks, context |
| `ChatbotConversationSimulationTest` | Multi-turn customer/cashier/receptionist conversations |
| `ChatbotHistoryTest` | Turn-pair history building |
| `ChatbotRemediationTest` (audit additions) | FAQ scope isolation, keyword tie-break, hotel blocking rules, staff-vs-customer payment intent, FAQ CRUD cache clears, `conversation_id` persisted, Gemini header-auth call, AI disabled/AI failure fail-soft, timeout config honored, contact facts, injection refusal, FAQ category persist/reject, bounded `userHistory`, legacy endpoint 404, channel whitelist |
| `AuditRegressionTest` | Tool role-recheck blocks staff tool for customer |
| `LiveChatTest` | Session start, auto-close previous, staff inbox visibility, customer inbox 403, closed-session message reject |
| `DashboardTest` / `FullSystemIntegrationTest` | Admin logs access, conversation context |

## 2. Evaluation harness — `php artisan chatbot:eval`

**37 passed, 0 failed of 37** (baseline was 26/37 — 11 defects fixed).

Coverage includes: FAQ facts (location/hours/contact/email/prices, EN +
Taglish), booking help vs. status intents, staff-contact routing, inventory
lookup, revenue/sales deflection for customers, cross-customer privacy,
veterinary safety (no medication/dosage), off-topic declines, prompt-injection
refusal, and "must not invent" cases (foreign phone number, Cebu branch).

## 3. Frontend unit — `npm run test:unit` (Vitest)

**9 files, 44 tests — ALL PASS** (14.8s). No chatbot-widget-specific unit tests
exist; widget behavior is covered by the Playwright suite instead.

## 4. Chatbot API base tests — `node --test tests/chatbot-api-base.test.mjs`

**9/9 PASS** (auth + public message contracts).

## 5. Production build — `npm run build`

**PASS** (~3.64 MB largest chunk; Vite code-splitting warnings are pre-existing
and unrelated to the chatbot module).

## 6. Live provider verification

| Probe | Result |
|---|---|
| `POST /api/chatbot/message` — off-topic question (Gemini eligible) | `source: "ai"` — grounded refusal naming Pawesome Retreat, ~9.7s end-to-end |
| `generateContent` on `gemini-3.1-flash-lite` | HTTP 200 |
| Provider failure path | `AiChatbotService` returns `null` → FAQ/rule fallback — covered by PHPUnit `ai failure falls back to canned response`, `disabled ai falls back without error`, and observed live when `gemini-3.6-flash` returned 503 |
| `chatbot:test` diagnostic | Now prints provider-aware fix instructions (was Groq-only) |

## 7. Live-chat API smoke (curl sequence)

1. Customer `POST /live-chat/start` → `waiting` ✅
2. Customer message persisted ✅
3. Receptionist `GET /inbox` → session visible ✅
4. `POST /{id}/claim` → `active`, assigned ✅
5. Staff `POST /{id}/reply` → persisted ✅
6. Customer poll sees system + customer + staff messages ✅
7. Second customer hits `/{id}/message` → **404 (IDOR guarded)** ✅
8. Staff `PATCH /{id}/close` → `closed` ✅
9. Customer message on closed session → **422** ✅
