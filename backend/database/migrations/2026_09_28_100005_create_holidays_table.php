<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->string('name');
            $table->enum('type', ['regular', 'special_non_working'])->default('regular');
            $table->smallInteger('year');
            $table->boolean('is_recurring')->default(false)
                  ->comment('True for fixed-date holidays that repeat every year (e.g. New Year)');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['date', 'name'], 'holidays_date_name_unique');
            $table->index(['year', 'type']);
        });

        // Seed 2026 Philippine holidays
        $this->seed2026Holidays();
    }

    private function seed2026Holidays(): void
    {
        $now = now();
        $holidays = [
            // Regular holidays
            ['2026-01-01', "New Year's Day",                         'regular',              true],
            ['2026-04-09', 'Araw ng Kagitingan (Bataan and Corregidor Day)', 'regular',      false],
            ['2026-04-02', 'Maundy Thursday',                        'regular',              false],
            ['2026-04-03', 'Good Friday',                            'regular',              false],
            ['2026-05-01', "Labor Day",                              'regular',              true],
            ['2026-06-12', 'Independence Day',                       'regular',              true],
            ['2026-08-31', 'National Heroes Day',                    'regular',              false],
            ['2026-11-30', 'Bonifacio Day',                          'regular',              true],
            ['2026-12-25', 'Christmas Day',                          'regular',              true],
            ['2026-12-30', 'Rizal Day',                              'regular',              true],
            // Special non-working holidays
            ['2026-02-25', 'EDSA People Power Revolution Anniversary', 'special_non_working', true],
            ['2026-08-21', 'Ninoy Aquino Day',                       'special_non_working',  true],
            ['2026-11-01', "All Saints' Day",                        'special_non_working',  true],
            ['2026-11-02', "All Souls' Day",                         'special_non_working',  false],
            ['2026-12-08', 'Feast of the Immaculate Conception',     'special_non_working',  true],
            ['2026-12-24', 'Christmas Eve',                          'special_non_working',  false],
            ['2026-12-31', 'Last Day of the Year',                   'special_non_working',  false],
        ];

        foreach ($holidays as [$date, $name, $type, $recurring]) {
            DB::table('holidays')->insertOrIgnore([
                'date'         => $date,
                'name'         => $name,
                'type'         => $type,
                'year'         => (int) substr($date, 0, 4),
                'is_recurring' => $recurring,
                'created_at'   => $now,
                'updated_at'   => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('holidays');
    }
};
