<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Service-side settlement ledger.
 *
 * One immutable header row per settlement event plus normalized line items.
 * This table is additive audit infrastructure: sales/payments/invoices remain
 * the source of truth for POS transactions, and payment_status on service
 * records remains the operational mirror. Nothing here backfills, alters or
 * deletes existing financial data.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_settlements', function (Blueprint $table) {
            $table->id();
            $table->string('settleable_type', 50);
            $table->unsignedBigInteger('settleable_id');
            $table->unsignedBigInteger('customer_id')->nullable()->index();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->decimal('amount', 12, 2);
            $table->char('currency', 3)->default('PHP');
            $table->enum('status', ['paid', 'voided', 'refunded'])->default('paid');
            $table->string('payment_method', 50)->nullable();
            $table->string('reference_number')->nullable();
            $table->string('receipt_number')->nullable()->unique();
            $table->unsignedBigInteger('verified_by')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('voided_at')->nullable();
            $table->unsignedBigInteger('voided_by')->nullable();
            $table->string('void_reason')->nullable();
            $table->string('idempotency_key')->unique();
            $table->timestamps();

            $table->index(['settleable_type', 'settleable_id']);
        });

        Schema::create('payment_settlement_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_settlement_id')
                ->constrained('payment_settlements')
                ->onDelete('cascade');
            $table->foreignId('service_item_usage_id')
                ->nullable()
                ->constrained('service_item_usages')
                ->nullOnDelete();
            $table->string('description');
            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('total_price', 12, 2);
            $table->timestamps();

            $table->index('payment_settlement_id');
            $table->index('service_item_usage_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_settlement_items');
        Schema::dropIfExists('payment_settlements');
    }
};
