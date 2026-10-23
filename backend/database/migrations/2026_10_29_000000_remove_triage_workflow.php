<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Triage removal: the intake pipeline collapses to check-in only.
 *
 * Visits parked in the removed statuses are folded back to checked_in so
 * they remain startable. The triage columns are dropped — no code writes
 * them anymore.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('appointments')
            ->whereIn('status', ['in_triage', 'waiting_for_vet'])
            ->update([
                'status' => 'checked_in',
                'checked_in_at' => DB::raw('COALESCE(checked_in_at, NOW())'),
            ]);

        Schema::table('appointments', function (Blueprint $table) {
            $table->dropColumn(['triage_level', 'triage_notes', 'triaged_at', 'triaged_by']);
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->string('triage_level', 20)->nullable()->after('status');
            $table->text('triage_notes')->nullable()->after('triage_level');
            $table->timestamp('triaged_at')->nullable()->after('checked_in_by');
            $table->unsignedBigInteger('triaged_by')->nullable()->after('triaged_at');
        });
    }
};
