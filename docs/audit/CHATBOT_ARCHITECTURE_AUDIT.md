# Chatbot & Live-Chat Architecture Audit

Date: 2026-11-18 · Scope: `/api/chatbot/*` + `/api/chatbot/live-chat/*` + React widgets
Status: **VERIFIED** against live code, `php artisan route:list`, and runtime probes.

## 1. Component map

| Layer | File | Role |
|---|---|---|
| API entry | `app/Http/Controllers/ChatbotController.php` | `welcome`, `message`, `logs` (per-user history). Channel whitelist enforced on `message`. |
| Workflows | `app/Http/Controllers/ChatbotWorkflowController.php` | `options`, `book-appointment`, `appointments`, `inventory/search`, `hotel/availability`, `hotel/book` — role-gated. |
| Live chat | `app/Http/Controllers/LiveChatController.php` | Customer session start/message/poll/close; staff inbox/claim/reply/close. |
| Admin | `Admin/ChatbotController.php` | Logs list, per-user `userHistory(User $user)` — route-model bound. |
| Admin FAQs | `Admin/ChatbotFaqController.php` | FAQ CRUD incl. `category` field + role-key cache invalidation. |
| Orchestrator | `app/Services/Chatbot/PremiumChatbotService.php` | Two-stage intent detection → system intents / FAQ / rule handlers / AI-eligible intents. |
| AI provider | `app/Services/Chatbot/AiChatbotService.php` | Gemini (`x-goog-api-key` header) + Groq. Fail-soft `null`. `CHATBOT_AI_TIMEOUT=15` honored. |
| Support | `ChatContextBuilder`, `ChatbotAnswerValidator`, `RoleScopeService`, `KnowledgeBaseService`, `QueryNormalizer`, `StoreFacts`, `StoreHours` | Context injection, AI-answer validation (unsafe answers rejected → FAQ/rule fallback), role scoping, canonical store facts. |
| Frontend (auth) | `frontend/src/components/chatbot/RoleAwareChatbot.jsx` | Widget + embedded mode; role-aware quick actions; conv booking flows; live-chat mode; localStorage transcript per `userId_role`. |
| Frontend (guest) | `frontend/src/components/LandingChatbot.jsx` | Public FAQ widget on the landing page (`/api/chatbot/public/*`). |
| Staff inbox | `frontend/src/components/live-chat/LiveChatInbox.jsx` | Session list (`lci-session-{status}`), claim, reply, close; 5s inbox poll, 3s message poll. |

## 2. Request flows

### 2.1 Authenticated chat (`POST /api/chatbot/message`)
```
ApiTokenAuth → role scope → throttle:chatbot (20/min) → per-user daily cap
→ PremiumChatbotService::respond($user, $message, $channel)
    → QueryNormalizer (Taglish synonyms)
    → detectSystemIntent (booking/status/help/injection/…)  [stage 1]
    → FAQ lookup (scope + keyword ×2 weighting)             [stage 2]
    → rule handlers (my requests, payments, pets, services…) [stage 3]
    → AI-eligible intents → AiChatbotService → ChatbotAnswerValidator
        → valid → reply (source=ai) / invalid or null → controlled fallback
→ persist ChatbotLog (+ conversation_id in metadata) → reply + suggestions/actions
```

### 2.2 Public guest chat (`POST /api/chatbot/public/message`)
Guest-safe FAQ/rules only — no personal-data intents, no tool calls. Verified E2E (S1)
and by API probe (200 without token).

### 2.3 Live-chat handoff
```
Customer: POST /live-chat/start (closes prior open session) → status=waiting
         → POST /{id}/message, GET /{id}/messages?after_id, DELETE /{id} (close)
Staff:    GET /live-chat/inbox (staff roles only) → POST /{id}/claim (atomic)
         → POST /{id}/reply → PATCH /{id}/close
```
Ownership enforced: customer session access 404s for other users (IDOR check
passed live); staff claim is atomic; closed sessions reject messages (422).

## 3. Persistence

| Table | Columns | Evidence |
|---|---|---|
| `chatbot_faqs` | id, question, answer, category, keywords, scope, is_active, sort_order, timestamps | 21 active / 1 inactive (stale Telegram FAQ deactivated) |
| `live_chat_sessions` | id, customer_id, customer_name, customer_email, status, assigned_to, last_message_at, closed_at, timestamps | start→claim→reply→close verified live + E2E |
| `live_chat_messages` | id, session_id, sender_type (system/customer/staff), sender_id, sender_name, message, is_read_by_staff, is_read_by_customer, timestamps | system + customer + staff messages persisted |
| `chatbot_logs` | per-turn log incl. `conversation_id` in metadata | 265 rows at audit time |

## 4. Dead code removed (evidence-checked before deletion)

| Removed | Evidence |
|---|---|
| `POST /customer/chatbot` (`PortalController::chatbot`) | Logs-only vestigial endpoint; 404 verified live |
| `app/Services/Chatbot/ChatbotService.php` (1,064 lines) | Sole consumer was `tests/manual/test_chatbot_debug.php`; all production paths use `PremiumChatbotService` |
| `tests/manual/test_chatbot_debug.php` | Manual script for the deleted service |
| `app/Http/Controllers/TelegramBotController.php` | Zero registered routes, zero references |
| `transaction_lookup` widget wiring | No backend workflow ever emitted it; cashier `/cashier/transactions/search` page endpoint retained (serves cashier module) |

## 5. Dormant integration

**Telegram is out of scope and documented as dormant/unimplemented.** The
controller is removed; `telegram:test` console command and `TelegramService`
remain as diagnostics only — no route exposes them. `TELEGRAM_BOT_TOKEN` in
`.env` is a placeholder.

## 6. AI provider configuration (audit env)

| Key | Value |
|---|---|
| `CHATBOT_AI_ENABLED` | `true` |
| `CHATBOT_AI_PROVIDER` | `gemini` |
| `CHATBOT_AI_API_KEY` | set (redacted — never logged or committed) |
| `CHATBOT_AI_MODEL` | `gemini-3.1-flash-lite` — see note |
| `CHATBOT_AI_TIMEOUT` | `15` |
| `CHATBOT_HYBRID_MODE` | `faq_first` |

Model selection evidence (`generateContent` probes, 2026-11-18):
`gemini-3.6-flash` → HTTP 503 "high demand"; `gemini-2.5-flash`/`-lite`/`2.5-pro`
→ HTTP 404 "no longer available"; `gemini-3.5/3.7/3.8-flash` → 503;
`gemini-3.1-flash-lite` → **HTTP 200, ~7.6s, correct reply**.
`listModels` confirmed the key can access `generateContent` models.

Production activation is **not** assumed: enabling Gemini in production requires
its own capacity/limits verification (see final report — deployment readiness).
