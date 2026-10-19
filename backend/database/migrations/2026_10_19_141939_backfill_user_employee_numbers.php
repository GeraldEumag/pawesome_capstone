<?php

use App\Models\Employee;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Assign unified PAW-xxxx employee numbers to staff accounts created
     * before the User::creating auto-assign hook existed, so every staff
     * member can be issued an attendance-kiosk barcode / ID card.
     */
    public function up(): void
    {
        DB::table('users')
            ->whereNull('employee_no')
            ->where('role', '!=', 'customer')
            ->chunkById(100, function ($users) {
                foreach ($users as $user) {
                    DB::table('users')
                        ->where('id', $user->id)
                        ->update(['employee_no' => Employee::nextEmployeeNo()]);
                }
            });
    }

    /**
     * Backfilled numbers are indistinguishable from hook-assigned ones;
     * reversing would strip valid kiosk codes, so down() is intentionally a no-op.
     */
    public function down(): void
    {
        //
    }
};
