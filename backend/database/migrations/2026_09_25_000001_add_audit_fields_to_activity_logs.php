<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add actor-role snapshot and before/after change payload so audit records
     * stay accurate even when the actor's role later changes.
     */
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->string('actor_role')->nullable()->after('user_id');
            $table->json('changes')->nullable()->after('metadata');
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropColumn(['actor_role', 'changes']);
        });
    }
};
