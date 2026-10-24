# Pawesome Chatbot — Structure, Workflow, Scope & Limitations

> Deep-dive reference for planning a chatbot overhaul.
> Covers the four chat surfaces, the backend pipeline, data model,
> runtime flow, capabilities, and known limitations.

---

## 1. Structure

### 1.1 Four chat surfaces, one (partial) backend

| Surface | Frontend | Backend entry | Audience |
|---|---|---|---|
| Landing bot | `frontend/src/components/LandingChatbot.jsx` | `ChatbotController::publicWelcome` / `publicMessage` | Guests (no auth) |
| Authenticated assistant | `frontend/src/components/chatbot/RoleAwareChatbot.jsx` (~1,480 lines) | `ChatbotController::welcome` / `message` | All 7 roles |
| Live chat (human) | Inside `RoleAwareChatbot` + staff pages | `LiveChatController` | Customer ↔ receptionist/admin |
| Telegram bot | Telegram app | `TelegramBotController` | Linked users |

### 1.2 Backend layer map

```
POST /api/chatbot/message          POST /api/chatbot/public/message
        |                                   |
        v                                   v
ChatbotController --> PremiumChatbotService   hardcoded keyword rules
        |              (the orchestrator)     in the controller
        |                    |
        |---> RoleScopeService        (role config, normalization)
        |---> KnowledgeBaseService    (FAQ matching, AI history)
        |---> AiChatbotService        (Groq / Gemini provider)
        |---> ChatbotFaq (DB)         (role-scoped Q&A)
        '---> ChatbotLog (DB)         (every turn logged)
```

### 1.3 Key files

**Services** (`backend/app/Services/Chatbot/`)

| File | Role |
|---|---|
| `PremiumChatbotService.php` (~1,730 lines) | The live orchestrator. Used by `ChatbotController` and `TelegramBotController`. Two-stage intent detection + hybrid FAQ/AI/rule routing. |
| `ChatbotService.php` (~970 lines) | **Legacy orchestrator — dead in production paths.** Only used by console commands (`chatbot:test`, `TestTelegramBot`) and manual scripts. Contains the best live-context injector (`gatherLiveContext`), which Premium lost. |
| `AiChatbotService.php` | LLM abstraction. Groq (default, OpenAI-compatible, multi-key pool + last-good-key cache) and Gemini (legacy). Fail-soft — returns `null` on any error. |
| `KnowledgeBaseService.php` | FAQ retrieval (`findAnswer`) + `historyFor()` (last N logged turns fed to the AI) + Taglish synonym expansion. |
| `RoleScopeService.php` | Role normalization (`vet` → `veterinary`, `super_admin` → `admin`) and per-role welcome/scope/suggestion config. |

**Controllers**

| File | Purpose |
|---|---|
| `ChatbotController.php` | `/chatbot/welcome`, `/chatbot/message`, `/chatbot/public/welcome`, `/chatbot/public/message` |
| `ChatbotWorkflowController.php` | Transactional endpoints: `booking-options`, `bookings`, `appointments/lookup`, `inventory/search`, `hotel-options`, `hotel/availability`, `hotel-bookings` |
| `LiveChatController.php` | Human chat session lifecycle (waiting → active → closed), atomic claim, `after_id` polling |
| `Admin/ChatbotController.php` | Log aggregation: `logs`, `logs/stats`, `logs/user/{user}` |
| `Admin/ChatbotFaqController.php` | FAQ CRUD + cache invalidation |
| `TelegramBotController.php` | Webhook, bot commands, inline keyboards; delegates free text to `PremiumChatbotService` |
| `Customer/PortalController.php::chatbot` | `POST /customer/chatbot` — logs a message, returns the log row. **Vestigial.** |

**Config**

| File | Contents |
|---|---|
| `config/chatbot.php` | `ai_enabled`, `ai_provider` (groq\|gemini), key pools, models, timeout, `rule_based_intents`, `ai_eligible_intents`, `hybrid_mode` (`faq_first` default), ~30 Taglish `synonyms`, `memory_turns` (4) |
| `config/store.php` | Business ground truth: name, assistant name, address, phone, email, socials, check-in window, cancellation policy, payment methods, vaccination policy |

