# CHATBOT FINAL AUDIT REPORT

**Module:** React chatbot widgets + Laravel chatbot/live-chat APIs + MySQL + Gemini AI
**Audit date:** 2026-11-18 · **Auditor:** automated deep-dive audit
**Verdict: PASS — production-ready within stated limitations**

| Suite | Result |
|---|---|
| PHPUnit (chatbot/live-chat filter) | **89/89 PASS** (386 assertions, 63.8s) |
| `php artisan chatbot:eval` | **37/37 PASS** (baseline 26/37) |
| Vitest (`npm run test:unit`) | **44/44 PASS** |
| Chatbot API base tests | **9/9 PASS** |
| Playwright `chatbot-workflow.spec.js` | **13/13 PASS** (4.3m, zero retries) |
| Live API status probes | **14/14 expected statuses** |
| Live-chat API smoke | **9/9 steps PASS** |
| `npm run build` | PASS (pre-existing chunk-size warnings) |

---

## 1. Initial condition

- `chatbot:eval` failed **11/37** cases: stage-1 intent shadowing swallowed
  how-to/booking questions; live FAQ rows carried fabricated contact details,
  invented policies, literal `\n`, and mojibake.
- AI provider silently disabled: `CHATBOT_AI_PROVIDER` didn't match the
  configured Gemini credential; `chatbot:test` printed Groq-only diagnostics.
- Security gaps: unbounded `userHistory`, unvalidated `channel`, FAQ cache
  under-invalidation, no FAQ `category` support.
- Dead surface: `POST /customer/chatbot` (logs-only), `ChatbotService.php`
  (1,064 lines, manual-script-only consumer), `TelegramBotController`
  (unregistered), `transaction_lookup` widget wiring (no backend workflow).
- A real React defect hid in `RoleAwareChatbot`: StrictMode double-mount let a
  stale welcome fetch clobber in-flight user messages.
- Windows dev-stack constraint: `php artisan serve` is single-threaded
  (`PHP_CLI_SERVER_WORKERS` is a no-op on Windows) — browser connection
  starvation made live-chat E2E impossible until a worker pool was added.

## 2. Existing functionality (verified, not assumed)

- Role-aware authenticated chat (`welcome`, `message`, per-user `logs`).
- Guest public chat on the landing widget — FAQ/rules only, no personal data.
- Two-stage intent detection → FAQ (scope + keyword-weighted) → rule handlers →
  AI-eligible intents → `ChatbotAnswerValidator` gate → fail-soft fallback.
- Workflow endpoints: booking, appointment lookup, inventory search, hotel
  availability/book — role-gated.
- Live chat: customer start/message/poll/close; staff inbox/claim/reply/close —
  atomic claim, ownership checks, closed-session rejection, cursor polling.
- Admin: chatbot logs, per-user history, FAQ CRUD with category.
- Taglish normalization, conversation memory (last 4 turns), quick actions,
  conversational booking flows, transcript persistence per user+role.

## 3. Missing / dormant functionality (documented, not faked)

- **Telegram integration — NOT IMPLEMENTED.** Controller removed; no route;
  `telegram:test` command remains as a diagnostic only.
- No standalone `transaction_lookup` chatbot workflow — removed the dead widget
  wiring; cashier transaction search remains a page-level feature.
- Realtime live chat (WebSockets) — polling-based by design.

## 4. Fixes applied (see `CHATBOT_FIX_CHANGELOG.md` for detail)

C1 provider config + provider-aware diagnostics · C2 intent shadowing,
canonical facts, mojibake, reseed · C3 FAQ category CRUD · C4 seed hygiene +
deactivate stale Telegram FAQ · C5 cache invalidation · C6 bound
`userHistory` · C7 legacy endpoint removed · C8 dead code removed · C9 channel
whitelist · D1 StrictMode bootstrap cancellation guard · test-env worker pool
for Windows `php -S`.

## 5. Automated test results (commands + outcomes)

| Command | Outcome |
|---|---|
| `php artisan test --filter="Chatbot\|LiveChat\|Chat"` | 89 passed, 386 assertions, 63.8s |
| `php artisan chatbot:eval` | 37 passed / 0 failed |
| `npm run test:unit` | 44 passed (9 files) |
| `node --test tests/chatbot-api-base.test.mjs` | 9 passed |
| `npm run build` | success |
| `npx playwright test e2e/chatbot-workflow.spec.js` | 13 passed |
| `php artisan route:list` | no telegram route; `/customer/chatbot` absent |

## 6. Browser / E2E evidence

See `CHATBOT_E2E_EVIDENCE.md`: public FAQ, vet booking, payment, boarding,
fallback, empty-message, ordered rapid submits, medical safety, emergency,
admin-FAQ propagation, RBAC, API-failure retry, and full live-chat handoff —
all PASS. Playwright traces/screenshots in `frontend/test-results/`.

## 7. API & database evidence

See `CHATBOT_API_DATABASE_AUDIT.md`: 14/14 status probes correct
(401/403/404/422/200), schema for `chatbot_faqs` / `live_chat_sessions` /
`live_chat_messages`, persistence verified (265 `chatbot_logs`,
`conversation_id` in metadata, 21 active FAQs, full live-chat lifecycle rows).

## 8. Security evidence

See `CHATBOT_SECURITY_AUDIT.md`: RBAC probes, IDOR 404, atomic claim,
closed-session 422, injection refusal, medical safety, canonical store facts,
channel/category whitelist, secrets hygiene (Gemini key never exposed).
**No open security defects in audited scope.**

## 9. Performance notes

- Gemini `generateContent` ≈ 7.6–9.7s end-to-end (bounded by
  `CHATBOT_AI_TIMEOUT=15`); FAQ/rule replies are sub-second.
- Windows dev caveat: E2E requires the worker pool
  (`pawesome-maintenance/php-worker-pool.js`) or an equivalent threaded
  server — **dev-only**, not a production concern (Railway/Apache/Nginx are
  multi-process).
- Frontend bundle: largest chunk ~3.64 MB — pre-existing, unrelated.

## 10. Remaining defects / limitations

| Item | Status |
|---|---|
| Gemini free-tier capacity spikes (503 "high demand") | Expected; handled by fail-soft fallback — no user-facing error |
| `gemini-3.6-flash` unavailable to this key right now | Mitigated: `gemini-3.1-flash-lite` verified working |
| QA-generated rows in `services` table | Data-hygiene note — not customer-facing canonical data |
| Telegram | NOT IMPLEMENTED — do not demo as a feature |
| Live-chat notifications | Polling-based delivery verified; push/WS is future work |

## 11. Deployment readiness

- **Ready for capstone demo** on the documented stack (Railway API + MySQL,
  Vercel frontend). `APP_DEBUG=false`, production keys per release checklist.
- Gemini activation in production: set `CHATBOT_AI_PROVIDER=gemini` +
  `CHATBOT_AI_API_KEY` + model + timeout **after** verifying quota on the
  production key; FAQ/rules keep working regardless (fail-soft verified).
- Do **not** present Telegram, `transaction_lookup`, or `/customer/chatbot`
  as features — they are removed/dormant.

## 12. Recommendation

**PASS.** The chatbot + live-chat module is reliable, secure, and accurate
within audited scope: 89/89 backend tests, 37/37 eval cases, 44/44 unit tests,
13/13 E2E scenarios, 14/14 API probes, all security checks green, and the AI
path verified end-to-end with graceful degradation. Proceed to capstone
presentation; keep Telegram dormant and re-verify Gemini capacity at deploy.
