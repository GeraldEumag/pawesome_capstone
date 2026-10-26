<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\PaymentReceipt;
use App\Models\ProviderConfig;
use App\Models\ReceiptExtraction;
use App\Models\ReceiptValidation;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\Receipts\ProviderReceiptParser;
use App\Services\Receipts\ReceiptService;
use App\Services\Receipts\ReceiptValidationService;
use App\Services\Receipts\ReceiptNormalizer;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ReceiptScannerTest extends TestCase
{
    use RefreshDatabase;

    private function pngFile(string $name = 'receipt.png'): UploadedFile
    {
        // Minimal 1×1 PNG fixture — the local PHP CLI may lack GD, so use
        // createWithContent (never fake()->image()).
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        return UploadedFile::fake()->createWithContent($name, $png);
    }

    private function customerUser(): array
    {
        $user = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $customer = Customer::factory()->create(['user_id' => $user->id, 'email' => $user->email]);
        return [$user, $customer];
    }

    private function cashier(): User
    {
        return User::factory()->create(['role' => 'cashier', 'is_active' => true]);
    }

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('receipt-test')->plainTextToken];
    }

    private function approvedUnpaidRequest(Customer $customer): ServiceRequest
    {
        return ServiceRequest::create([
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => Carbon::today()->toDateString(),
            'request_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'online',
        ]);
    }

    private function receiptFor(string $type, int $id, array $attrs = []): PaymentReceipt
    {
        return PaymentReceipt::create(array_merge([
            'payable_type' => $type,
            'payable_id' => $id,
            'disk' => 'private',
            'disk_path' => 'payment-proofs/test.png',
            'mime' => 'image/png',
            'size_bytes' => 68,
            'sha256' => hash('sha256', $type . $id . random_bytes(8)),
            'status' => PaymentReceipt::STATUS_READY,
        ], $attrs));
    }

    /* ── Upload integration ── */

    public function test_upload_without_typed_reference_creates_receipt_row(): void
    {
        Storage::fake('private');
        config()->set('receipt_scanner.chain', []); // no readers → scan fails gracefully

        [$user, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);

        $response = $this->withHeaders($this->authHeaders($user))
            ->post("/api/customer/requests/{$sr->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_proof' => $this->pngFile(),
            ]);

        $response->assertOk();
        $this->assertSame('pending', $sr->fresh()->payment_status);
        $this->assertNull($sr->fresh()->payment_reference);

        $receipt = PaymentReceipt::where('payable_type', 'service_request')
            ->where('payable_id', $sr->id)
            ->first();
        $this->assertNotNull($receipt, 'payment_receipts row must be created on upload');
        // With sync queue + an empty reader chain the scan runs immediately and
        // fails — the receipt degrades to manual review, never blocks payment.
        $this->assertSame(PaymentReceipt::STATUS_FAILED, $receipt->fresh()->status);
        $this->assertNotNull($sr->fresh()->payment_proof);
    }

    public function test_upload_with_typed_reference_still_dedupes(): void
    {
        Storage::fake('private');
        config()->set('receipt_scanner.chain', []);

        [$user, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);

        $this->withHeaders($this->authHeaders($user))
            ->post("/api/customer/requests/{$sr->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'GCASH-9001',
                'payment_proof' => $this->pngFile(),
            ])->assertOk();

        $this->assertSame('GCASH-9001', $sr->fresh()->payment_reference);
        $this->assertSame('GCASH-9001', PaymentReceipt::latest()->first()->submitted_reference);
    }

    public function test_each_upload_key_stores_its_own_file_and_reused_key_with_other_file_is_rejected(): void
    {
        Storage::fake('private');
        config()->set('receipt_scanner.chain', []);

        [, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        $persist = fn (string $path) => $sr->update(['payment_proof' => $path]);
        $store = fn (string $name, string $bytes, string $key) => ReceiptService::storeAndAttach(
            UploadedFile::fake()->createWithContent($name, $bytes),
            'payment-proofs', 'service_request', $sr->id, $persist,
            ['prefix' => 'proof', 'idempotency_key' => $key],
        );

        $store('first.png', $png, 'key-a');
        $store('second.png', $png . 'x', 'key-b');

        $receipts = PaymentReceipt::where('payable_type', 'service_request')->where('payable_id', $sr->id)->orderBy('id')->get();
        $this->assertCount(2, $receipts);
        $this->assertNotSame($receipts[0]->disk_path, $receipts[1]->disk_path);
        $this->assertSame($receipts[1]->disk_path, $sr->fresh()->payment_proof);

        $this->expectException(ValidationException::class);
        $store('other.png', $png . 'yy', 'key-a');
    }

    public function test_cashier_receipts_serve_their_own_files_and_proof_is_not_cached(): void
    {
        Storage::fake('private');
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        Storage::disk('private')->put('payment-proofs/one.png', $png);
        Storage::disk('private')->put('payment-proofs/two.png', $png . 'x');

        [, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);
        $sr->update(['payment_proof' => 'payment-proofs/two.png']);
        $first = $this->receiptFor('service_request', $sr->id, ['disk_path' => 'payment-proofs/one.png']);
        $second = $this->receiptFor('service_request', $sr->id, ['disk_path' => 'payment-proofs/two.png']);
        $cashier = $this->cashier();

        $this->withHeaders($this->authHeaders($cashier))
            ->getJson("/api/cashier/receipts/{$first->id}")
            ->assertOk()
            ->assertJsonPath('receipt.proof_url', url("/api/files/payment-receipts/{$first->id}/view"));

        $view = $this->withHeaders($this->authHeaders($cashier))
            ->get("/api/files/payment-receipts/{$first->id}/view")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png');
        $this->assertSame($png, $view->getContent());

        $this->withHeaders($this->authHeaders($cashier))
            ->get("/api/files/payment-receipts/{$second->id}/view")
            ->assertOk();

        $proof = $this->withHeaders($this->authHeaders($cashier))
            ->get("/api/files/payment-proofs/service-request/{$sr->id}/view")
            ->assertOk();
        $this->assertStringContainsString('no-cache', (string) $proof->headers->get('Cache-Control'));
    }

    public function test_payable_accepts_fifteen_uploads_then_refuses_the_sixteenth(): void
    {
        Storage::fake('private');
        config()->set('receipt_scanner.chain', []);

        [, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        $store = fn (int $i) => ReceiptService::storeAndAttach(
            UploadedFile::fake()->createWithContent("r{$i}.png", $png . str_repeat('x', $i)),
            'payment-proofs', 'service_request', $sr->id, fn (string $path) => $sr->update(['payment_proof' => $path]),
            ['prefix' => 'proof', 'idempotency_key' => "key-{$i}"],
        );

        for ($i = 1; $i <= 15; $i++) {
            $store($i);
        }
        $this->assertSame(15, PaymentReceipt::where('payable_id', $sr->id)->count());

        $this->expectException(ValidationException::class);
        $store(16);
    }

    public function test_unreadable_status_is_amber_while_non_success_status_is_red(): void
    {
        [, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);
        $receipt = $this->receiptFor('service_request', $sr->id);
        $extraction = fn (?string $status) => [
            'is_payment_receipt' => true,
            'provider' => 'gcash',
            'reference_normalized' => '8046526004757',
            'amount' => 100.0,
            'paid_at' => now()->toIso8601String(),
            'status_text' => $status,
            'confidence' => ['reference_number' => 0.95],
        ];
        $validator = app(ReceiptValidationService::class);

        $unreadable = $validator->run($receipt, $extraction(null), null);
        $this->assertSame('warning', collect($unreadable['results'])->firstWhere('rule', 'status')['result']);
        $this->assertNotSame('red', $unreadable['overall']);

        $processing = $validator->run($receipt, $extraction('Processing'), null);
        $this->assertSame('block', collect($processing['results'])->firstWhere('rule', 'status')['result']);
        $this->assertSame('red', $processing['overall']);
    }

    /* ── Customer status + manual fallback ── */

    public function test_customer_can_poll_own_receipt_status(): void
    {
        [$user, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);
        $receipt = $this->receiptFor('service_request', $sr->id, ['status' => PaymentReceipt::STATUS_FAILED]);

        $this->withHeaders($this->authHeaders($user))
            ->getJson("/api/customer/receipts/service_request/{$sr->id}")
            ->assertOk()
            ->assertJsonPath('receipt.status', 'failed')
            ->assertJsonPath('receipt.display_status', 'manual_entry')
            ->assertJsonPath('receipt.needs_manual_reference', true);
    }

    public function test_customer_cannot_view_another_customers_receipt(): void
    {
        [$user, $customer] = $this->customerUser();
        [, $otherCustomer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($otherCustomer);
        $this->receiptFor('service_request', $sr->id);

        $this->withHeaders($this->authHeaders($user))
            ->getJson("/api/customer/receipts/service_request/{$sr->id}")
            ->assertNotFound();
    }

    public function test_manual_reference_fallback_fills_payable_reference(): void
    {
        [$user, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);
        $receipt = $this->receiptFor('service_request', $sr->id, ['status' => PaymentReceipt::STATUS_FAILED]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/customer/receipts/{$receipt->id}/reference", ['reference' => 'GC-778899'])
            ->assertOk();

        $this->assertSame('GC-778899', $sr->fresh()->payment_reference);
        $this->assertSame(PaymentReceipt::STATUS_NEEDS_REVIEW, $receipt->fresh()->status);
    }

    public function test_manual_reference_rejected_when_scan_already_read_one(): void
    {
        [$user, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);
        $receipt = $this->receiptFor('service_request', $sr->id);
        ReceiptExtraction::create([
            'receipt_id' => $receipt->id,
            'reader' => 'vision',
            'provider' => 'gcash',
            'reference_normalized' => 'GCASH123456',
        ]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson("/api/customer/receipts/{$receipt->id}/reference", ['reference' => 'OTHER-1'])
            ->assertStatus(422);
    }

    /* ── Cashier confirm / duplicate protection ── */

    public function test_cashier_confirm_pays_and_writes_unique_reference(): void
    {
        $cashier = $this->cashier();
        [, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);
        $sr->update([
            'payment_status' => 'pending',
            'payment_method' => 'gcash',
            'payment_proof' => 'payment-proofs/test.png',
        ]);
        $receipt = $this->receiptFor('service_request', $sr->id);
        ReceiptExtraction::create([
            'receipt_id' => $receipt->id,
            'reader' => 'vision',
            'provider' => 'gcash',
            'reference_normalized' => 'GCASH123456',
        ]);

        $this->withHeaders($this->authHeaders($cashier))
            ->postJson("/api/cashier/receipts/{$receipt->id}/confirm", [
                'reference_number' => 'GCASH123456',
                'payment_method' => 'gcash',
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSame('paid', $sr->fresh()->payment_status);
        $this->assertSame(PaymentReceipt::STATUS_CONFIRMED, $receipt->fresh()->status);
        $this->assertDatabaseHas('payment_references', [
            'provider' => 'gcash',
            'reference_normalized' => 'GCASH123456',
            'payable_type' => 'service_request',
            'payable_id' => $sr->id,
        ]);
    }

    public function test_cashier_confirm_rejects_duplicate_reference(): void
    {
        $cashier = $this->cashier();
        [, $customer] = $this->customerUser();

        $sr1 = $this->approvedUnpaidRequest($customer);
        $sr1->update(['payment_status' => 'pending', 'payment_method' => 'gcash', 'payment_proof' => 'payment-proofs/a.png']);
        $r1 = $this->receiptFor('service_request', $sr1->id);

        $sr2 = $this->approvedUnpaidRequest($customer);
        $sr2->update(['payment_status' => 'pending', 'payment_method' => 'gcash', 'payment_proof' => 'payment-proofs/b.png']);
        $r2 = $this->receiptFor('service_request', $sr2->id);

        $this->withHeaders($this->authHeaders($cashier))
            ->postJson("/api/cashier/receipts/{$r1->id}/confirm", [
                'reference_number' => 'GCASH777',
                'payment_method' => 'gcash',
            ])->assertOk();

        // Same reference on a different payable must fail — and must NOT mark
        // the second payment paid (the unique key rolls the verify back).
        $this->withHeaders($this->authHeaders($cashier))
            ->postJson("/api/cashier/receipts/{$r2->id}/confirm", [
                'reference_number' => 'GCASH777',
                'payment_method' => 'gcash',
            ])->assertStatus(422);

        $this->assertSame('pending', $sr2->fresh()->payment_status);
        $this->assertNotSame(PaymentReceipt::STATUS_CONFIRMED, $r2->fresh()->status);
    }

    public function test_confirm_blocked_when_blocking_validation_exists(): void
    {
        $cashier = $this->cashier();
        [, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);
        $sr->update(['payment_status' => 'pending', 'payment_method' => 'gcash', 'payment_proof' => 'payment-proofs/c.png']);
        $receipt = $this->receiptFor('service_request', $sr->id);
        ReceiptValidation::create([
            'receipt_id' => $receipt->id,
            'rule' => 'image_unique',
            'result' => ReceiptValidation::RESULT_BLOCK,
            'detail' => 'This exact image was already used on a confirmed payment.',
        ]);

        $this->withHeaders($this->authHeaders($cashier))
            ->postJson("/api/cashier/receipts/{$receipt->id}/confirm", [
                'reference_number' => 'GCASH999',
                'payment_method' => 'gcash',
            ])
            ->assertStatus(422);

        $this->assertSame('pending', $sr->fresh()->payment_status);
    }

    public function test_receipt_detail_requires_cashier_role(): void
    {
        [, $customer] = $this->customerUser();
        $sr = $this->approvedUnpaidRequest($customer);
        $receipt = $this->receiptFor('service_request', $sr->id);
        [$user] = $this->customerUser();

        $this->withHeaders($this->authHeaders($user))
            ->getJson("/api/cashier/receipts/{$receipt->id}")
            ->assertForbidden();
    }

    /* ── Parser + normalizer (pure units, no I/O) ── */

    public function test_parser_extracts_gcash_receipt_fields(): void
    {
        ProviderConfig::create([
            'provider' => 'gcash',
            'reference_pattern' => '^[0-9]{10,17}$',
            'min_length' => 10,
            'max_length' => 17,
            'reference_labels' => ['Ref No.', 'Reference No.'],
            'accepted_status_texts' => ['success', 'completed', 'sent'],
            'active' => true,
        ]);

        $text = implode("\n", [
            'GCash',
            'Send Money',
            'Amount PHP 500.00',
            'To PAWESOME RETREAT INC',
            'Ref No. 1234567890123',
            'Status Success',
            'Oct 23, 2026 2:15 PM',
        ]);

        $result = (new ProviderReceiptParser())->parse($text);

        $this->assertSame('gcash', $result['provider']);
        $this->assertTrue($result['is_payment_receipt']);
        $this->assertSame('1234567890123', $result['reference_number']);
        $this->assertSame(500.00, (float) $result['amount']);
    }

    public function test_normalizer_applies_confusion_map_and_pattern(): void
    {
        $config = new ProviderConfig([
            'provider' => 'gcash',
            'reference_pattern' => '^[0-9]{10,17}$',
            'min_length' => 10,
            'max_length' => 17,
            'confusion_map' => ['O' => '0', 'l' => '1', 'I' => '1'],
        ]);

        // OCR confusion: O → 0, l → 1 produces a valid digits-only reference.
        $normalized = ReceiptNormalizer::normalize('123456789O123', $config);
        $this->assertSame('1234567890123', $normalized);

        $this->assertTrue(ReceiptNormalizer::matchesProviderPattern('1234567890123', $config));
        $this->assertFalse(ReceiptNormalizer::matchesProviderPattern('12345', $config));
        $this->assertNull(ReceiptNormalizer::normalize(null, $config));
    }

    /* ── Vision key pool ── */

    public function test_vision_reader_fails_over_to_backup_key(): void
    {
        config()->set('receipt_scanner.vision.api_keys', ['dead-key', 'good-key']);
        config()->set('receipt_scanner.vision.model', 'openrouter/free');
        \Illuminate\Support\Facades\Cache::forget('receipt_reader:openrouter_key_index');

        \Illuminate\Support\Facades\Http::fake(function ($request) {
            $authorization = $request->header('Authorization')[0] ?? '';
            if ($authorization === 'Bearer good-key') {
                return \Illuminate\Support\Facades\Http::response([
                    'choices' => [[
                        'message' => [
                            'content' => json_encode([
                                'is_payment_receipt' => true,
                                'provider' => 'gcash',
                                'reference_number' => '1234567890123',
                                'confidence' => ['overall' => 0.95],
                            ]),
                        ],
                    ]],
                ], 200);
            }
            return \Illuminate\Support\Facades\Http::response(['error' => 'quota exceeded'], 429);
        });

        $path = tempnam(sys_get_temp_dir(), 'rcpt');
        file_put_contents($path, 'fake-image-bytes');

        $out = (new \App\Services\Receipts\OpenRouterVisionReader())->read($path, 'image/png');
        @unlink($path);

        $this->assertSame('1234567890123', $out['reference_number']);
        $this->assertSame('gcash', $out['provider']);
    }

    public function test_vision_reader_retries_overloaded_responses_on_the_same_key(): void
    {
        config()->set('receipt_scanner.vision.api_keys', ['only-key']);
        config()->set('receipt_scanner.vision.retries', 2);
        \Illuminate\Support\Facades\Cache::forget('receipt_reader:openrouter_key_index');

        \Illuminate\Support\Facades\Http::fakeSequence()
            ->push(['error' => 'overloaded'], 503)
            ->push([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'is_payment_receipt' => true,
                            'provider' => 'gcash',
                            'reference_number' => '9876543210987',
                            'confidence' => ['overall' => 0.95],
                        ]),
                    ],
                ]],
            ], 200);

        $path = tempnam(sys_get_temp_dir(), 'rcpt');
        file_put_contents($path, 'fake-image-bytes');

        $out = (new \App\Services\Receipts\OpenRouterVisionReader())->read($path, 'image/png');
        @unlink($path);

        $this->assertSame('9876543210987', $out['reference_number']);
        \Illuminate\Support\Facades\Http::assertSentCount(2);
    }

    public function test_vision_reader_reports_when_every_key_fails(): void
    {
        config()->set('receipt_scanner.vision.api_keys', ['k1', 'k2']);
        \Illuminate\Support\Facades\Cache::forget('receipt_reader:openrouter_key_index');
        \Illuminate\Support\Facades\Http::fake(fn () => \Illuminate\Support\Facades\Http::response([], 500));

        $path = tempnam(sys_get_temp_dir(), 'rcpt');
        file_put_contents($path, 'fake-image-bytes');

        try {
            (new \App\Services\Receipts\OpenRouterVisionReader())->read($path, 'image/png');
            $this->fail('Expected ReceiptReaderException');
        } catch (\App\Services\Receipts\ReceiptReaderException $e) {
            $this->assertStringContainsString('key#1', $e->getMessage());
            $this->assertStringContainsString('key#2', $e->getMessage());
        } finally {
            @unlink($path);
        }
    }

    public function test_openrouter_reader_sends_image_as_data_url_without_leaking_key_in_url(): void
    {
        config()->set('receipt_scanner.vision.api_keys', ['router-test-key']);
        config()->set('receipt_scanner.vision.model', 'openrouter/free');
        config()->set('receipt_scanner.vision.base_url', 'https://openrouter.ai/api/v1');
        config()->set('receipt_scanner.vision.http_referer', 'https://pawesome.example');
        config()->set('receipt_scanner.vision.app_name', 'Pawesome');

        \Illuminate\Support\Facades\Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => \Illuminate\Support\Facades\Http::response([
                'choices' => [['message' => ['content' => json_encode([
                    'is_payment_receipt' => true,
                    'provider' => 'gcash',
                    'reference_number' => '1234567890123',
                    'confidence' => ['overall' => 0.95],
                ])]]],
            ], 200),
        ]);

        $path = tempnam(sys_get_temp_dir(), 'rcpt');
        file_put_contents($path, 'fake-image-bytes');

        try {
            $output = (new \App\Services\Receipts\OpenRouterVisionReader())->read($path, 'image/png');
        } finally {
            @unlink($path);
        }

        $this->assertSame('1234567890123', $output['reference_number']);
        \Illuminate\Support\Facades\Http::assertSent(function ($request) {
            $content = $request['messages'][0]['content'] ?? [];
            $url = $request->url();

            return $url === 'https://openrouter.ai/api/v1/chat/completions'
                && !str_contains($url, 'router-test-key')
                && ($request->header('Authorization')[0] ?? '') === 'Bearer router-test-key'
                && ($request['model'] ?? null) === 'openrouter/free'
                && ($content[1]['type'] ?? null) === 'image_url'
                && str_starts_with($content[1]['image_url']['url'] ?? '', 'data:image/png;base64,')
                && ($request->header('HTTP-Referer')[0] ?? null) === 'https://pawesome.example'
                && ($request->header('X-Title')[0] ?? null) === 'Pawesome';
        });
    }

    public function test_openrouter_reader_sends_pdf_as_a_file_part(): void
    {
        config()->set('receipt_scanner.vision.api_keys', ['router-test-key']);
        config()->set('receipt_scanner.vision.model', 'openrouter/free');
        \Illuminate\Support\Facades\Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => \Illuminate\Support\Facades\Http::response([
                'choices' => [['message' => ['content' => json_encode([
                    'is_payment_receipt' => true,
                    'provider' => 'maya',
                    'reference_number' => 'MY-1234567890',
                ])]]],
            ], 200),
        ]);

        $path = tempnam(sys_get_temp_dir(), 'rcpt');
        file_put_contents($path, 'fake-pdf-bytes');

        try {
            $output = (new \App\Services\Receipts\OpenRouterVisionReader())->read($path, 'application/pdf');
        } finally {
            @unlink($path);
        }

        $this->assertSame('maya', $output['provider']);
        \Illuminate\Support\Facades\Http::assertSent(function ($request) {
            $content = $request['messages'][0]['content'] ?? [];

            return ($request['model'] ?? null) === 'openrouter/free'
                && ($content[1]['type'] ?? null) === 'file'
                && ($content[1]['file']['filename'] ?? null) === 'receipt.pdf'
                && str_starts_with($content[1]['file']['file_data'] ?? '', 'data:application/pdf;base64,');
        });
    }

    public function test_openrouter_reader_refuses_paid_model_configuration(): void
    {
        config()->set('receipt_scanner.vision.api_keys', ['router-test-key']);
        config()->set('receipt_scanner.vision.model', 'openai/gpt-4o-mini');
        \Illuminate\Support\Facades\Http::fake();

        $reader = new \App\Services\Receipts\OpenRouterVisionReader();

        $this->assertFalse($reader->isAvailable());
        \Illuminate\Support\Facades\Http::assertNothingSent();
    }

    /* ── Provider switching ── */

    public function test_chain_resolves_gemini_driver_when_configured(): void
    {
        config()->set('receipt_scanner.chain', ['gemini', 'ocr']);

        $readers = app(\App\Services\Receipts\ReceiptReaderChain::class)->readers();

        $this->assertInstanceOf(\App\Services\Receipts\GeminiVisionReader::class, $readers[0]);
        $this->assertInstanceOf(\App\Services\Receipts\LocalOcrReader::class, $readers[1]);
    }

    public function test_chain_supports_openrouter_then_gemini_fallback_order(): void
    {
        config()->set('receipt_scanner.chain', ['vision', 'gemini', 'ocr']);

        $readers = app(\App\Services\Receipts\ReceiptReaderChain::class)->readers();

        $this->assertSame('openrouter', $readers[0]->name());
        $this->assertSame('gemini', $readers[1]->name());
        $this->assertSame('ocr', $readers[2]->name());
    }

    public function test_gemini_reader_sends_generatecontent_with_header_key(): void
    {
        config()->set('receipt_scanner.gemini.api_keys', ['gemini-test-key']);
        config()->set('receipt_scanner.gemini.model', 'gemini-3.6-flash');
        config()->set('receipt_scanner.gemini.base_url', 'https://generativelanguage.googleapis.com/v1beta');
        \Illuminate\Support\Facades\Cache::forget('receipt_reader:gemini_key_index');

        \Illuminate\Support\Facades\Http::fake([
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent' => \Illuminate\Support\Facades\Http::response([
                'candidates' => [['content' => ['parts' => [['text' => json_encode([
                    'is_payment_receipt' => true,
                    'provider' => 'gcash',
                    'reference_number' => '1234567890123',
                    'confidence' => ['overall' => 0.95],
                ])]]]]],
            ], 200),
        ]);

        $path = tempnam(sys_get_temp_dir(), 'rcpt');
        file_put_contents($path, 'fake-image-bytes');

        try {
            $output = (new \App\Services\Receipts\GeminiVisionReader())->read($path, 'image/png');
        } finally {
            @unlink($path);
        }

        $this->assertSame('gemini', (new \App\Services\Receipts\GeminiVisionReader())->name());
        $this->assertSame('1234567890123', $output['reference_number']);
        \Illuminate\Support\Facades\Http::assertSent(function ($request) {
            $part = $request['contents'][0]['parts'][1] ?? [];

            return $request->url() === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'
                && ($request->header('x-goog-api-key')[0] ?? '') === 'gemini-test-key'
                && ($part['inline_data']['mime_type'] ?? null) === 'image/png';
        });
    }

    public function test_openrouter_reader_sends_free_model_fallback_list_and_drops_paid_entries(): void
    {
        config()->set('receipt_scanner.vision.api_keys', ['router-test-key']);
        config()->set('receipt_scanner.vision.model', 'openrouter/free');
        config()->set('receipt_scanner.vision.models', [
            'meta-llama/some-vision:free',
            'openai/gpt-4o-mini',
            'google/gemma-3:free',
        ]);

        \Illuminate\Support\Facades\Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => \Illuminate\Support\Facades\Http::response([
                'choices' => [['message' => ['content' => json_encode([
                    'is_payment_receipt' => true,
                    'provider' => 'gcash',
                    'reference_number' => '1234567890123',
                ])]]],
            ], 200),
        ]);

        $path = tempnam(sys_get_temp_dir(), 'rcpt');
        file_put_contents($path, 'fake-image-bytes');

        try {
            $output = (new \App\Services\Receipts\OpenRouterVisionReader())->read($path, 'image/png');
        } finally {
            @unlink($path);
        }

        $this->assertSame('1234567890123', $output['reference_number']);
        \Illuminate\Support\Facades\Http::assertSent(function ($request) {
            return ($request['model'] ?? null) === 'openrouter/free'
                && ($request['models'] ?? null) === [
                    'openrouter/free',
                    'meta-llama/some-vision:free',
                    'google/gemma-3:free',
                ];
        });
    }

    public function test_openrouter_reader_downscales_images_when_gd_available(): void
    {
        if (!extension_loaded('gd') || !function_exists('imagecreatefromstring')) {
            $this->markTestSkipped('GD not available — downscale is a no-op.');
        }

        config()->set('receipt_scanner.vision.api_keys', ['router-test-key']);
        config()->set('receipt_scanner.vision.model', 'openrouter/free');

        \Illuminate\Support\Facades\Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => \Illuminate\Support\Facades\Http::response([
                'choices' => [['message' => ['content' => json_encode([
                    'is_payment_receipt' => true,
                    'provider' => 'gcash',
                ])]]],
            ], 200),
        ]);

        // 2000px wide PNG → must be re-encoded as <=1024px JPEG.
        $img = imagecreatetruecolor(2000, 100);
        ob_start();
        imagepng($img);
        $bigPng = ob_get_clean();
        imagedestroy($img);

        $path = tempnam(sys_get_temp_dir(), 'rcpt');
        file_put_contents($path, $bigPng);

        try {
            (new \App\Services\Receipts\OpenRouterVisionReader())->read($path, 'image/png');
        } finally {
            @unlink($path);
        }

        \Illuminate\Support\Facades\Http::assertSent(function ($request) {
            $dataUrl = $request['messages'][0]['content'][1]['image_url']['url'] ?? '';
            if (!str_starts_with($dataUrl, 'data:image/jpeg;base64,')) {
                return false;
            }
            $resized = @imagecreatefromstring(base64_decode(substr($dataUrl, strlen('data:image/jpeg;base64,'))));
            return $resized && imagesx($resized) <= 1024;
        });
    }
}
