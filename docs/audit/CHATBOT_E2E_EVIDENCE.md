# Chatbot E2E Evidence

Date: 2026-11-18 · `frontend/e2e/chatbot-workflow.spec.js` · live stack
(backend :8000 worker pool, frontend Vite :3000, real MySQL, real Gemini).

Command: `npx playwright test e2e/chatbot-workflow.spec.js --reporter=list`

## Result — 13/13 PASS, no retries (4.3 min)

| # | Scenario | Result | Duration |
|---|---|---|---|
| S1 | Public guest asks FAQ via landing widget | PASS | 14.4s |
| S2 | Customer asks veterinary booking question | PASS | 18.6s |
| S3 | Customer asks payment question (GCash/Maya) | PASS | 11.9s |
| S4 | Customer asks boarding/vaccination question | PASS | 13.7s |
| S5 | Unknown question → controlled fallback, no raw errors | PASS | 33.0s (AI path) |
| S6 | Empty message makes no API request | PASS | 10.1s |
| S7 | Rapid submissions stay ordered, no duplicates | PASS | 12.6s |
| S8 | Veterinary safety — no diagnosis/prescription/dose | PASS | 17.3s |
| S9 | Emergency → directs to immediate help (270020371) | PASS | 15.4s |
| S10 | Admin FAQ update reflected in chatbot answers (cache propagation) | PASS | 28.2s |
| S11 | Customer cannot reach admin chatbot endpoints (API + UI) | PASS | 12.9s |
| S12 | API failure shows error, retry works | PASS | 14.4s |
| — | Live-chat handoff: customer start → staff claim → staff reply → customer poll | PASS | 50.6s |

Trace/screenshot artifacts: `frontend/test-results/` (retained per run).

## Defects found and fixed through E2E

### D1 — StrictMode double-mount clobbers the transcript (real component bug)

`RoleAwareChatbot`'s welcome effect ran `fetchChatbotWelcome()` with **no
cancellation guard**. Under `<React.StrictMode>` (dev, `src/index.jsx:25`) the
mount effect runs twice → two welcome fetches; the stale second response
resolved *after* a user send and `setMessages([welcome])` wiped the user's
message while its reply still appended (S7 snapshot showed a bot reply with no
preceding user message). **Fix:** `cancelled` flag in effect cleanup —
late-resolving duplicates no longer touch state.

### D2 — Windows `php -S` is single-threaded; `PHP_CLI_SERVER_WORKERS` is a no-op

Benchmark: 10 parallel requests completed in a serial staircase (~2s each,
19.8s total). The browser's ~6-connection-per-origin limit filled with queued
requests (dashboard hydration + inbox/message polls), so the staff `/reply`
fetch **never dispatched** — verified absent from the Playwright network trace.
`php artisan serve` cannot parallelize on Windows.

**Fix (test environment):** `C:/xampp/pawesome-maintenance/php-worker-pool.js` —
round-robin proxy on :8000 to 10 `php artisan serve` workers on :8001–8010
(stateless API — Sanctum token + MySQL + file cache). Re-benchmark: 10 parallel
requests in 2.6s total. Note: `docs/CHATBOT_ARCHITECTURE.md` and AGENTS note
Apache can't be used — the project-root `.htaccess` deliberately denies all
HTTP access (protects `.env`/storage); do not weaken it.

### D3 — Test-harness fixes (not product defects)

- Typing indicator (`.rbac-typing-bubble`) renders inside a bot message wrapper;
  helpers now select real bubbles via `:not(.rbac-typing-bubble)` and wait for
  non-empty text.
- Inputs stay disabled while bootstrapping — helpers wait for `toBeEnabled`.
- Staff inbox items carry `lci-session-{status}` — test selects
  `.lci-session-waiting` instead of first item (avoids stale closed sessions).
- Per-test timeout raised to 120s: login + dashboard hydration + AI replies
  (up to ~15s provider timeout) exceed the 30s default.

## Live-chat lifecycle evidence (API + UI)

- Waiting → claim → active transitions persisted in `live_chat_sessions`.
- System messages ("Customer connected…", "Receptionist joined the chat.")
  delivered to both sides via `after_id` cursor polling.
- Optimistic staff bubble replaced by persisted `message_obj`; removed on error.
- Cross-user session access → 404; closed session → 422.