**Other**

- `database/seeders/ChatbotFaqSeeder.php` — 18 seeded FAQs (general / pet hotel / services / customer / receptionist / admin scopes)
- `app/Console/Commands/EvaluateChatbot.php` — `chatbot:eval`, 11 fixture cases (incl. Taglish + off-topic refusal)
- Tests: `ChatbotGroqTest`, `ChatbotReliabilityTest`, `ChatbotRemediationTest`, `ChatbotConversationSimulationTest`

### 1.4 Data model

- **`chatbot_logs`** — every turn: `user_id, role, channel, type, intent, scope, message, response, user_message, bot_response, metadata(json)`. Note the duplicated column pairs (`message`/`user_message`, `response`/`bot_response`) — a migration artifact.
- **`chatbot_faqs`** — `question, answer, keywords[], category, scope (general|all|<role>), is_active, sort_order`.
- **`live_chat_sessions` / `live_chat_messages`** — human chat; status `waiting → active → closed`.

### 1.5 Frontend structure

`RoleAwareChatbot.jsx` is **three modes in one component**:

1. **Bot mode** (default) — free text → `POST /chatbot/message`
2. **`convFlow`** — customer-only conversational booking state machine (`select_pet → select_service/select_checkin → select_date/select_room → add_notes → confirm`), rendered as chips inline in the chat
3. **`liveChatMode`** — customer-only human chat, polling `GET /chatbot/live-chat/{id}/messages` every 3s

Plus a fourth **legacy modal workflow** layer (`workflow` state → `<Modal>` forms): `create_booking`, `appointment_lookup`, `inventory_search`, `hotel_booking`, `transaction_lookup` — triggered by backend `actions` with `type: "workflow"`.

**Mount points:** `DashboardLayout.jsx` (global widget for all dashboards) and `ReceptionistChatbot.jsx` (`mode="embedded"`).

**Persistence:**

| Store | Key | Contents |
|---|---|---|
| `localStorage` | `pawesome_chat_{role}` | Last 50 messages — **per role, not per user** |
| `localStorage` | `pawesome_chat_ctx_{role}` | `conversation_id`, `lastIntent`, `lastEntityType`, `lastRequestId`, `lastPaymentStatus` |
| `sessionStorage` | `pawesome_live_chat` | Live chat session id/status |
| `sessionStorage` | `pawesome_landing_msgs` | Landing bot messages |

**Services:** `chatbotService.js` (bot + workflow API client, in-memory TTL cache for booking/hotel options), `liveChatService.js` (live chat client).

**Admin UI:** `components/admin/ChatbotLogs.jsx` — two tabs: Logs (per-user aggregation, stats, per-user history, 60s silent refresh) and FAQs (full CRUD).

---

## 2. Workflow

### 2.1 Authenticated message (`POST /api/chatbot/message`)

1. `ChatbotController::message` validates (`message` ≤ 2000 chars) → `PremiumChatbotService::respond()`.
2. **Stage 1 — `detectSystemIntent()`**: role-aware regexes. Customer-only payment intents are evaluated first (comment `P1-6` documents a past shadowing bug). Detects:
   `payment_history`, `upload_payment_help`, `check_payment_status`, `pending_payments`, `help`, `low_stock_check`, `inventory_stock_check`, `today_appointments`, `pending_approvals`, `check_booking_status` / `check_request_status`, `receipt_help`, `role_workflow_explanation`, `contact_staff`, `system_summary`, `greeting`.
3. System intent hit → `systemAssistantResponse()` → **live DB queries** with per-role guardrails:
   - `paymentHistoryResponse` / `paymentStatusResponse` / `uploadPaymentHelpResponse` — customer only
   - `pendingApprovalsResponse` — receptionist/manager/admin
   - `pendingPaymentsResponse` — cashier/manager/admin
   - `lowStockResponse` — inventory/manager/admin
   - `todayAppointmentsResponse` — staff only; vets scoped to own queue
   - `systemSummaryResponse` — manager/admin
   - `inventoryStockResponse` — all roles
