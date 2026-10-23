<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WardBed extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'ward',
        'is_isolation',
        'daily_rate',
        'status',
        'notes',
    ];

    protected $casts = [
        'is_isolation' => 'boolean',
        'daily_rate' => 'decimal:2',
    ];

    public const VALID_STATUSES = ['available', 'occupied', 'cleaning', 'maintenance'];

    public const WARDS = ['general', 'icu', 'isolation', 'recovery'];

    protected static function booted(): void
    {
        static::saving(function ($bed) {
            if (!in_array($bed->status, self::VALID_STATUSES, true)) {
                $bed->status = 'available';
            }
            if (!in_array($bed->ward, self::WARDS, true)) {
                $bed->ward = 'general';
            }
            if ($bed->ward === 'isolation') {
                $bed->is_isolation = true;
            }
        });
    }

    public function confinements()
    {
        return $this->hasMany(MedicalConfinement::class, 'ward_bed_id');
    }
}
