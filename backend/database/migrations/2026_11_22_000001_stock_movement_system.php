<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stock Movement & Control System.
 *
 * Extends the existing inventory ledger (inventory_logs) with the fields the
 * dedicated Stock In / Stock Out / Return / Reversal workflows need:
 *   - transaction_no       groups multi-item submissions under one reference
 *   - reason_code          machine-readable reason (filterable, indexed)
 *   - original_movement_id links reversals / dispositions to their source log
 *   - reversed_quantity    running total already reversed from the movement
 *
 * Adds two new domains:
 *   - inventory_stock_requests(+_items)  backend-enforced approval queue for
 *     sensitive stock-out reasons (pending requests never touch stock).
 *   - inventory_returns                  customer-product return lifecycle
 *     (inspection -> restock / quarantine / damaged / dispose).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('inventory_logs', 'transaction_no')) {
                $table->string('transaction_no')->nullable()->after('reference_id')->index();
            }
            if (!Schema::hasColumn('inventory_logs', 'reason_code')) {
                $table->string('reason_code')->nullable()->after('transaction_no')->index();
            }
            if (!Schema::hasColumn('inventory_logs', 'original_movement_id')) {
                $table->unsignedBigInteger('original_movement_id')->nullable()->after('reason_code')->index();
            }
            if (!Schema::hasColumn('inventory_logs', 'reversed_quantity')) {
                $table->integer('reversed_quantity')->default(0)->after('original_movement_id');
            }
        });

        Schema::table('inventory_items', function (Blueprint $table) {
            if (!Schema::hasColumn('inventory_items', 'unit')) {
                $table->string('unit', 50)->nullable();
            }
        });

        if (!Schema::hasTable('inventory_stock_requests')) {
            Schema::create('inventory_stock_requests', function (Blueprint $table) {
                $table->id();
                $table->string('request_no')->unique();
                $table->string('transaction_no')->index();
                $table->string('reason_code')->index();
                $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending')->index();
                $table->json('request_payload')->nullable();
                $table->foreignId('requested_by')->constrained('users');
                $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('reviewed_at')->nullable();
                $table->text('review_remarks')->nullable();
                $table->timestamp('executed_at')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('inventory_stock_request_items')) {
            Schema::create('inventory_stock_request_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('request_id')->constrained('inventory_stock_requests')->cascadeOnDelete();
                $table->foreignId('inventory_item_id')->constrained('inventory_items');
                $table->integer('quantity');
                $table->unsignedBigInteger('batch_id')->nullable();
                $table->json('line_details')->nullable();
                $table->unsignedBigInteger('movement_id')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('inventory_returns')) {
            Schema::create('inventory_returns', function (Blueprint $table) {
                $table->id();
                $table->string('return_no')->unique();
                $table->string('source_type')->default('manual'); // sale|customer_order|manual
                $table->unsignedBigInteger('source_id')->nullable();
                $table->foreignId('inventory_item_id')->constrained('inventory_items');
                $table->integer('quantity');
                $table->string('return_reason')->nullable();
                $table->enum('status', ['pending_inspection', 'restocked', 'quarantined', 'damaged', 'disposed'])
                    ->default('pending_inspection')
                    ->index();
                $table->string('disposition')->nullable();
                $table->text('inspection_notes')->nullable();
                $table->string('photo')->nullable();
                $table->foreignId('received_by')->constrained('users');
                $table->foreignId('inspected_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('inspected_at')->nullable();
                $table->unsignedBigInteger('movement_id')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_returns');
        Schema::dropIfExists('inventory_stock_request_items');
        Schema::dropIfExists('inventory_stock_requests');

        Schema::table('inventory_items', function (Blueprint $table) {
            if (Schema::hasColumn('inventory_items', 'unit')) {
                $table->dropColumn('unit');
            }
        });

        Schema::table('inventory_logs', function (Blueprint $table) {
            foreach (['transaction_no', 'reason_code', 'original_movement_id', 'reversed_quantity'] as $column) {
                if (Schema::hasColumn('inventory_logs', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