4. No system intent → **Stage 2 — `detectIntentAdvanced()`**: ~15 sequential regex checks → `greeting, farewell, gratitude, emergency, operating_hours, location, contact, inventory, pricing, hotel_booking, booking_help, services, summary, navigation, support, feedback, complaint` → `general`.
5. **Hybrid routing** (`chatbot.hybrid_mode`, default `faq_first`):
   - `enhancedFaqResponse()` — all active FAQs (10-min cache), filtered by role scope; scores keyword hits (multi-word containment / single-word boundary) + question-word overlap; needs ratio ≥ 0.5 **and** confidence > 0.8 to win.
   - AI-eligible intents (`general, faq, help, advice, unknown, greeting, goodbye` + aliases `farewell→goodbye`, `support→help`) → `AiChatbotService::generateResponse()` with the last `memory_turns` (4) `chatbot_logs` turns as history.
   - `ai_first` mode: AI before FAQ, FAQ as fallback on AI failure. `smart` mode: FAQ only on a full (1.0) match.
   - Otherwise → rule-based `match($intent)` — some handlers run live queries (`premiumHotelResponse`, `premiumSummaryResponse`, `premiumInventoryResponse`, `premiumServicesResponse`); the rest are static text.
   - Final fallback → `defaultResponse` clarification card with store contacts.
6. `formatResponse()` → `{reply, intent, role, suggestions, actions, rich_content, source, confidence, metadata}`.
7. `storeContext()` → `ChatbotLog::create()` (fail-silent).

### 2.2 The AI call (when reached)

`AiChatbotService::generateResponse` builds the system prompt:

```
base identity (Pawsitive, Pawesome Retreat Inc.)
+ role-specific paragraph (customer/receptionist/veterinary/manager/admin)
+ STORE PROFILE from config/store.php
+ live services prices + hotel_rooms rates (fail-soft)
+ optional injected context block (hotel/boarders/appointments/financial)
+ SCOPE rules: store-only answers, no invented facts, no medical diagnosis
+ GUIDELINES: concise, warm tone, Philippine Peso
```

- Groq receives real multi-turn `messages[]` (history truncated to 1000 chars/turn); Gemini concatenates history as text.
- Key pool fails over across `CHATBOT_GROQ_API_KEYS`; last working key index cached 1h.
- **Critical detail:** `PremiumChatbotService` passes `[]` as the context argument — the rich `gatherLiveContext()` injector exists only in the dead `ChatbotService`.

### 2.3 Frontend reply handling

`sendChatbotMessage` → waits a **forced minimum 5 seconds** (`minWait = 5000 - elapsed`, artificial typing delay) → `normalizeCustomerBotReply()` regex-rewrites any customer-facing reply claiming "confirmed / approved / successfully booked" into "pending receptionist approval" → stores `rich_content.last_*` into `sessionContext` → renders bubble + suggestion chips + action buttons → persists to localStorage.

### 2.4 Booking flows

**Appointment (customer, conversational):**
pet → service → datetime → notes → `POST /chatbot/workflow/bookings` → `Appointment` with `status: 'requested'`, `booking_channel: 'online'`; slot-checked via `BookingAvailabilityService` inside a transaction; `verified` middleware.

**Hotel (customer conversational / staff modal):**
pet → same-day date → room (or auto-assign cheapest free) → `POST /chatbot/workflow/hotel-bookings` → `Boarding` with `status: 'confirmed'`, `payment_status: 'unpaid'`. **`check_out` is hard-forced to `check_in`** — chatbot can only book same-day stays. Roles: customer, receptionist, admin.

Holiday blocking via `Holiday::blockedNameOn` on both endpoints.

### 2.5 Live chat

Customer clicks "Talk to Staff" → `POST /chatbot/live-chat/start` (closes prior open sessions) → `waiting` → staff inbox (`GET /inbox`, receptionist+admin only) → atomic claim (`UPDATE ... WHERE assigned_to IS NULL`) → `active` → both sides poll every 3s with `after_id` cursors → either side closes.

