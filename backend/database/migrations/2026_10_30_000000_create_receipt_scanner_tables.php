<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_receipts', function (Blueprint $table) {
            $table->id();
            $table->string('payable_type', 50);
            $table->unsignedBigInteger('payable_id');
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('disk', 20)->default('private');
            $table->string('disk_path');
            $table->string('mime', 100)->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->char('sha256', 64);
            $table->string('phash', 32)->nullable();
            $table->string('provider', 20)->nullable();
            $table->string('submitted_reference')->nullable();
            $table->string('idempotency_key', 100)->nullable();
            $table->string('status', 20)->default('uploaded');
            $table->text('reject_reason')->nullable();
            $table->timestamps();

            $table->index(['payable_type', 'payable_id'], 'payment_receipts_payable_idx');
            $table->index('sha256', 'payment_receipts_sha256_idx');
            $table->index('phash', 'payment_receipts_phash_idx');
            $table->index('status', 'payment_receipts_status_idx');
            $table->unique(['payable_type', 'payable_id', 'idempotency_key'], 'payment_receipts_idem_uniq');
        });

        Schema::create('receipt_extractions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receipt_id')->constrained('payment_receipts')->cascadeOnDelete();
            $table->string('reader', 20);
            $table->string('reader_version', 100)->nullable();
            $table->string('provider', 20)->nullable();
            $table->string('transaction_type', 30)->nullable();
            $table->string('reference_raw')->nullable();
            $table->string('reference_normalized')->nullable();
            $table->decimal('amount', 12, 2)->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->string('status_text')->nullable();
            $table->string('recipient_name')->nullable();
            $table->string('recipient_last4', 8)->nullable();
            $table->string('sender_name')->nullable();
            $table->string('image_quality', 10)->nullable();
            $table->json('confidence_json')->nullable();
            $table->json('raw_response_json')->nullable();
            $table->unsignedInteger('latency_ms')->nullable();
            $table->timestamps();

            $table->index('receipt_id', 'receipt_extractions_receipt_idx');
        });

        Schema::create('receipt_validations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receipt_id')->constrained('payment_receipts')->cascadeOnDelete();
            $table->string('rule', 40);
            $table->string('result', 10);
            $table->text('detail')->nullable();
            $table->timestamps();

            $table->index(['receipt_id', 'rule'], 'receipt_validations_rule_idx');
        });

        Schema::create('receipt_corrections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receipt_id')->constrained('payment_receipts')->cascadeOnDelete();
            $table->string('field', 40);
            $table->string('old_value')->nullable();
            $table->string('new_value')->nullable();
            $table->foreignId('corrected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('receipt_id', 'receipt_corrections_receipt_idx');
        });

        // Written only at confirm time, inside the payment verification
        // transaction — the unique key is the final duplicate safeguard when
        // two cashiers confirm at once.
        Schema::create('payment_references', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 20);
            $table->string('reference_normalized');
            $table->string('payable_type', 50);
            $table->unsignedBigInteger('payable_id');
            $table->foreignId('receipt_id')->nullable()->constrained('payment_receipts')->nullOnDelete();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamps();

            $table->unique(['provider', 'reference_normalized'], 'payment_references_uniq');
            $table->index(['payable_type', 'payable_id'], 'payment_references_payable_idx');
        });

        Schema::create('provider_configs', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 20)->unique();
            $table->string('reference_pattern')->nullable();
            $table->unsignedTinyInteger('min_length')->nullable();
            $table->unsignedTinyInteger('max_length')->nullable();
            $table->json('reference_labels')->nullable();
            $table->json('accepted_status_texts')->nullable();
            $table->json('confusion_map')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('clinic_payment_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 20);
            $table->string('account_name');
            $table->string('account_last4', 8)->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['provider', 'active'], 'clinic_accounts_provider_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinic_payment_accounts');
        Schema::dropIfExists('provider_configs');
        Schema::dropIfExists('payment_references');
        Schema::dropIfExists('receipt_corrections');
        Schema::dropIfExists('receipt_validations');
        Schema::dropIfExists('receipt_extractions');
        Schema::dropIfExists('payment_receipts');
    }
};
