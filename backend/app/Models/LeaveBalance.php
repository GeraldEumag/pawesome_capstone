<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveBalance extends Model
{
    protected $fillable = [
        'user_id', 'employee_id', 'leave_type', 'year',
        'total_days', 'used_days', 'remaining_days',
    ];

    protected $casts = [
        'total_days'     => 'decimal:1',
        'used_days'      => 'decimal:1',
        'remaining_days' => 'decimal:1',
        'year'           => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** Default entitlements by leave type. */
    public static function defaults(): array
    {
        return [
            'sick_leave'             => 15.0,
            'vacation_leave'         => 15.0,
            'emergency_leave'        => 3.0,
            'maternity_leave'        => 105.0,
            'paternity_leave'        => 7.0,
            'bereavement_leave'      => 3.0,
            'service_incentive_leave' => 5.0,
            'solo_parent_leave'      => 7.0,
            'magna_carta_leave'      => 60.0,
            'special_leave_benefit'  => 60.0,
            // unpaid_leave has no balance (unlimited)
        ];
    }

    /**
     * Seed leave_balances rows for a newly created user or employee.
     * @param int|null $userId
     * @param int|null $employeeId
     * @param int      $year
     */
    public static function seedForPerson(?int $userId, ?int $employeeId, int $year): void
    {
        foreach (static::defaults() as $type => $days) {
            $clause = $userId
                ? ['user_id' => $userId, 'employee_id' => null]
                : ['user_id' => null, 'employee_id' => $employeeId];

            static::firstOrCreate(
                array_merge($clause, ['leave_type' => $type, 'year' => $year]),
                ['total_days' => $days, 'used_days' => 0, 'remaining_days' => $days]
            );
        }
    }
}
