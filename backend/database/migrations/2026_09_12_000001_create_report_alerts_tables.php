<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_alerts', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type');
            $table->decimal('threshold', 12, 2)->default(0);
            $table->json('channels')->nullable();
            $table->string('frequency')->default('daily');
            $table->boolean('enabled')->default(true);
            $table->timestamps();
        });

        Schema::create('report_alert_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('report_alert_id')->constrained('report_alerts')->cascadeOnDelete();
            $table->string('title');
            $table->text('message');
            $table->json('context')->nullable();
            $table->timestamp('triggered_at')->useCurrent();
        });

        DB::table('report_alerts')->insert([
            [
                'name' => 'Revenue Drop Alert',
                'type' => 'revenue_drop',
                'threshold' => 15000,
                'channels' => json_encode(['email' => true, 'dashboard' => true]),
                'frequency' => 'immediate',
                'enabled' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Low Stock Alert',
                'type' => 'low_stock',
                'threshold' => 10,
                'channels' => json_encode(['email' => true, 'sms' => true]),
                'frequency' => 'daily',
                'enabled' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('report_alert_history');
        Schema::dropIfExists('report_alerts');
    }
};
