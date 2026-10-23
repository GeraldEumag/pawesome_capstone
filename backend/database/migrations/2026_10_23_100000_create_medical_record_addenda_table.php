<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medical_records', function (Blueprint $table) {
            $table->timestamp('finalized_at')->nullable()->after('status');
            $table->foreignId('finalized_by')->nullable()->after('finalized_at')->constrained('users')->nullOnDelete();
            $table->string('content_hash', 64)->nullable()->after('finalized_by');
        });

        Schema::create('medical_record_addenda', function (Blueprint $table) {
            $table->id();
            $table->foreignId('medical_record_id')->constrained('medical_records')->cascadeOnDelete();
            $table->foreignId('author_id')->constrained('users')->restrictOnDelete();
            $table->text('body');
            $table->string('content_hash', 64);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('medical_record_addenda');

        Schema::table('medical_records', function (Blueprint $table) {
            $table->dropForeign(['finalized_by']);
            $table->dropColumn(['finalized_at', 'finalized_by', 'content_hash']);
        });
    }
};