### 2.6 Admin tools

`ChatbotLogs.jsx`:
- **Logs tab** — per-user aggregation (`/admin/chatbot/logs`), stats (`/stats`: totals, unique users, top intents, channels), per-user history (`/user/{user}`), 60s silent refresh.
- **FAQs tab** — full CRUD with scope/category/keywords; every mutation invalidates `chatbot_faqs_all` + per-role caches.

### 2.7 Telegram

Webhook (secret-token verified via `X-Telegram-Bot-Api-Secret-Token`) → command routing (`/start /help /book /rooms /appointments /pets /link /status`) or free text → `PremiumChatbotService::respond(user, text, 'telegram')` → `sendMessage` with inline keyboards or reply-keyboard suggestions.

---

## 3. Scope

### 3.1 Capabilities

- Store FAQs from DB — role-scoped (`general|all|<role>`), Taglish-aware via synonym expansion
- Live-data answers per role:
  - Customer: request status, payment status/history, proof-upload guidance
  - Receptionist/manager/admin: pending approvals
  - Cashier/manager/admin: pending payment proofs
  - Inventory/manager/admin: low stock
  - Staff roles: today's appointment queue (vets scoped to own)
  - Manager/admin: system summary (sales, pending, low stock)
  - All roles: inventory item search
- Create appointment requests + same-day hotel bookings (customers; staff can hotel-book any pet)
- Role-aware navigation links / action buttons
- LLM chit-chat scoped to the store (when `CHATBOT_AI_ENABLED` + keys configured)
- Human escalation via live chat (customer ↔ receptionist/admin)
- Telegram channel for linked users
- Public landing Q&A (rules only — no AI, no account data)

### 3.2 Hard boundaries (by design)

- The bot never performs staff mutations — no approvals, payment verification, check-ins, or stock changes (stated explicitly in `contactStaffResponse`)
- Public chatbot: no auth, no personal data, no AI
- Medical advice refused at prompt level
- Off-topic questions declined per system prompt

---

## 4. Limitations (overhaul-relevant)

### 4.1 Architectural debt

