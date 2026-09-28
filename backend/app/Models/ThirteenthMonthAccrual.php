<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ThirteenthMonthAccrual extends Model
{
    protected $table = 'thirteenth_month_accruals';

    protected $fillable = [
        'user_id', 'employee_id', 'year',
        'jan_basic', 'feb_basic', 'mar_basic', 'apr_basic',
        'may_basic', 'jun_basic', 'jul_basic', 'aug_basic',
        'sep_basic', 'oct_basic', 'nov_basic', 'dec_basic',
        'total_accrued', 'paid_amount', 'paid_date', 'status',
    ];

    protected $casts = [
        'year'          => 'integer',
        'total_accrued' => 'decimal:2',
        'paid_amount'   => 'decimal:2',
        'paid_date'     => 'date',
        'jan_basic'     => 'decimal:2',
        'feb_basic'     => 'decimal:2',
        'mar_basic'     => 'decimal:2',
        'apr_basic'     => 'decimal:2',
        'may_basic'     => 'decimal:2',
        'jun_basic'     => 'decimal:2',
        'jul_basic'     => 'decimal:2',
        'aug_basic'     => 'decimal:2',
        'sep_basic'     => 'decimal:2',
        'oct_basic'     => 'decimal:2',
        'nov_basic'     => 'decimal:2',
        'dec_basic'     => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** Recalculate total_accrued as sum of monthly basics / 12. */
    public function recalculateTotal(): void
    {
        $months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                   'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        $sum = 0;
        foreach ($months as $m) {
            $sum += (float) ($this->{$m . '_basic'} ?? 0);
        }
        $this->total_accrued = round($sum / 12, 2);
        $this->save();
    }
}
