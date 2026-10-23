<?php

use App\Support\VisitStatusMap;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase B: patient-care visit flow.
 *
 * Adds intake/triage columns to appointments and migrates the legacy status
 * vocabulary to the new one. Every changed row is recorded in
 * appointment_status_rollback_map so down() restores the exact prior statuses.
 */
return new class extends Migration
{
    private const MAP_TABLE = 'appointment_status_rollback_map';

    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->string('triage_level', 20)->nullable()->after('status');
            $table->text('triage_notes')->nullable()->after('triage_level');
            $table->timestamp('checked_in_at')->nullable()->after('started_at');
            $table->unsignedBigInteger('checked_in_by')->nullable()->after('checked_in_at');
            $table->timestamp('triaged_at')->nullable()->after('checked_in_by');
            $table->unsignedBigInteger('triaged_by')->nullable()->after('triaged_at');
            $table->timestamp('clinical_completed_at')->nullable()->after('triaged_by');
            $table->unsignedBigInteger('clinical_completed_by')->nullable()->after('clinical_completed_at');
            $table->timestamp('checked_out_at')->nullable()->after('clinical_completed_by');
            $table->unsignedBigInteger('checked_out_by')->nullable()->after('checked_out_at');
            $table->string('outcome', 40)->nullable()->after('completed_at');
            $table->boolean('emergency')->default(false)->after('outcome');
            $table->boolean('confinement_recommended')->default(false)->after('emergency');
            $table->boolean('follow_up_required')->default(false)->after('confinement_recommended');
            $table->date('follow_up_due')->nullable()->after('follow_up_required');
        });

        Schema::create(self::MAP_TABLE, function (Blueprint $table) {
            $table->unsignedBigInteger('appointment_id')->primary();
            $table->string('old_status', 40);
            $table->boolean('old_confinement_recommended')->default(false);
        });

        $counts = VisitStatusMap::migrate(self::MAP_TABLE);
        if ($counts) {
            $summary = collect($counts)->map(fn ($n, $from) => "{$from}={$n}")->implode(', ');
            // Surface the remap in migration output when run via CLI.
            $err = defined('STDERR') ? STDERR : fopen('php://stderr', 'w');
            fwrite($err, "[Phase B] appointment status remap: {$summary}\n");
        }
    }

    public function down(): void
    {
        if (Schema::hasTable(self::MAP_TABLE)) {
            VisitStatusMap::rollback(self::MAP_TABLE);
            Schema::drop(self::MAP_TABLE);
        }

        Schema::table('appointments', function (Blueprint $table) {
            $table->dropColumn([
                'triage_level', 'triage_notes', 'checked_in_at', 'checked_in_by',
                'triaged_at', 'triaged_by',
                'clinical_completed_at', 'clinical_completed_by',
                'checked_out_at', 'checked_out_by',
                'outcome', 'emergency', 'confinement_recommended',
                'follow_up_required', 'follow_up_due',
            ]);
        });
    }
};
