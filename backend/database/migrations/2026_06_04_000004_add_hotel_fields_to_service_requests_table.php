<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('service_requests')) {
            Schema::table('service_requests', function (Blueprint $table) {
                if (!Schema::hasColumn('service_requests', 'check_out_date')) {
                    $table->date('check_out_date')->nullable()->after('request_date');
                }
                if (!Schema::hasColumn('service_requests', 'boarding_room_id')) {
                    $table->unsignedBigInteger('boarding_room_id')->nullable()->after('check_out_date');
                }
                if (!Schema::hasColumn('service_requests', 'room_name')) {
                    $table->string('room_name')->nullable()->after('boarding_room_id');
                }
                if (!Schema::hasColumn('service_requests', 'room_type')) {
                    $table->string('room_type')->nullable()->after('room_name');
                }
                if (!Schema::hasColumn('service_requests', 'daily_rate')) {
                    $table->decimal('daily_rate', 10, 2)->nullable()->after('room_type');
                }
                if (!Schema::hasColumn('service_requests', 'total_days')) {
                    $table->integer('total_days')->nullable()->after('daily_rate');
                }
                if (!Schema::hasColumn('service_requests', 'total_amount')) {
                    $table->decimal('total_amount', 10, 2)->nullable()->after('total_days');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('service_requests')) {
            Schema::table('service_requests', function (Blueprint $table) {
                foreach ([
                    'total_amount',
                    'total_days',
                    'daily_rate',
                    'room_type',
                    'room_name',
                    'boarding_room_id',
                    'check_out_date',
                ] as $column) {
                    if (Schema::hasColumn('service_requests', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
