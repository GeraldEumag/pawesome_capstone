<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VisitEstimateLine extends Model
{
    protected $fillable = [
        'visit_estimate_id',
        'item_type',
        'description',
        'quantity',
        'unit_price',
        'line_total',
        'sort_order',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
    ];

    public function estimate(): BelongsTo
    {
        return $this->belongsTo(VisitEstimate::class, 'visit_estimate_id');
    }
}
