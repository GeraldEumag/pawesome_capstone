<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicPaymentAccount extends Model
{
    protected $fillable = [
        'provider',
        'account_name',
        'account_last4',
        'active',
    ];

    protected $casts = [
        'active' => 'boolean',
    ];
}
