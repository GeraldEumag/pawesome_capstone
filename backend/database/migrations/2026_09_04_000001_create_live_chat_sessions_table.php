<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('live_chat_sessions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('customer_name');
            $table->string('customer_email')->nullable();
            $table->enum('status', ['waiting', 'active', 'closed'])->default('waiting');
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->foreign('customer_id')->references('id')->on('users')->onDelete('set null');
            $table->foreign('assigned_to')->references('id')->on('users')->onDelete('set null');
            $table->index(['status', 'last_message_at']);
            $table->index('customer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_chat_sessions');
    }
};
