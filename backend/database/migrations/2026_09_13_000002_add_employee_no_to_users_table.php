<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Unified employee number used by the attendance kiosk barcode.
     * Backfills existing staff users so their IDs keep working.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'employee_no')) {
                $table->string('employee_no', 20)->nullable()->unique()->after('id');
            }
        });

        // Backfill staff users (non-customers) that do not have one yet.
        $staffRoles = [
            'admin', 'super_admin', 'manager', 'cashier', 'receptionist',
            'super_receptionist', 'inventory', 'veterinary', 'payroll',
            'staff', 'groomer', 'vet', 'veterinarian',
        ];

        DB::table('users')
            ->whereNull('employee_no')
            ->whereIn('role', $staffRoles)
            ->orderBy('id')
            ->each(function ($user) {
                DB::table('users')
                    ->where('id', $user->id)
                    ->update(['employee_no' => 'PAW-' . str_pad($user->id, 4, '0', STR_PAD_LEFT)]);
            });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'employee_no')) {
                $table->dropUnique(['employee_no']);
                $table->dropColumn('employee_no');
            }
        });
    }
};
