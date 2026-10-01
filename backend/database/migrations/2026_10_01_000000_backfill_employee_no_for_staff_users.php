<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Backfill employee_no for staff users that already existed before the
     * User::creating auto-assign hook and the original backfill ran — e.g.
     * accounts kept across seeds via updateOrCreate (update path never fires
     * `creating`). Without a number, ID cards and the attendance kiosk have
     * no barcode/QR to encode or scan.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'employee_no')) {
            return;
        }

        $staffRoles = [
            'admin', 'super_admin', 'manager', 'cashier', 'receptionist',
            'super_receptionist', 'inventory', 'veterinary', 'payroll',
            'staff', 'groomer', 'vet', 'veterinarian',
        ];

        $next = $this->nextNumber() + 1;

        DB::table('users')
            ->whereNull('employee_no')
            ->whereIn('role', $staffRoles)
            ->orderBy('id')
            ->each(function ($user) use (&$next) {
                DB::table('users')
                    ->where('id', $user->id)
                    ->update(['employee_no' => 'PAW-' . str_pad($next++, 4, '0', STR_PAD_LEFT)]);
            });
    }

    public function down(): void
    {
        // No-op: employee numbers are business data; rolling back would
        // silently strip identifiers from printed ID cards.
    }

    private function nextNumber(): int
    {
        $maxUser = DB::table('users')
            ->whereNotNull('employee_no')
            ->where('employee_no', 'like', 'PAW-%')
            ->selectRaw('MAX(CAST(SUBSTRING(employee_no, 5) AS UNSIGNED)) as max_no')
            ->value('max_no');

        $maxEmployee = 0;
        if (Schema::hasTable('employees')) {
            $maxEmployee = DB::table('employees')
                ->where('employee_no', 'like', 'PAW-%')
                ->selectRaw('MAX(CAST(SUBSTRING(employee_no, 5) AS UNSIGNED)) as max_no')
                ->value('max_no');
        }

        return max((int) $maxUser, (int) $maxEmployee);
    }
};
