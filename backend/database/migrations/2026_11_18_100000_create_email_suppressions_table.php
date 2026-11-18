<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Recipient-level suppression list, keyed by the same HMAC fingerprint
     * used on email_deliveries (no plaintext addresses at rest).
     *
     * Rows are written by the provider webhook on hard bounce, invalid
     * recipient, provider block, or spam complaint — and may be added
     * manually by an operator. EmailDeliveryService::send() refuses to
     * send to a fingerprint with an active (unreleased) suppression row;
     * the reason column scopes the suppression so a spam complaint still
     * permits account-recovery mail while a hard bounce suppresses
     * everything.
     */
    public function up(): void
    {
        Schema::create('email_suppressions', function (Blueprint $table) {
            $table->id();
            $table->string('fingerprint', 64)->unique();
            $table->string('reason', 32);
            $table->unsignedBigInteger('source_delivery_id')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->timestamps();

            $table->index(['fingerprint', 'released_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_suppressions');
    }
};
