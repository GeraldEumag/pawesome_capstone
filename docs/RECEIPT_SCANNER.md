# Receipt Scanner (GCash / Maya)

Automatic reading of customer-uploaded GCash and Maya payment receipts.
Upload a screenshot/photo/PDF of a receipt and the system extracts the
reference number, amount, payment date, recipient, and status text — then
pre-fills the cashier's verification screen with confidence and validation
results. The cashier still confirms; scans are never auto-accepted.

## Architecture

```
upload (existing payment-proof endpoints)
  └─ ReceiptService::storeAndAttach()        # file + payable + receipt row in one tx
       └─ ProcessReceiptScan (queue: receipts)
            └─ ReceiptService::process()
                 ├─ preprocess (metadata strip, dHash)
                 ├─ reader chain (first success wins):
                 │    vision/openrouter → OpenRouterVisionReader (OpenRouter, images + PDFs)
                 │    gemini           → GeminiVisionReader     (Gemini API, images + PDFs)
                 │    ocr              → LocalOcrReader         (Tesseract CLI / pdftotext)
                 ├─ ProviderReceiptParser (OCR text → shared schema)
                 ├─ ReceiptNormalizer (provider confusion map, pattern bounds)
                 ├─ ReceiptValidationService → receipt_validations rows
                 └─ auto-fill payable.payment_reference
```

Every level degrades to today's manual entry — a broken reader, unreadable
receipt, or disabled scanner never blocks a payment.

### Resilience

`receipt_scanner.chain` drives an ordered fallback inside one scan:

- `vision` (alias: `openrouter`) — OpenRouter (default). Requires
  `OPENROUTER_API_KEY`. The model is configurable with `OPENROUTER_MODEL`;
  the default is `openrouter/free`. The reader only accepts `openrouter/free`
  or model IDs ending in `:free`, so a paid model cannot be selected
  accidentally. `OPENROUTER_MODELS` lists additional free models OpenRouter
  falls back to in order when the primary fails. Images are downscaled to
  ≤1024px JPEG before upload to fit free models' tight vision/context
  budgets; PDFs pass through unchanged.
- `gemini` — Google Gemini `generateContent` (paid alternative). Requires
  `RECEIPT_READER_API_KEY` (falls back to `CHATBOT_AI_API_KEY`) and
  `RECEIPT_READER_MODEL`. Select it with `RECEIPT_SCANNER_CHAIN=gemini,ocr`,
  or run `vision,gemini,ocr` to use OpenRouter first and Gemini as backup.
- `ocr` — fully local: Tesseract for images, `pdftotext` for digital PDFs.
  Needs no API key or network. Optional install:
  `winget install UB-Mannheim.TesseractOCR`, then set `OCR_TESSERACT_PATH`
  if not on PATH.

Switching providers needs no code change — only the chain order and each
provider's key in `.env` (then `php artisan config:clear`).

Set `RECEIPT_SCANNER_CHAIN=ocr` for a fully offline deployment (also answers
the privacy concern — no receipt image leaves the server). `ocr` extractions
carry heuristic confidence, so offline reads land amber/`needs_review` for
cashier eyes rather than silently green.

## Data model

| Table | Purpose |
| --- | --- |
| `payment_receipts` | One row per uploaded proof: payable, file hash (sha256 + dHash), typed fallback ref, status |
| `receipt_extractions` | Every reader attempt + the winning read (fields, confidence JSON, raw response, latency) |
| `receipt_validations` | One row per rule per scan: `pass` / `warning` / `block` |
| `receipt_corrections` | Cashier edits to extracted values (accuracy metric input) |
| `payment_references` | Confirmed references — `unique(provider, reference_normalized)` written inside the verify transaction |
| `provider_configs` | Manager-editable GCash/Maya patterns, labels, accepted status texts, confusion maps |
| `clinic_payment_accounts` | The clinic's GCash/Maya account names + last-4 (recipient matching) |

Seed defaults: `php artisan db:seed --class=ReceiptScannerSeeder`.

## Endpoints

Customer (`role:customer`):

- `POST /api/customer/requests/{id}/payment-proof` — now accepts optional
  `payment_reference` + `idempotency_key`; WEBP added to allowed types.
  Same for `/boarding-requests/{id}/payment-proof`,
  `/medical-confinements/{id}/payment-proof`, and
  `/billing/veterinary/{id}/online-payment`.
- `GET /api/customer/receipts/{type}/{id}` — scan status for polling
  (`reading` / `under_review` / `verified` / `rejected` / `manual_entry`).
- `POST /api/customer/receipts/{id}/reference` — manual reference fallback
  (only when no reader produced a reference; still deduped).

Cashier (`role:cashier`):

- `GET /api/cashier/receipts/{id}` — extraction + validations for the
  pre-filled verify screen.
- `POST /api/cashier/receipts/{id}/confirm` — runs the existing verify
  transaction plus the `payment_references` insert; a duplicate reference
  rolls the whole verification back.
