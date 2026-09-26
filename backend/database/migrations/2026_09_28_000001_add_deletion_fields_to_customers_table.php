<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            // The model fillable, receptionist create/update validation, and the
            // profile form all use `notes` — but no migration ever added it.
            if (!Schema::hasColumn('customers', 'notes')) {
                $table->text('notes')->nullable();
            }
            $table->string('deletion_reason', 500)->nullable();
            $table->foreignId('deleted_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('deleted_by');
            $table->dropColumn('deletion_reason');
        });
    }
};
