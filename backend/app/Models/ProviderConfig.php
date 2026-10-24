<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProviderConfig extends Model
{
    protected $fillable = [
        'provider',
        'reference_pattern',
        'min_length',
        'max_length',
        'reference_labels',
        'accepted_status_texts',
        'confusion_map',
        'active',
    ];

    protected $casts = [
        'reference_labels' => 'array',
        'accepted_status_texts' => 'array',
        'confusion_map' => 'array',
        'active' => 'boolean',
    ];
}
