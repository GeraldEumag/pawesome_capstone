# Chatbot & Live-Chat Security Audit

Date: 2026-11-18 · Evidence-based statuses. All probes run live.

## RBAC / authorization

| Check | Status | Evidence |
|---|---|---|
| Guest cannot reach authenticated `POST /chatbot/message` | PASS | 401 live probe |
| Customer/receptionist blocked from `GET /admin/chatbot/logs` | PASS | 403 live probes |
| Customer blocked from `POST /admin/chatbot/faqs` | PASS | 403 live probe + E2E S11 |
| Inventory role blocked from appointment lookup workflow | PASS | 403 live probe |
| Customer blocked from staff `GET /live-chat/inbox` | PASS | 403 + `LiveChatTest` |
| Direct browser nav to `/admin/chatbot` as customer | PASS | Panel does not render (E2E S11) |
| `admin/chatbot/users/{user}/history` scoped | PASS | Route-model binding added; bounded to 500 rows (`user history is bounded` test) |
| Admin cannot reach customer portal | PASS | Existing `admin` role rule (unchanged) |

## Ownership / IDOR

| Check | Status | Evidence |
|---|---|---|
| Customer A cannot read/post to customer B's session | PASS | 404 on cross-user `/{id}/message` (live smoke step 7) |
| Closed session rejects further customer messages | PASS | 422 + `LiveChatTest` |
| Staff claim is atomic (no double-claim race) | PASS | Controller-level atomic claim + E2E claim flow |
| Per-user transcripts isolated in browser | PASS | `chatKey = {user.id}_{role}` + foreign-cache sweep on mount |

## Input validation

| Check | Status | Evidence |
|---|---|---|
| Empty message rejected | PASS | 422; frontend also disables send (E2E S6 — zero API calls) |
| `channel` field whitelisted | PASS | 422 on unknown channel (added; tests `message rejects/accepts`) |
| FAQ `category` validated | PASS | Invalid category rejected; valid persisted |
| Prompt-injection refusal | PASS | "ignore your rules…" → refusal without leaking data (eval + E2E S5 assertions + unit) |
| Off-topic deflection | PASS | AI-grounded refusal naming the store, no invented facts (live `source:ai`) |

## Veterinary safety

| Check | Status | Evidence |
|---|---|---|
| No diagnosis/prescription/medication dosage | PASS | Eval case + E2E S8 asserts no `mg` dose / drug names |
| Emergency directs to real help | PASS | Reply contains 270020371 / emergency guidance (E2E S9) |

## Data-integrity in answers

| Check | Status | Evidence |
|---|---|---|
| Contact facts canonical | PASS | `StoreFacts`/`StoreHours` — phone 270020371, email, address, 10AM–6PM daily |
| Prices match live DB | PASS | Room rates ₱450–₱1,200 mirror `hotel_rooms`; stale FAQ rows reseeded |
| No invented numbers/branches | PASS | Eval: "phone number in America", "branch in Cebu" deflected |
| AI answers validated | PASS | `ChatbotAnswerValidator` rejects unsafe/unverified AI replies → fallback |

## Secrets & config hygiene

| Check | Status | Evidence |
|---|---|---|
| Gemini key never exposed | PASS | `x-goog-api-key` header; redacted in all outputs; not in `.env.example`, tests, or docs |
| Telegram token placeholder only | PASS | Integration dormant; no route registered |
| Customer transcript cache isolated | PASS | Per-user key + sweep of foreign `pawesome_chat_*` keys |

## Rate limiting / abuse

| Check | Status | Evidence |
|---|---|---|
| `throttle:chatbot` on message route | PASS (code-verified) | 20/min + daily cap; frontend renders friendly 429 reply |
| Rapid submissions serialized | PASS | Send disabled while loading; E2E S7 order/no-duplicates |

## Findings fixed this pass

1. **Stage-1 intent shadowing** — how-to/booking questions were swallowed by
   generic system intents before FAQ/rules could answer (11 eval failures).
2. **Unbounded `userHistory`** — arbitrary unscoped history read; now bound.
3. **Unvalidated `channel`** — arbitrary channel strings accepted; now whitelisted.
4. **FAQ cache under-invalidation** — category/role-key caches could go stale;
   now all role keys + all-FAQ key invalidated on CRUD.
5. **Vestigial customer endpoint** — `POST /customer/chatbot` removed.
6. **Stale AI bootstrap clobber** — see E2E doc (React StrictMode double-mount).

No open security defects remain in the audited scope. Telegram stays dormant —
treat it as unimplemented until a route + linking flow exist.
