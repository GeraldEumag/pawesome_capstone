<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_billing_payment_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appointment_id')->constrained('appointments')->restrictOnDelete();
            $table->foreignId('service_request_id')->nullable()->constrained('service_requests')->nullOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
            $table->string('customer_name')->nullable();
            $table->string('customer_email')->nullable();
            $table->string('pet_name')->nullable();
            $table->string('service_name')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('amount_due', 12, 2);
            $table->char('invoice_version', 64);
            $table->string('payment_channel', 20);
            $table->string('payment_method', 30)->nullable();
            $table->string('payment_reference')->nullable();
            $table->string('payment_proof')->nullable();
            $table->string('status', 32)->default('awaiting_cashier');
            $table->string('receipt_number')->nullable()->unique();
            $table->text('rejection_reason')->nullable();
            $table->text('cashier_remarks')->nullable();
            $table->decimal('cash_received', 12, 2)->nullable();
            $table->decimal('change_amount', 12, 2)->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'status']);
            $table->index(['appointment_id', 'status']);
            $table->index(['payment_channel', 'status']);
        });

        Schema::create('service_billing_payment_request_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_request_id');
            $table->foreign('payment_request_id', 'sbpri_request_fk')
                ->references('id')
                ->on('service_billing_payment_requests')
                ->cascadeOnDelete();
            $table->foreignId('service_item_usage_id')->nullable();
            $table->foreign('service_item_usage_id', 'sbpri_service_item_fk')
                ->references('id')
                ->on('service_item_usages')
                ->nullOnDelete();
            $table->string('item_type', 50)->nullable();
            $table->string('description');
            $table->unsignedInteger('quantity')->default(1);
            $table->string('unit', 50)->nullable();
            $table->decimal('unit_price', 12, 2);
            $table->decimal('total_price', 12, 2);
            $table->boolean('is_discount')->default(false);
            $table->timestamps();

            $table->index('payment_request_id', 'sbpri_request_idx');
            $table->index('service_item_usage_id', 'sbpri_item_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_billing_payment_request_items');
        Schema::dropIfExists('service_billing_payment_requests');
    }
};
