<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            if (!Schema::hasColumn('attendance', 'source')) {
                $table->enum('source', ['web', 'fingerprint_terminal', 'biometric', 'manual'])->default('web')->after('status');
            }
            if (!Schema::hasColumn('attendance', 'biometric_id')) {
                $table->string('biometric_id')->nullable()->after('source');
            }
            if (!Schema::hasColumn('attendance', 'terminal_id')) {
                $table->string('terminal_id')->nullable()->after('biometric_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->dropColumn(['source', 'biometric_id', 'terminal_id']);
        });
    }
};