- `POST /api/cashier/receipts/{id}/reject`, `POST /api/cashier/receipts/{id}/reread`.

Manager (`role:manager,admin`):

- `GET|PUT /api/manager/receipt-scanner/settings` — provider patterns,
  clinic accounts, thresholds.
- `GET /api/manager/receipt-scanner/metrics` — auto-fill, correction,
  flagged, review rates and per-reader latency (thesis metrics).

## Validation rules

Each scan writes `receipt_validations` rows; any `block` disables Confirm:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `receipt_type` | block | Not a GCash/Maya payment receipt |
| `reference_pattern` | warning | Reference doesn't match provider format |
| `reference_unique` | block | Reference already confirmed on another payment |
| `reference_pending_elsewhere` | warning | Same reference on another pending payment |
| `image_unique` | block | Exact image already used on a confirmed payment |
| `similar_image` | warning | Perceptual hash close to a previous upload (possible edited copy) |
| `amount` | warning | Receipt amount ≠ payable balance |
| `date` | warning | Receipt outside the acceptance window / unreadable |
| `recipient` | warning | Recipient doesn't match a configured clinic account |
| `status` | block / warning | Block when a non-success status is read (e.g. Processing, Failed); warning when no status text is readable |
| `confidence` | warning | Below green threshold |
| `image_quality` | warning | Reader reports a poor-quality image |
| `reference_agreement` | warning | Typed reference differs from scanned reference |

## Configuration

```env
RECEIPT_SCANNER_ENABLED=true
RECEIPT_SCANNER_CHAIN=vision,ocr      # or gemini,ocr / vision,gemini,ocr / ocr
OPENROUTER_API_KEY=                   # backend-only secret; never use a VITE_ variable
# OPENROUTER_API_KEYS=key2,key3       # optional comma-separated backup keys
OPENROUTER_MODEL=openrouter/free     # or a vision-capable OpenRouter model ending in :free
# OPENROUTER_MODELS=a:free,b:free    # ordered free-model fallbacks (paid entries dropped)
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# OPENROUTER_HTTP_REFERER=https://your-frontend.example
# OPENROUTER_APP_NAME=Pawesome
# Gemini provider (only needed when 'gemini' is in the chain)
# RECEIPT_READER_API_KEY=             # falls back to CHATBOT_AI_API_KEY
# RECEIPT_READER_API_KEYS=key2,key3   # optional backup keys
# RECEIPT_READER_MODEL=gemini-3.6-flash
# RECEIPT_READER_BASE_URL=https://generativelanguage.googleapis.com/v1beta
# RECEIPT_READER_TIMEOUT=30
# RECEIPT_READER_MAX_TOKENS=1200
# RECEIPT_READER_RETRIES=2
# OCR_TESSERACT_PATH=                 # e.g. C:\Program Files\Tesseract-OCR\tesseract.exe
# OCR_PDFTOTEXT_PATH=pdftotext
# RECEIPT_CONFIDENCE_GREEN=0.90
# RECEIPT_CONFIDENCE_REVIEW=0.70
# RECEIPT_DATE_WINDOW_DAYS=7
# RECEIPT_MAX_UPLOADS_PER_PAYABLE=15
# RECEIPT_PHASH_MAX_DISTANCE=6
```

Queue: scans dispatch on the `receipts` queue with 3 retries / backoff
`[15s, 60s, 300s]`. With `QUEUE_CONNECTION=sync` the scan runs inline during
the upload request; a failure marks the receipt `failed` — the upload itself
still succeeds.

## Evaluation

```bash
php artisan receipts:evaluate [corpus-dir] [--json]
```

Corpus = receipt files with `name.ext.expected.json` sidecars
(`{"provider","reference","amount"}`). Default dir: `tests/Fixtures/receipts`.
Reports reference-detected rate, provider/reference/amount accuracy — the
numbers the thesis accuracy section quotes.

## Security notes

- Uploads keep flowing through `FileStorageService` on the **private** disk;
  proofs are served only via `/api/files/payment-proofs/{type}/{id}/view`.
- OpenRouter vision sends receipt contents to the configured model provider.
  Review that provider's data-retention terms and use `RECEIPT_SCANNER_CHAIN=ocr`
  when receipts must remain entirely on the server.
- Allowed types: JPG, PNG, WEBP, PDF ≤ 5 MB; Laravel `mimes` + finfo checks.
- Receipt text is parsed against a fixed schema — extra fields are discarded
  (prompt-injection safe by construction).
- Confirm is idempotent: `payment_references` unique key + the existing
  payable row lock make double-confirm impossible.

## Tests

```bash
php artisan test --filter=ReceiptScannerTest
```

Covers upload→receipt attach, OpenRouter image/PDF payloads and key failover,
graceful reader failure, customer status/ownership, manual fallback,
unique-reference confirm, block gating, RBAC, and parser/normalizer units.
