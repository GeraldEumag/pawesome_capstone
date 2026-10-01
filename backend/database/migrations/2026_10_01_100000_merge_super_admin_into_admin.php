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
     * - The seeded demo account (super_admin@example.com) is deleted.
     * - Any other super_admin rows are converted to admin rather than
     *   deleted, so a populated database can't strand a staff account.
     * - Role-targeted notifications aimed at super_admin are re-pointed
     *   at admin so nothing is orphaned.
     */
    public function up(): void
    {
        DB::table('users')->where('email', 'super_admin@example.com')->delete();

        DB::table('users')->where('role', 'super_admin')->update(['role' => 'admin']);

        DB::table('notifications')->where('role', 'super_admin')->update(['role' => 'admin']);
    }

    public function down(): void
    {
        // No-op: deleted accounts and merged roles cannot be restored safely.
    }
};
