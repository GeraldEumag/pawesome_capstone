<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('live_chat_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('session_id');
            $table->enum('sender_type', ['customer', 'staff', 'system']);
            $table->unsignedBigInteger('sender_id')->nullable();
            $table->string('sender_name');
            $table->text('message');
            $table->boolean('is_read_by_staff')->default(false);
            $table->boolean('is_read_by_customer')->default(false);
            $table->timestamps();

            $table->foreign('session_id')->references('id')->on('live_chat_sessions')->onDelete('cascade');
            $table->foreign('sender_id')->references('id')->on('users')->onDelete('set null');
            $table->index(['session_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_chat_messages');
    }
};
