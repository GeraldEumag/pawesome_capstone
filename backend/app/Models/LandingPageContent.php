<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LandingPageContent extends Model
{
    protected $fillable = [
        'section_key',
        'content_type',
        'content_data',
        'is_active',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'content_data' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeByKey($query, string $key)
    {
        return $query->where('section_key', $key);
    }

    public static function getByKey(string $key, ?array $default = null): ?array
    {
        $record = self::active()->byKey($key)->first();
        return $record?->content_data ?? $default;
    }
}
