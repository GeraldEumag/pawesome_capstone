<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Durable email-delivery outbox.
     *
     * Business transactions record a delivery intent here; committed
     * intents are claimed by queue workers and sent through Laravel Mail.
     * Dispatch progress and provider outcomes are tracked separately —
     * queued/sent is never conflated with accepted or delivered.
     */
    public function up(): void
    {
        Schema::create('email_deliveries', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('event_key', 120);
            $table->string('occurrence_key', 191);
            $table->string('source_type', 80)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->text('recipient_email');
            $table->string('recipient_fingerprint', 64)->index();
            $table->longText('payload');
            $table->longText('suppression')->nullable();
            $table->string('status', 24)->default('pending')->index();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->unsignedSmallInteger('max_attempts')->default(4);
            $table->timestamp('next_attempt_at')->nullable()->index();
            $table->timestamp('locked_at')->nullable();
            $table->string('locked_by', 80)->nullable();
            $table->timestamp('dispatched_at')->nullable();
            $table->timestamp('last_attempt_at')->nullable();
            $table->string('provider_message_id')->nullable();
            $table->string('provider_status', 24)->nullable();
            $table->string('failure_class', 24)->nullable();
            $table->string('failure_code', 80)->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->unique(['event_key', 'occurrence_key'], 'email_deliveries_occurrence_unique');
            $table->index(['status', 'next_attempt_at']);
            $table->index(['source_type', 'source_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_deliveries');
    }
};
