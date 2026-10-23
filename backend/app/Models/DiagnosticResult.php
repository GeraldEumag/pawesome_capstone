<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiagnosticResult extends Model
{
    protected $fillable = [
        'diagnostic_order_id',
        'findings',
        'attachment_path',
        'is_abnormal',
        'resulted_by',
    ];

    protected $casts = [
        'is_abnormal' => 'boolean',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(DiagnosticOrder::class, 'diagnostic_order_id');
    }
}
