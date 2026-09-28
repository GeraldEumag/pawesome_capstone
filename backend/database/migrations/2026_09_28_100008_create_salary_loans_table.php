<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('salary_loans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->onDelete('cascade');
            $table->foreignId('employee_id')->nullable()->constrained()->onDelete('cascade');
            $table->enum('loan_type', ['salary_loan', 'cash_advance'])->default('salary_loan');
            $table->decimal('principal', 12, 2);
            $table->decimal('balance', 12, 2);
            $table->decimal('installment_amount', 12, 2)
                  ->comment('Amount deducted per payroll cutoff');
            $table->date('start_period')
                  ->comment('First payroll period to deduct');
            $table->date('end_period')->nullable()
                  ->comment('Expected last deduction period (null = until paid)');
            $table->enum('status', ['active', 'paid', 'cancelled'])->default('active');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index(['employee_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('salary_loans');
    }
};
