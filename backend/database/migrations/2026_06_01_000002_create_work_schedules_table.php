<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('work_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->tinyInteger('day_of_week'); // 0=Sun, 1=Mon, ..., 6=Sat
            $table->time('shift_start')->nullable();
            $table->time('shift_end')->nullable();
            $table->boolean('is_off_day')->default(false);
            $table->timestamps();

            $table->unique(['user_id', 'day_of_week']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_schedules');
    }
};
