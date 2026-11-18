<?php

use Database\Seeders\WardBedSeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/**
 * Reference data for inpatient ward beds. Runs on `php artisan migrate --force`
 * (the Railway preDeployCommand) so confinement admission has beds to assign
 * in every environment without a manual seed step. Idempotent — WardBedSeeder
 * upserts by bed name.
 */
return new class extends Migration
{
    private const SEEDED_NAMES = [
        'GEN-A1', 'GEN-A2', 'GEN-B1', 'GEN-B2',
        'ICU-1', 'ICU-2',
        'ISO-1', 'ISO-2',
        'REC-1', 'REC-2',
    ];

    public function up(): void
    {
        if (app()->environment('testing')) {
            return;
        }

        Artisan::call('db:seed', ['--class' => WardBedSeeder::class, '--force' => true]);
    }

    public function down(): void
    {
        DB::table('ward_beds')->whereIn('name', self::SEEDED_NAMES)->delete();
    }
};
