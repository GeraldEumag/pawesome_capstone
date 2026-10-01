<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * super_admin has been merged into admin — the admin role now has
     * all-staff-module access, so a separate composite admin role is
     * redundant.
     *
     * - super_admin rows are converted to admin rather than deleted —
     *   referenced rows (e.g. sales.cashier_id FK) cannot be removed.
     *   The seeded demo account is additionally deactivated.
     * - Role-targeted notifications aimed at super_admin are re-pointed
     *   at admin so nothing is orphaned.
     */
    public function up(): void
    {
        DB::table('users')->where('role', 'super_admin')->update(['role' => 'admin']);

        DB::table('users')->where('email', 'super_admin@example.com')->update(['is_active' => false]);

        DB::table('notifications')->where('role', 'super_admin')->update(['role' => 'admin']);
    }

    public function down(): void
    {
        // No-op: merged roles and deactivated accounts cannot be restored safely.
    }
};