- **Two parallel orchestrators.** `ChatbotService` is dead code in production but contains the best piece — `gatherLiveContext()` (live boarders, occupancy, today's queue, revenue injected into the AI prompt). `PremiumChatbotService` lost it; the AI receives `[]` context.
- **Two intent detectors** (`detectSystemIntent` + `detectIntentAdvanced`) run sequentially and can disagree. Ordering bugs documented in-code (`P1-6`). "status" anywhere → request-status dump; "help" is swallowed by stage 1 and never reaches FAQ/AI.
- **Two FAQ matchers** with different scoring (`KnowledgeBaseService::findAnswer` weight-sum — effectively unused vs `enhancedFaqResponse` ratio — the live one).
- **Three sources of truth for store facts** — and they disagree:
  - `config/store.php` (real: `270020371`, `pawesomeretreat24@gmail.com`, Las Piñas address)
  - `ChatbotFaqSeeder` answers (mostly correct, some stale claims)
  - Hardcoded strings: `publicMessage()` has **placeholder data** (`(555) 123-4567`, `info@pawsitive.com`, `123 Pet Care Lane`); `emergencyResponse` / `locationResponse` / `contactResponse` / `premiumPricingResponse` hardcode `+63 (02) 8123-4567`, `123 Pet Care Ave, Makati`, `hello@pawesome.ph`, `feedback@pawesome.ph`, `complaints@pawesome.ph` — none in `store.php`
- **Inconsistent booking semantics.** Chatbot appointments → `status: 'requested'` (needs approval); chatbot hotel bookings → `status: 'confirmed'` instantly — while the frontend tells the customer the hotel booking is "waiting for receptionist approval." Hotel bookings via chatbot also **skip the vaccination-card upload** the FAQ says is required, and staff bookings derive the customer implicitly from the pet while recording `booking_channel: 'online'`.
- **Manual service instantiation** — controllers do `new PremiumChatbotService(...)` instead of constructor DI.
- **`PortalController::chatbot`** (`POST /customer/chatbot`) — logs a message and returns the row; no reply. Vestigial.
- **Per-request dead state** — `$conversationContext` in the service is in-memory and dies with the request.

### 4.2 Conversational quality

- **Pure regex/substring intent detection** — brittle, English-dominant; Tagalog patched only through FAQ synonyms and a few system-intent keywords. No entity extraction ("book Max for a dental tomorrow" can't extract pet/service/date).
- **AI has no tools.** The LLM can only talk — it cannot trigger bookings, lookups, or data queries. All live-data answers come from hand-written rules.
- **No real conversation entity.** Memory = last 4 `chatbot_logs` rows for the user, mixing web + Telegram turns and including formatted rule-based dumps as "assistant" history. `conversation_id` from the frontend is written to log metadata but never used to scope memory.
- **Suggestion chips are dumb re-sends** — clicking "paid na ba ako" resubmits text through the same fragile regexes.
- **Markdown is rendered raw.** Backend sends `**bold**`, `•`, `1️⃣` etc.; the widget only splits on `\n` — users literally see `**` characters.
- **Forced 5s typing delay** (`minWait = 5000 - elapsed`) makes every reply artificially slow, including instant FAQ hits.
- **`normalizeCustomerBotReply` string surgery** — regex rewriting of bot claims ("confirmed" → "pending approval") is a correctness band-aid indicating the backend can state false workflow facts.

### 4.3 Security / privacy / data

- **Chat history cached per-role, not per-user**, in `localStorage` — two different users on the same browser + role see each other's transcripts; cache survives logout.
- Transcripts (including live-chat and booking details) persist unencrypted in `localStorage` / `sessionStorage`.
- **`/chatbot/workflow/inventory/search` is open to every authenticated role** — customers receive SKU, `reorder_level`, `expiry_date`, internal `status` fields.
- **Staff `appointment_lookup`** lets cashier/manager/vet enumerate all customers' appointments (intentional for reception; broad for others — only `inventory` is excluded).
- `chatbot_logs` stores full message text — no retention/pruning policy.
- No per-user cost/rate cap on AI calls beyond `throttle:api`; public endpoint is 60/min.

### 4.4 Channels & features

- **Live chat is 3s polling** — no websockets, no typing indicator, no attachments, no transfer, no transcript export; staff inbox limited to receptionist+admin; `getMessages` marks-read as a side effect of a GET.
- **Telegram onboarding is effectively broken** — `findOrCreateUser` returns null unless `telegram_chat_id` is already set; `/link` says "token (coming soon)" — unlinked users can never authenticate through the bot.
- **Same-day boarding only** — `check_out` forced to `check_in` in both controller and widget; overnight stays impossible through the bot.
- `transaction_lookup` workflow exists in the frontend modal map but is never emitted by backend actions — dead UI path.
- Welcome endpoint caches per role for 5 min (minor staleness).
- FAQ cache invalidation is manual and keyed to a hardcoded role list in `ChatbotFaqController`.

### 4.5 Observability

- Admin stats are basic counts (total, unique users, top intents, channels). No containment rate, no unanswered-question mining, no confidence analytics, no per-source (FAQ vs AI vs rule) breakdown — though `source`/`confidence` are stored in log metadata.
- Eval harness exists (`chatbot:eval`, 11 fixtures) but the legacy `ChatbotService` divergence means some tests exercise code that never runs in production.

---

## 5. Overhaul implications (quick read)

**Keep / reuse:**

- `AiChatbotService` — provider dispatch, key-pool failover, fail-soft design is solid
- `chatbot_faqs` table + `Admin\ChatbotFaqController` CRUD + FAQ admin UI
- `chatbot_logs` (deduplicate columns) — already captures `source`/`confidence`/`intent`
- `ChatbotWorkflowController` endpoints — transactions, availability checks, holiday blocking
- `config/store.php` — promote to the *only* source of business facts

**Replace / redesign:**

- Merge `ChatbotService` + `PremiumChatbotService` into one pipeline; port `gatherLiveContext` into the live path (or make it tool-calling)
- Unify the two intent detectors + two FAQ matchers into a single router with entity extraction
- Real `conversations` table (session-scoped memory, per-user persistence) replacing log-scraping + localStorage
- Fix cache keying: per-user, clear on logout; drop the 5s fake delay; render markdown properly
- Single source of truth for store facts — kill hardcoded contacts in controllers/services/seeder
- Fix booking semantics: consistent pending status, vaccination-card gate, staff walk-in channel
- Close data leaks: scope inventory search / appointment lookup fields per role; per-user AI rate limits
- Live chat: websockets or SSE instead of 3s polling; widen staff roles if desired
- Telegram: implement real account linking (`/link` token flow)
- Suggestions/actions: first-class structured response schema instead of text re-sends

---

## Appendix A — Post-Overhaul State (implemented)

Sprint items M1–S5 landed. What changed since this document was written:

**New files**
- `app/Support/StoreFacts.php` — single source of truth for business facts (wraps `config/store.php` + `StoreHours`).
- `app/Services/Chatbot/QueryNormalizer.php` — shared normalize/expand/topics (Taglish canonical terms) used by intent detection and FAQ matching.
- `app/Services/Chatbot/ChatContextBuilder.php` — role-scoped live context injected into the AI prompt (replaces the empty `[]`).
- `app/Services/Chatbot/ChatbotAnswerValidator.php` — rejects AI replies containing phones/emails/URLs/prices absent from StoreFacts/context.
- `app/Services/Chatbot/Tools/ChatbotTools.php` — read-only Groq function-calling tools (my_requests, my_payments, services_prices, check_availability, search_inventory, today_queue, start_booking_flow → `prefill_booking` action).
- `app/Console/Commands/PruneChatbotLogs.php` — `chatbot:prune-logs`, scheduled daily, 90-day retention.
- `tests/Feature/ChatbotFactsGuardTest.php` — fails the build on placeholder facts in `app/` + seeder.

**Behavior changes**
- All fake contacts/addresses purged; emergency/location/contact/feedback/complaint/pricing replies come from `StoreFacts`.
- `detectSystemIntent` reordered: `help` is now the catch-all (last), `status` requires an entity word to hit the request-status dump.
- Chat history is stored per **user+role** (`pawesome_chat_{user}_{role}`), foreign keys swept on mount and all `pawesome_*` chat keys cleared on logout.
- Inventory search fields are role-scoped; `appointments/lookup` is `customer,receptionist,manager,admin` only.
- `chatbot` (20/min, 200/day per user) and `chatbot-public` (10/min, 100/day per IP) rate limiters; widget shows a friendly bubble on 429.
- Hotel bookings via chatbot create `status: 'pending'` + `BookingChannel::forUser()` (matches `BoardingController`), with a vaccination-card reminder.
- Widget: 5s artificial delay removed (500ms anti-flicker), `react-markdown` rendering, Retry button on errors.
- Public bot: FAQ knowledge base → flag-gated AI (`CHATBOT_PUBLIC_AI_ENABLED`, off by default) → StoreFacts rules; structured `actions` chips; emergency checked before services (vet-shadowing fix).
- Flags: `CHATBOT_CONTEXT_ENABLED`, `CHATBOT_TOOLS_ENABLED`, `CHATBOT_PUBLIC_AI_ENABLED`, `CHATBOT_LOG_RETENTION_DAYS`.
- `chatbot_logs.metadata` now carries `source`, `tools[]`, `validator_rejected`; admin stats add `by_source` + `unanswered`.
- `chatbot:eval` expanded to ~38 fixtures incl. Taglish, ordering, guardrails, injection, hallucination bait, with `forbid` lists.
- Legacy `ChatbotService` swapped for `PremiumChatbotService` in `chatbot:test`/`TestTelegramBot` (identical constructor).

**Remaining Phase-2 backlog (unchanged):** conversations table, retiring `ChatbotService`/`PortalController::chatbot`, column dedup, live-chat realtime, Telegram `/link` flow, overnight boarding through chat, analytics dashboards, transcript encryption.
