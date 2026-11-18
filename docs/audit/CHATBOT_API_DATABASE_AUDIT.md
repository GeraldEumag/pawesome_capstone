# Chatbot API & Database Audit

Date: 2026-11-18 · Live probes against `http://127.0.0.1:8000/api`
(tokens obtained via `POST /auth/login`; no credentials stored here).

## 1. Endpoint / status matrix (live probes)

| Probe | Expected | Result |
|---|---|---|
| Guest `POST /chatbot/message` | 401 | ✅ 401 |
| Customer `GET /admin/chatbot/logs` | 403 | ✅ 403 |
| Receptionist `GET /admin/chatbot/logs` | 403 | ✅ 403 |
| Admin `GET /admin/chatbot/logs` | 200 | ✅ 200 |
| Customer `POST /admin/chatbot/faqs` | 403 | ✅ 403 |
| Admin `POST /chatbot/message` empty body | 422 | ✅ 422 |
| `POST /chatbot/message` invalid `channel` | 422 | ✅ 422 (whitelist added this pass) |
| Customer `GET /chatbot/live-chat/inbox` | 403 | ✅ 403 |
| Receptionist `GET /chatbot/live-chat/inbox` | 200 | ✅ 200 |
| Guest `GET /chatbot/live-chat/inbox` | 401 | ✅ 401 |
| `POST /customer/chatbot` (legacy) | 404 | ✅ 404 (removed) |
| Inventory role `GET /chatbot/workflow/appointments` | 403 | ✅ 403 |
| Customer `POST /chatbot/message` valid | 200 | ✅ 200 |
| Guest `POST /chatbot/public/message` | 200 | ✅ 200 (guest-safe path) |

Rate limiting: `POST /chatbot/message` is behind `throttle:chatbot`
(20/min) plus a per-user daily cap; the frontend renders the 429 path as a bot
reply ("sending messages a bit too quickly") — covered in
`RoleAwareChatbot.jsx::submitMessage`. Not separately hammered in E2E to avoid
exhausting the test user's daily cap (status: **PASS via code + unit path**).

## 2. Registered chatbot/live-chat routes (`php artisan route:list`)

- `GET|POST /api/chatbot/welcome|message|logs` (auth)
- `GET /api/chatbot/public/welcome`, `POST /api/chatbot/public/message` (guest)
- `GET /api/chatbot/workflow/options`, `POST …/book-appointment`,
  `GET …/appointments`, `GET …/inventory/search`,
  `GET …/hotel/availability`, `POST …/hotel/book`
- Live chat: `GET /live-chat/inbox|session`, `POST /live-chat/start`,
  `DELETE /live-chat/{session}` (customer close), `POST /{s}/claim`,
  `PATCH /{s}/close`, `POST /{s}/message`, `GET /{s}/messages`,
  `POST /{s}/reply`
- Admin: `GET /admin/chatbot/logs`, `GET /admin/chatbot/users/{user}/history`,
  `POST|PUT|DELETE /admin/chatbot/faqs*`
- **No Telegram route is registered** — integration dormant by design.

## 3. Schema (live MySQL `pawesome`)

```
chatbot_faqs:       id, question, answer, category, keywords, scope,
                    is_active, sort_order, created_at, updated_at
live_chat_sessions: id, customer_id, customer_name, customer_email, status,
                    assigned_to, last_message_at, closed_at, timestamps
live_chat_messages: id, session_id, sender_type, sender_id, sender_name,
                    message, is_read_by_staff, is_read_by_customer, timestamps
```

## 4. Persistence evidence (live DB, 2026-11-18)

- `chatbot_faqs`: 21 active / 1 inactive (Telegram FAQ deactivated as out of scope).
- `chatbot_logs`: 265 rows; `conversation_id` persisted in metadata (unit-verified).
- `live_chat_sessions`/`messages`: full lifecycle rows verified — system
  ("Customer connected", "Receptionist joined"), customer, and staff messages
  persisted with sender metadata and read flags.
- Hotel room rates returned by the bot match `hotel_rooms` live data
  (₱450–₱1,200 range); canonical contact facts come from `StoreFacts`/`StoreHours`
  (270020371, pawesomeretreat24@gmail.com, Las Piñas address, daily 10AM–6PM).
