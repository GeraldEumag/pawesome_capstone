<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase E: follow-up and hardening.
 *
 * - idempotency_keys: client-supplied Idempotency-Key for retry-unsafe POST
 *   actions (consultation start, confinement recommendation, cashier
 *   payment). Replays return the stored response; a key reused with a
 *   different payload is rejected 409.
 * - recall_dispatches: dedupe ledger for the recall scheduler (vaccine due,
 *   post-discharge check). A row proves a recall notification was sent, so
 *   re-runs never spam the owner twice for the same due date.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('idempotency_keys')) {
            Schema::create('idempotency_keys', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('key', 128);
                $table->string('method', 10);
                $table->string('route', 255);
                $table->string('request_hash', 64);
                $table->unsignedSmallInteger('response_status');
                $table->mediumText('response_body');
                $table->timestamps();

                $table->unique(['user_id', 'key', 'route'], 'idempotency_keys_user_key_route_unique');
            });
        }

        if (!Schema::hasTable('recall_dispatches')) {
            Schema::create('recall_dispatches', function (Blueprint $table) {
                $table->id();
                $table->string('kind', 40); // vaccine_due|post_discharge_check|medication_end
                $table->unsignedBigInteger('ref_id'); // vaccination.id / medical_confinement.id
                $table->date('due_date')->nullable();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('notification_id')->nullable()->constrained('notifications')->nullOnDelete();
                $table->timestamp('sent_at');
                $table->timestamps();

                $table->unique(['kind', 'ref_id', 'due_date'], 'recall_dispatches_kind_ref_due_unique');
                $table->index(['kind', 'sent_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('recall_dispatches');
        Schema::dropIfExists('idempotency_keys');
    }
};
