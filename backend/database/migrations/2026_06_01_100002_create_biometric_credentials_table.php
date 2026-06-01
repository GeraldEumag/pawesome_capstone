<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('biometric_credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('credential_id')->unique(); // base64url encoded rawId
            $table->text('public_key')->nullable(); // for full verification
            $table->enum('type', ['fingerprint', 'face', 'pin'])->default('fingerprint');
            $table->string('device_name')->nullable();
            $table->string('device_id')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_credentials');
    }
};
