<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalaryLoan extends Model
{
    protected $fillable = [
        'user_id', 'employee_id', 'loan_type',
        'principal', 'balance', 'installment_amount',
        'start_period', 'end_period', 'status',
        'approved_by', 'approved_at', 'notes',
    ];

    protected $casts = [
        'principal'          => 'decimal:2',
        'balance'            => 'decimal:2',
        'installment_amount' => 'decimal:2',
        'start_period'       => 'date',
        'end_period'         => 'date',
        'approved_at'        => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
