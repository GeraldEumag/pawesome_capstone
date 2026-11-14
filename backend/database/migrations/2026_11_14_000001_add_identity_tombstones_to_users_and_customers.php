<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Soft-deleted users/customers kept their email/username/employee_no under
 * the DB unique indexes, so a deleted account could never be re-registered
 * with the same email ("already taken" even though it was deleted).
 *
 * This adds original_* columns that preserve the real identity for the
 * audit trail and the admin restore path, and backfills every row that is
 * already soft-deleted: the live columns get deterministic tombstone
 * values so the unique indexes release the real ones.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('original_email')->nullable()->after('email');
            $table->string('original_username')->nullable()->after('username');
            $table->string('original_employee_no', 20)->nullable()->after('employee_no');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->string('original_email')->nullable()->after('email');
        });

        // Free unique values held by rows that were already soft-deleted.
        DB::table('users')->whereNotNull('deleted_at')->orderBy('id')
            ->get(['id', 'email', 'username', 'employee_no'])
            ->each(function ($u) {
                DB::table('users')->where('id', $u->id)->update([
                    'original_email'       => $u->email,
                    'original_username'    => $u->username,
                    'original_employee_no' => $u->employee_no,
                    'email'                => "deleted_{$u->id}@users.invalid",
                    'username'             => $u->username ? "deleted_{$u->id}" : null,
                    'employee_no'          => $u->employee_no ? "DEL-{$u->id}" : null,
                ]);
            });

        DB::table('customers')->whereNotNull('deleted_at')->orderBy('id')
            ->get(['id', 'email'])
            ->each(function ($c) {
                DB::table('customers')->where('id', $c->id)->update([
                    'original_email' => $c->email,
                    'email'          => "deleted_{$c->id}@customers.invalid",
                ]);
            });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['original_email', 'original_username', 'original_employee_no']);
        });
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('original_email');
        });
    }
};
