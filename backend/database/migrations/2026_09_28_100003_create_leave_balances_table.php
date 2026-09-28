<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->onDelete('cascade');
            $table->foreignId('employee_id')->nullable()->constrained()->onDelete('cascade');
            $table->enum('leave_type', [
                'sick_leave', 'vacation_leave', 'emergency_leave',
                'maternity_leave', 'paternity_leave', 'bereavement_leave',
                'service_incentive_leave', 'solo_parent_leave',
                'magna_carta_leave', 'special_leave_benefit',
            ]);
            $table->smallInteger('year');
            $table->decimal('total_days', 5, 1)->default(0);
            $table->decimal('used_days', 5, 1)->default(0);
            $table->decimal('remaining_days', 5, 1)->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'leave_type', 'year'], 'lb_user_type_year');
            $table->unique(['employee_id', 'leave_type', 'year'], 'lb_emp_type_year');
            $table->index(['year', 'leave_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_balances');
    }
};
