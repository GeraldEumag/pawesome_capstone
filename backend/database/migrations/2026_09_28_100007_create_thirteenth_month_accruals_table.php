<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('thirteenth_month_accruals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->onDelete('cascade');
            $table->foreignId('employee_id')->nullable()->constrained()->onDelete('cascade');
            $table->smallInteger('year');

            // Monthly basic salary used for accrual (filled as payroll runs)
            $table->decimal('jan_basic', 12, 2)->default(0);
            $table->decimal('feb_basic', 12, 2)->default(0);
            $table->decimal('mar_basic', 12, 2)->default(0);
            $table->decimal('apr_basic', 12, 2)->default(0);
            $table->decimal('may_basic', 12, 2)->default(0);
            $table->decimal('jun_basic', 12, 2)->default(0);
            $table->decimal('jul_basic', 12, 2)->default(0);
            $table->decimal('aug_basic', 12, 2)->default(0);
            $table->decimal('sep_basic', 12, 2)->default(0);
            $table->decimal('oct_basic', 12, 2)->default(0);
            $table->decimal('nov_basic', 12, 2)->default(0);
            $table->decimal('dec_basic', 12, 2)->default(0);

            $table->decimal('total_accrued', 12, 2)->default(0);
            $table->decimal('paid_amount', 12, 2)->default(0);
            $table->date('paid_date')->nullable();
            $table->enum('status', ['accruing', 'paid', 'partial'])->default('accruing');
            $table->timestamps();

            $table->unique(['user_id', 'year'], 'tma_user_year');
            $table->unique(['employee_id', 'year'], 'tma_emp_year');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('thirteenth_month_accruals');
    }
};
