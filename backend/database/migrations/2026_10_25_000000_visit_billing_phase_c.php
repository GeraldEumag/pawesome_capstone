<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Estimates ────────────────────────────────────────────────
        Schema::create('visit_estimates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appointment_id')->constrained('appointments')->cascadeOnDelete();
            $table->unsignedInteger('version')->default(1);
            $table->enum('status', ['draft', 'presented', 'approved', 'rejected', 'changes_requested'])
                ->default('draft');
            $table->decimal('subtotal', 12, 2)->default(0);
            // Server-side ceiling used for the re-approval threshold check.
            $table->decimal('approved_total', 12, 2)->nullable();
            $table->decimal('threshold_percent', 5, 2)->default(20.00);
            $table->enum('channel', ['portal', 'counter'])->nullable();
            $table->unsignedBigInteger('approved_by_user_id')->nullable();
            $table->unsignedBigInteger('approved_by_customer_id')->nullable();
            $table->timestamp('presented_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            // One live estimate per visit.
            $table->unique('appointment_id');
        });

        Schema::create('visit_estimate_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('visit_estimate_id')->constrained('visit_estimates')->cascadeOnDelete();
            $table->string('item_type', 40)->default('service');
            $table->string('description');
            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('unit_price', 12, 2)->default(0);
            $table->decimal('line_total', 12, 2)->default(0);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // ── Consents ─────────────────────────────────────────────────
        Schema::create('visit_consents', function (Blueprint $table) {
            $table->id();
            // Morph target: appointment or medical_confinement.
            $table->string('consentable_type', 60);
            $table->unsignedBigInteger('consentable_id');
            $table->string('type', 60);
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('signer_name');
            $table->string('signer_relationship', 60)->default('owner');
            $table->enum('channel', ['portal', 'counter'])->default('counter');
            $table->unsignedBigInteger('signed_by_user_id')->nullable();
            $table->timestamp('signed_at');
            $table->enum('status', ['signed', 'revoked'])->default('signed');
            $table->timestamp('revoked_at')->nullable();
            $table->unsignedBigInteger('revoked_by')->nullable();
            $table->string('revoke_reason')->nullable();
            $table->timestamps();

            $table->index(['consentable_type', 'consentable_id']);
        });

        // ── Diagnostics ──────────────────────────────────────────────
        Schema::create('diagnostic_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appointment_id')->constrained('appointments')->cascadeOnDelete();
            $table->string('code', 30)->unique();
            $table->enum('order_type', ['lab', 'imaging', 'other'])->default('lab');
            $table->string('name');
            $table->enum('priority', ['routine', 'urgent', 'stat'])->default('routine');
            $table->enum('status', ['ordered', 'collected', 'resulted', 'reviewed', 'cancelled'])
                ->default('ordered');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('ordered_by')->nullable();
            $table->timestamp('ordered_at')->nullable();
            $table->unsignedBigInteger('collected_by')->nullable();
            $table->timestamp('collected_at')->nullable();
            $table->unsignedBigInteger('resulted_by')->nullable();
            $table->timestamp('resulted_at')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->unsignedBigInteger('cancelled_by')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason')->nullable();
            $table->timestamps();

            $table->index(['appointment_id', 'status']);
        });

        Schema::create('diagnostic_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('diagnostic_order_id')->constrained('diagnostic_orders')->cascadeOnDelete();
            $table->text('findings')->nullable();
            $table->string('attachment_path')->nullable();
            $table->boolean('is_abnormal')->default(false);
            $table->unsignedBigInteger('resulted_by')->nullable();
            $table->timestamps();
        });

        // ── Visit invoice ────────────────────────────────────────────
        Schema::create('visit_invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_number', 30)->unique();
            // Morph target: appointment (confinement invoices can be added later).
            $table->string('invoiceable_type', 60);
            $table->unsignedBigInteger('invoiceable_id');
            $table->unsignedBigInteger('customer_id')->nullable()->index();
            $table->enum('status', ['open', 'partially_paid', 'settled', 'voided'])->default('open');
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('discount_total', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->decimal('amount_paid', 12, 2)->default(0);
            $table->decimal('balance_due', 12, 2)->default(0);
            // Hash of the canonical line set — used for stale-write detection.
            $table->string('version_hash', 64)->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->timestamp('voided_at')->nullable();
            $table->unsignedBigInteger('voided_by')->nullable();
            $table->string('void_reason')->nullable();
            $table->timestamps();

            $table->unique(['invoiceable_type', 'invoiceable_id']);
        });

        Schema::create('visit_invoice_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('visit_invoice_id')->constrained('visit_invoices')->cascadeOnDelete();
            // Link back to the operational charge row the line mirrors.
            $table->unsignedBigInteger('service_item_usage_id')->nullable();
            $table->string('item_type', 40);
            $table->string('description');
            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('unit_price', 12, 2)->default(0);
            $table->decimal('line_total', 12, 2)->default(0);
            $table->boolean('is_billable')->default(true);
            $table->boolean('is_paid')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['visit_invoice_id', 'service_item_usage_id'], 'vil_invoice_usage_unique');
        });

        Schema::create('visit_invoice_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('visit_invoice_id')->constrained('visit_invoices')->cascadeOnDelete();
            $table->enum('type', ['discount', 'waiver', 'write_off', 'credit_note']);
            $table->decimal('amount', 12, 2);
            $table->string('reason_code', 60);
            $table->text('notes')->nullable();
            $table->enum('status', ['pending', 'approved', 'rejected', 'applied'])->default('pending');
            $table->unsignedBigInteger('requested_by')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('applied_at')->nullable();
            // The service_item_usages row created when the adjustment applies.
            $table->unsignedBigInteger('service_item_usage_id')->nullable();
            $table->timestamps();
        });

        Schema::table('payment_settlements', function (Blueprint $table) {
            $table->unsignedBigInteger('visit_invoice_id')->nullable()->after('settleable_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('payment_settlements', function (Blueprint $table) {
            $table->dropIndex(['visit_invoice_id']);
            $table->dropColumn('visit_invoice_id');
        });

        Schema::dropIfExists('visit_invoice_adjustments');
        Schema::dropIfExists('visit_invoice_lines');
        Schema::dropIfExists('visit_invoices');
        Schema::dropIfExists('diagnostic_results');
        Schema::dropIfExists('diagnostic_orders');
        Schema::dropIfExists('visit_consents');
        Schema::dropIfExists('visit_estimate_lines');
        Schema::dropIfExists('visit_estimates');
    }
};
