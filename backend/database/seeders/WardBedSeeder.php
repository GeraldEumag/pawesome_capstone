<?php

namespace Database\Seeders;

use App\Models\WardBed;
use Illuminate\Database\Seeder;

class WardBedSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * Registered in DatabaseSeeder so migrate:fresh --seed populates the
     * inpatient ward beds used by medical-confinement admission and daily
     * accrual billing. Also safe standalone:
     *   php artisan db:seed --class=WardBedSeeder
     */
    public function run(): void
    {
        $beds = [
            // General ward
            ['name' => 'GEN-A1', 'ward' => 'general', 'is_isolation' => false, 'daily_rate' => 800.00, 'status' => 'available', 'notes' => 'General ward bed A'],
            ['name' => 'GEN-A2', 'ward' => 'general', 'is_isolation' => false, 'daily_rate' => 800.00, 'status' => 'available', 'notes' => 'General ward bed B'],
            ['name' => 'GEN-B1', 'ward' => 'general', 'is_isolation' => false, 'daily_rate' => 800.00, 'status' => 'available', 'notes' => 'General ward bed C'],
            ['name' => 'GEN-B2', 'ward' => 'general', 'is_isolation' => false, 'daily_rate' => 800.00, 'status' => 'available', 'notes' => 'General ward bed D'],
            // ICU
            ['name' => 'ICU-1', 'ward' => 'icu', 'is_isolation' => false, 'daily_rate' => 1500.00, 'status' => 'available', 'notes' => 'Intensive care unit bed 1'],
            ['name' => 'ICU-2', 'ward' => 'icu', 'is_isolation' => false, 'daily_rate' => 1500.00, 'status' => 'available', 'notes' => 'Intensive care unit bed 2'],
            // Isolation
            ['name' => 'ISO-1', 'ward' => 'isolation', 'is_isolation' => true, 'daily_rate' => 1200.00, 'status' => 'available', 'notes' => 'Isolation ward bed 1'],
            ['name' => 'ISO-2', 'ward' => 'isolation', 'is_isolation' => true, 'daily_rate' => 1200.00, 'status' => 'available', 'notes' => 'Isolation ward bed 2'],
            // Recovery
            ['name' => 'REC-1', 'ward' => 'recovery', 'is_isolation' => false, 'daily_rate' => 600.00, 'status' => 'available', 'notes' => 'Recovery ward bed 1'],
            ['name' => 'REC-2', 'ward' => 'recovery', 'is_isolation' => false, 'daily_rate' => 600.00, 'status' => 'available', 'notes' => 'Recovery ward bed 2'],
        ];

        foreach ($beds as $bed) {
            WardBed::updateOrCreate(['name' => $bed['name']], $bed);
        }

        $this->command?->info('Ward beds seeded successfully!');
    }
}
